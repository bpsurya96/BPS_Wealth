import crypto from "crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";

const COOKIE_NAME = "bps_pin_session";
const SECRET = process.env.BPS_PIN_SECRET || "bps-local-tracker-secret-v1";

export function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(`bps:${pin}`).digest("hex");
}

function signSession(pinHash: string): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update(pinHash)
    .digest("hex");
}

export function getSetting(key: string, fallback = ""): string {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get();
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  const now = new Date().toISOString();
  db.insert(appSettings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export async function isPinUnlocked(): Promise<{
  pinEnabled: boolean;
  unlocked: boolean;
}> {
  const pinEnabled = getSetting("pin_enabled", "false") === "true";
  const pinHash = getSetting("pin_hash", "");
  if (!pinEnabled || !pinHash) {
    return { pinEnabled: false, unlocked: true };
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return {
    pinEnabled: true,
    unlocked: token === signSession(pinHash),
  };
}

export async function setPinSessionCookie(pinHash: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signSession(pinHash), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
}

export async function clearPinSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function requireUnlocked(): Promise<boolean> {
  const status = await isPinUnlocked();
  return status.unlocked;
}

