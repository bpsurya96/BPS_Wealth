import { NextResponse } from "next/server";
import { sqlite } from "@/db";

export async function GET() {
  try {
    const row = sqlite.prepare("SELECT 1 AS ok").get() as { ok: number };
    return NextResponse.json({
      status: row?.ok === 1 ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
