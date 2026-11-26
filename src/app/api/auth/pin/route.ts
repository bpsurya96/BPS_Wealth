import { NextRequest, NextResponse } from "next/server";
import {
  clearPinSessionCookie,
  getSetting,
  hashPin,
  isPinUnlocked,
  setPinSessionCookie,
  setSetting,
} from "@/lib/auth";

export async function GET() {
  const status = await isPinUnlocked();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "verify") {
      const pin = String(body.pin ?? "").trim();
      const stored = getSetting("pin_hash", "");
      if (!stored || hashPin(pin) !== stored) {
        return NextResponse.json(
          { error: "Invalid PIN" },
          { status: 401 }
        );
      }
      await setPinSessionCookie(stored);
      return NextResponse.json({ unlocked: true });
    }

    if (action === "lock") {
      await clearPinSessionCookie();
      return NextResponse.json({ unlocked: false });
    }

    if (action === "set") {
      const { unlocked } = await isPinUnlocked();
      if (!unlocked) {
        return NextResponse.json({ error: "Locked" }, { status: 401 });
      }
      const pin = String(body.pin ?? "").trim();
      if (!/^\d{4,8}$/.test(pin)) {
        return NextResponse.json(
          { error: "PIN must be 4 to 8 digits" },
          { status: 400 }
        );
      }
      const hashed = hashPin(pin);
      setSetting("pin_hash", hashed);
      setSetting("pin_enabled", "true");
      await setPinSessionCookie(hashed);
      return NextResponse.json({ pinEnabled: true, unlocked: true });
    }

    if (action === "disable") {
      const { unlocked } = await isPinUnlocked();
      if (!unlocked) {
        return NextResponse.json({ error: "Locked" }, { status: 401 });
      }
      setSetting("pin_enabled", "false");
      await clearPinSessionCookie();
      return NextResponse.json({ pinEnabled: false, unlocked: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Auth error" },
      { status: 500 }
    );
  }
}
