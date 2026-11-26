import { NextRequest, NextResponse } from "next/server";
import {
  askPersonalAssistant,
  buildPortfolioSnapshot,
  generateDeterministicInsights,
  getOllamaStatus,
} from "@/lib/ai";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { getEnvConfig } from "@/lib/env";
import { handleApiError } from "@/lib/errors";
import { aiChatSchema } from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
    const scope = req.nextUrl.searchParams.get("scope") || "overview";
    const cfg = getEnvConfig();
    const snap = buildPortfolioSnapshot();
    const insights = generateDeterministicInsights(snap, scope);
    const ollama = await getOllamaStatus();

    return NextResponse.json({
      activeProvider: cfg.activeProvider,
      isRemoteAiEndpoint: cfg.isRemoteAiEndpoint,
      ollamaReachable: ollama.reachable,
      installedModels: ollama.installedModels,
      models: {
        chat: cfg.ollamaChatModel,
        planning: cfg.ollamaPlanningModel,
        vision: cfg.ollamaVisionModel,
        embed: cfg.ollamaEmbedModel,
      },
      insights,
    });
  } catch (err) {
    return handleApiError(err, "ai.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = aiChatSchema.parse(await req.json());
    const result = await askPersonalAssistant(
      parsed.prompt,
      parsed.context,
      parsed.mode,
      {
        allowRemoteEgress: parsed.allowRemoteEgress,
        signal: req.signal,
      }
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "ai.POST");
  }
}
