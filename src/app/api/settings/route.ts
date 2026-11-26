import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getOllamaStatus } from "@/lib/ai";
import { getSetting, requireUnlocked, setSetting } from "@/lib/auth";
import { getEnvConfig } from "@/lib/env";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const rows = db.select().from(appSettings).all();
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.key === "pin_hash") continue;
    map[r.key] = r.value;
  }
  const envCfg = getEnvConfig();
  const ollama = await getOllamaStatus();

  return NextResponse.json({
    usdInrRate: Number.parseFloat(getSetting("usd_inr_rate", "84.5")),
    emergencyFundTarget: Number.parseFloat(
      getSetting("emergency_fund_target", "600000")
    ),
    pinEnabled: getSetting("pin_enabled", "false") === "true",
    lastBackupAt: getSetting("last_backup_at", ""),
    lastNavRefreshAt: getSetting("last_nav_refresh_at", ""),
    aiConfig: {
      configuredProvider: envCfg.configuredProvider,
      activeProvider: envCfg.activeProvider,
      ollamaBaseUrl: envCfg.ollamaBaseUrl,
      ollamaChatModel: envCfg.ollamaChatModel,
      ollamaPlanningModel: envCfg.ollamaPlanningModel,
      ollamaVisionModel: envCfg.ollamaVisionModel,
      ollamaEmbedModel: envCfg.ollamaEmbedModel,
      ossBaseUrl: envCfg.ossBaseUrl,
      ossModel: envCfg.ossModel,
      ollamaReachable: ollama.reachable,
      installedModels: ollama.installedModels,
    },
    raw: map,
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  if (body.usdInrRate !== undefined) {
    const rate = Number(body.usdInrRate);
    if (Number.isFinite(rate) && rate > 0) {
      setSetting("usd_inr_rate", String(rate));
    }
  }
  if (body.emergencyFundTarget !== undefined) {
    const target = Number(body.emergencyFundTarget);
    if (Number.isFinite(target) && target >= 0) {
      setSetting("emergency_fund_target", String(target));
    }
  }
  return NextResponse.json({ ok: true });
}
