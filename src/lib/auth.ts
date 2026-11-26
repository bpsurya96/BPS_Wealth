import argon2 from "argon2";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";
import { eq, lt } from "drizzle-orm";
import { db, paths } from "@/db";
import { appSettings, authRateLimits, authSessions } from "@/db/schema";
import { getEnvConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging";

const COOKIE_NAME = "bps_session";
const SETUP_TOKEN_FILENAME = ".owner-setup-token";

const globalForBootstrap = globalThis as unknown as {
  loggedSetupHint?: boolean;
};

export interface AuthStatus {
  pinEnabled: boolean;
  setupRequired: boolean;
  unlocked: boolean;
  role: "owner" | "dev-anonymous" | null;
  isProduction: boolean;
}

export async function hashPin(pin: string): Promise<string> {
  return argon2.hash(pin, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPinHash(
  storedHash: string,
  pin: string
): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith("$argon2id$")) {
    return false;
  }
  try {
    return await argon2.verify(storedHash, pin);
  } catch {
    return false;
  }
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function signSessionPayload(sessionId: string, tokenSecret: string): string {
  const cfg = getEnvConfig();
  return crypto
    .createHmac("sha256", cfg.pinSecret)
    .update(`${sessionId}.${tokenSecret}`)
    .digest("hex");
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export function getSetting(key: string, fallback = ""): string {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  const now = new Date().toISOString();
  db.insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

/**
 * Ensures a one-time setup token exists when running in production without an initialized PIN.
 * Never returns the token via HTTP; reads from BPS_OWNER_SETUP_TOKEN or writes to a 0600 file.
 */
export function ensureOwnerSetupToken(): string {
  const cfg = getEnvConfig();
  if (cfg.ownerSetupToken.length >= 16) {
    return cfg.ownerSetupToken;
  }
  const tokenPath = path.join(paths.DATA_DIR, SETUP_TOKEN_FILENAME);
  if (fs.existsSync(tokenPath)) {
    return fs.readFileSync(tokenPath, "utf-8").trim();
  }
  const generated = crypto.randomBytes(24).toString("base64url");
  if (!fs.existsSync(paths.DATA_DIR)) {
    fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(tokenPath, generated + "\n", { mode: 0o600 });
  if (!globalForBootstrap.loggedSetupHint) {
    globalForBootstrap.loggedSetupHint = true;
    logger.warn("owner_setup_token_generated", {
      note: "First-run setup required. Read the setup token from data/.owner-setup-token on the host or set BPS_OWNER_SETUP_TOKEN.",
    });
  }
  return generated;
}

export function verifyOwnerSetupToken(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  const expected = ensureOwnerSetupToken();
  const a = crypto.createHash("sha256").update(trimmed).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function clearOwnerSetupTokenFile(): void {
  const tokenPath = path.join(paths.DATA_DIR, SETUP_TOKEN_FILENAME);
  if (fs.existsSync(tokenPath)) {
    try {
      fs.unlinkSync(tokenPath);
    } catch {
      // ignore
    }
  }
}

export async function createSession(role: "owner" = "owner"): Promise<{
  cookieValue: string;
  expiresAt: Date;
}> {
  const cfg = getEnvConfig();
  const sessionId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(secret);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + cfg.sessionTtlHours * 60 * 60 * 1000
  );

  // Clean up expired sessions opportunistically
  db.delete(authSessions)
    .where(lt(authSessions.expiresAt, now.toISOString()))
    .run();

  db.insert(authSessions)
    .values({
      id: sessionId,
      tokenHash,
      role,
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    })
    .run();

  const sig = signSessionPayload(sessionId, secret);
  return {
    cookieValue: `${sessionId}.${secret}.${sig}`,
    expiresAt,
  };
}

export async function setPinSessionCookie(): Promise<void> {
  const cfg = getEnvConfig();
  const { cookieValue, expiresAt } = await createSession("owner");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.cookieSecure,
    path: "/",
    expires: expiresAt,
  });
}

export async function clearPinSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (raw) {
    const [sessionId] = raw.split(".");
    if (sessionId) {
      db.delete(authSessions).where(eq(authSessions.id, sessionId)).run();
    }
  }
  cookieStore.delete(COOKIE_NAME);
}

export function invalidateAllSessions(): void {
  db.delete(authSessions).run();
}

async function validateSessionCookie(): Promise<{
  valid: boolean;
  role: "owner" | null;
}> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return { valid: false, role: null };

  const parts = raw.split(".");
  if (parts.length !== 3) return { valid: false, role: null };
  const [sessionId, secret, sig] = parts;
  if (!sessionId || !secret || !sig) return { valid: false, role: null };

  const expectedSig = signSessionPayload(sessionId, secret);
  if (!timingSafeHexEqual(sig, expectedSig)) {
    return { valid: false, role: null };
  }

  const row = db
    .select()
    .from(authSessions)
    .where(eq(authSessions.id, sessionId))
    .get();
  if (!row) return { valid: false, role: null };

  const now = new Date();
  if (new Date(row.expiresAt).getTime() <= now.getTime()) {
    db.delete(authSessions).where(eq(authSessions.id, sessionId)).run();
    return { valid: false, role: null };
  }

  const candidateHash = sha256Hex(secret);
  if (!timingSafeHexEqual(row.tokenHash, candidateHash)) {
    return { valid: false, role: null };
  }

  db.update(authSessions)
    .set({ lastSeenAt: now.toISOString() })
    .where(eq(authSessions.id, sessionId))
    .run();

  return { valid: true, role: "owner" };
}

export async function isPinUnlocked(): Promise<AuthStatus> {
  const cfg = getEnvConfig();
  const pinHash = getSetting("pin_hash", "");
  const pinEnabledSetting = getSetting("pin_enabled", "false") === "true";
  const hasValidHash = pinHash.startsWith("$argon2id$");

  // Production NEVER silently disables authentication.
  if (cfg.isProduction || cfg.requireAuthInDev) {
    if (!hasValidHash) {
      ensureOwnerSetupToken();
      return {
        pinEnabled: true,
        setupRequired: true,
        unlocked: false,
        role: null,
        isProduction: cfg.isProduction,
      };
    }
    const session = await validateSessionCookie();
    return {
      pinEnabled: true,
      setupRequired: false,
      unlocked: session.valid,
      role: session.valid ? session.role : null,
      isProduction: cfg.isProduction,
    };
  }

  // Local development convenience when PIN has not been enabled
  if (!pinEnabledSetting || !hasValidHash) {
    return {
      pinEnabled: false,
      setupRequired: false,
      unlocked: true,
      role: "dev-anonymous",
      isProduction: false,
    };
  }

  const session = await validateSessionCookie();
  return {
    pinEnabled: true,
    setupRequired: false,
    unlocked: session.valid,
    role: session.valid ? session.role : null,
    isProduction: false,
  };
}

export async function requireUnlocked(): Promise<boolean> {
  const status = await isPinUnlocked();
  return status.unlocked;
}

export async function requireAdminSession(): Promise<AuthStatus> {
  const status = await isPinUnlocked();
  if (!status.unlocked) {
    throw new AppError("Authentication required", 401, "LOCKED");
  }
  return status;
}

export function checkPinRateLimit(clientKey: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const row = db
    .select()
    .from(authRateLimits)
    .where(eq(authRateLimits.key, clientKey))
    .get();
  if (!row || !row.lockedUntil) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const lockedMs = new Date(row.lockedUntil).getTime();
  const nowMs = Date.now();
  if (Number.isFinite(lockedMs) && lockedMs > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((lockedMs - nowMs) / 1000),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordPinFailure(clientKey: string): {
  failedAttempts: number;
  retryAfterSeconds: number;
} {
  const existing = db
    .select()
    .from(authRateLimits)
    .where(eq(authRateLimits.key, clientKey))
    .get();
  const attempts = (existing?.failedAttempts ?? 0) + 1;
  let lockoutSeconds = 0;
  if (attempts >= 10) {
    lockoutSeconds = 30 * 60; // 30 min
  } else if (attempts >= 5) {
    lockoutSeconds = 5 * 60; // 5 min
  } else if (attempts >= 3) {
    lockoutSeconds = Math.min(30, 2 ** (attempts - 2)); // 2s, 4s...
  }

  const now = new Date();
  const lockedUntil =
    lockoutSeconds > 0
      ? new Date(now.getTime() + lockoutSeconds * 1000).toISOString()
      : "";

  db.insert(authRateLimits)
    .values({
      key: clientKey,
      failedAttempts: attempts,
      lockedUntil,
      lastAttemptAt: now.toISOString(),
    })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        failedAttempts: attempts,
        lockedUntil,
        lastAttemptAt: now.toISOString(),
      },
    })
    .run();

  return { failedAttempts: attempts, retryAfterSeconds: lockoutSeconds };
}

export function resetPinRateLimit(clientKey: string): void {
  db.delete(authRateLimits).where(eq(authRateLimits.key, clientKey)).run();
}
