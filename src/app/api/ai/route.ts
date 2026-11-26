import { NextRequest, NextResponse } from "next/server";
import { requireUnlocked } from "@/lib/auth";
import {
  askPersonalAssistant,
  buildPortfolioSnapshot,
  generateDeterministicInsights,
  getOllamaStatus,
} from "@/lib/ai";
import { getEnvConfig } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const scope = req.nextUrl.searchParams.get("scope") || "overview";
  const cfg = getEnvConfig();
  const snap = buildPortfolioSnapshot();
  const insights = generateDeterministicInsights(snap, scope);
  const ollama = await getOllamaStatus();

  return NextResponse.json({
    activeProvider: cfg.activeProvider,
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
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  const prompt = String(body.prompt || "").trim();
  const pageContext = String(body.context || "overview");
  const mode = body.mode === "planning" ? "planning" : "chat";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  const result = await askPersonalAssistant(prompt, pageContext, mode);
  return NextResponse.json(result);
}
