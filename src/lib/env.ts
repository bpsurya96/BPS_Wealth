import path from "path";

export type AiProvider = "ollama" | "oss_openai" | "local";

export function getEnvConfig() {
  const providerRaw = (process.env.AI_PROVIDER || "ollama").toLowerCase();
  const configuredProvider: AiProvider =
    providerRaw === "oss_openai" || providerRaw === "local"
      ? providerRaw
      : "ollama";

  const ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";
  const ollamaChatModel =
    process.env.OLLAMA_CHAT_MODEL?.trim() || "qwen2.5:7b";
  const ollamaPlanningModel =
    process.env.OLLAMA_PLANNING_MODEL?.trim() || ollamaChatModel;
  const ollamaVisionModel =
    process.env.OLLAMA_VISION_MODEL?.trim() || "qwen2.5vl:7b";
  const ollamaEmbedModel =
    process.env.OLLAMA_EMBED_MODEL?.trim() || "qwen3-embedding:0.6b";

  const ossBaseUrl =
    process.env.OSS_OPENAI_BASE_URL?.trim() || "http://localhost:8000/v1";
  const ossApiKey = process.env.OSS_OPENAI_API_KEY?.trim() || "local-oss-token";
  const ossModel =
    process.env.OSS_OPENAI_MODEL?.trim() || "Qwen/Qwen2.5-7B-Instruct";
  const ossVisionModel =
    process.env.OSS_OPENAI_VISION_MODEL?.trim() ||
    "Qwen/Qwen2.5-VL-7B-Instruct";

  return {
    dbPath: path.resolve(
      process.cwd(),
      process.env.BPS_DB_PATH || "./data/bps_income.db"
    ),
    docsDir: path.resolve(
      process.cwd(),
      process.env.BPS_DOCS_DIR || "./data/documents"
    ),
    configuredProvider,
    activeProvider: configuredProvider,
    ollamaBaseUrl,
    ollamaChatModel,
    ollamaPlanningModel,
    ollamaVisionModel,
    ollamaEmbedModel,
    ossBaseUrl,
    ossApiKey,
    ossModel,
    ossVisionModel,
  };
}
