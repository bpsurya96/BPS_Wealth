import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { getOllamaStatus } from "@/lib/ai";
import { getSetting, requireAdminSession, setSetting } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getEnvConfig } from "@/lib/env";
import { handleApiError } from "@/lib/errors";
import { updateSettingsSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminSession();
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
      isProduction: envCfg.isProduction,
      lastBackupAt: getSetting("last_backup_at", ""),
      lastNavRefreshAt: getSetting("last_nav_refresh_at", ""),
      aiConfig: {
        configuredProvider: envCfg.configuredProvider,
        activeProvider: envCfg.activeProvider,
        isRemoteAiEndpoint: envCfg.isRemoteAiEndpoint,
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
  } catch (err) {
    return handleApiError(err, "settings.GET");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = updateSettingsSchema.parse(await req.json());
    if (parsed.usdInrRate !== undefined) {
      setSetting("usd_inr_rate", String(parsed.usdInrRate));
    }
    if (parsed.emergencyFundTarget !== undefined) {
      setSetting("emergency_fund_target", String(parsed.emergencyFundTarget));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "settings.PATCH");
  }
}
