import { NextRequest, NextResponse } from "next/server";
import {
  checkPinRateLimit,
  clearOwnerSetupTokenFile,
  clearPinSessionCookie,
  getSetting,
  hashPin,
  invalidateAllSessions,
  isPinUnlocked,
  recordPinFailure,
  resetPinRateLimit,
  setPinSessionCookie,
  setSetting,
  verifyOwnerSetupToken,
  verifyPinHash,
} from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getEnvConfig } from "@/lib/env";
import { AppError, handleApiError } from "@/lib/errors";
import { logger } from "@/lib/logging";
import { pinActionSchema } from "@/lib/validation";

function getClientBucket(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const ip = fwd || realIp || "local";
  return `pin:${ip}`;
}

export async function GET() {
  try {
    const status = await isPinUnlocked();
    return NextResponse.json({
      pinEnabled: status.pinEnabled,
      setupRequired: status.setupRequired,
      unlocked: status.unlocked,
      isProduction: status.isProduction,
    });
  } catch (err) {
    return handleApiError(err, "auth.pin.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    const body = await req.json();
    const parsed = pinActionSchema.parse(body);
    const clientKey = getClientBucket(req);
    const cfg = getEnvConfig();

    if (parsed.action === "lock") {
      await clearPinSessionCookie();
      return NextResponse.json({ unlocked: false });
    }

    if (parsed.action === "verify") {
      const rate = checkPinRateLimit(clientKey);
      if (!rate.allowed) {
        return NextResponse.json(
          {
            error: `Too many failed PIN attempts. Try again in ${rate.retryAfterSeconds}s.`,
            retryAfterSeconds: rate.retryAfterSeconds,
          },
          {
            status: 429,
            headers: { "Retry-After": String(rate.retryAfterSeconds) },
          }
        );
      }

      const stored = getSetting("pin_hash", "");
      const ok = await verifyPinHash(stored, parsed.pin);
      if (!ok) {
        const failure = recordPinFailure(clientKey);
        logger.warn("pin_verify_failed", {
          attempts: failure.failedAttempts,
          retryAfterSeconds: failure.retryAfterSeconds,
        });
        return NextResponse.json(
          {
            error:
              failure.retryAfterSeconds > 0
                ? `Invalid PIN. Locked for ${failure.retryAfterSeconds}s.`
                : "Invalid PIN",
            retryAfterSeconds: failure.retryAfterSeconds,
          },
          { status: 401 }
        );
      }

      resetPinRateLimit(clientKey);
      await setPinSessionCookie();
      return NextResponse.json({ unlocked: true, setupRequired: false });
    }

    if (parsed.action === "setup") {
      const rate = checkPinRateLimit(`setup:${clientKey}`);
      if (!rate.allowed) {
        return NextResponse.json(
          {
            error: `Too many failed setup attempts. Try again in ${rate.retryAfterSeconds}s.`,
          },
          {
            status: 429,
            headers: { "Retry-After": String(rate.retryAfterSeconds) },
          }
        );
      }

      const existingHash = getSetting("pin_hash", "");
      if (existingHash.startsWith("$argon2id$")) {
        throw new AppError(
          "Owner PIN is already initialized",
          409,
          "ALREADY_INITIALIZED"
        );
      }

      if (!verifyOwnerSetupToken(parsed.setupToken)) {
        recordPinFailure(`setup:${clientKey}`);
        logger.warn("owner_setup_invalid_token", {});
        throw new AppError("Invalid owner setup token", 403, "INVALID_SETUP_TOKEN");
      }

      resetPinRateLimit(`setup:${clientKey}`);
      const hashed = await hashPin(parsed.pin);
      setSetting("pin_hash", hashed);
      setSetting("pin_enabled", "true");
      clearOwnerSetupTokenFile();
      await setPinSessionCookie();
      logger.info("owner_setup_completed", {});
      return NextResponse.json({
        pinEnabled: true,
        setupRequired: false,
        unlocked: true,
      });
    }

    if (parsed.action === "set") {
      const status = await isPinUnlocked();
      if (!status.unlocked) {
        throw new AppError("Locked", 401, "LOCKED");
      }

      const existingHash = getSetting("pin_hash", "");
      if (existingHash.startsWith("$argon2id$")) {
        if (!parsed.currentPin) {
          throw new AppError(
            "Current PIN is required to update PIN",
            400,
            "CURRENT_PIN_REQUIRED"
          );
        }
        const matches = await verifyPinHash(existingHash, parsed.currentPin);
        if (!matches) {
          throw new AppError(
            "Current PIN is incorrect",
            401,
            "INVALID_CURRENT_PIN"
          );
        }
      }

      const hashed = await hashPin(parsed.pin);
      invalidateAllSessions();
      setSetting("pin_hash", hashed);
      setSetting("pin_enabled", "true");
      clearOwnerSetupTokenFile();
      await setPinSessionCookie();
      logger.info("pin_updated", {});
      return NextResponse.json({
        pinEnabled: true,
        setupRequired: false,
        unlocked: true,
      });
    }

    if (parsed.action === "disable") {
      if (cfg.isProduction || cfg.requireAuthInDev) {
        throw new AppError(
          "PIN authentication cannot be disabled in production",
          403,
          "PIN_REQUIRED_IN_PROD"
        );
      }
      const status = await isPinUnlocked();
      if (!status.unlocked) {
        throw new AppError("Locked", 401, "LOCKED");
      }
      const existingHash = getSetting("pin_hash", "");
      if (existingHash.startsWith("$argon2id$")) {
        if (!parsed.currentPin) {
          throw new AppError(
            "Current PIN is required to disable PIN lock",
            400,
            "CURRENT_PIN_REQUIRED"
          );
        }
        const matches = await verifyPinHash(existingHash, parsed.currentPin);
        if (!matches) {
          throw new AppError(
            "Current PIN is incorrect",
            401,
            "INVALID_CURRENT_PIN"
          );
        }
      }

      invalidateAllSessions();
      setSetting("pin_enabled", "false");
      setSetting("pin_hash", "");
      await clearPinSessionCookie();
      return NextResponse.json({ pinEnabled: false, unlocked: true });
    }

    throw new AppError("Unknown auth action", 400, "UNKNOWN_ACTION");
  } catch (err) {
    return handleApiError(err, "auth.pin.POST");
  }
}
