import crypto from "crypto";
import path from "path";

export type AiProvider = "ollama" | "oss_openai" | "local";

const INSECURE_SECRETS = new Set([
  "",
  "bps-local-tracker-secret-v1",
  "change-this-to-a-random-local-secret",
  "changeme",
  "secret",
  "default",
]);

const globalForEnv = globalThis as unknown as {
  devEphemeralPinSecret?: string;
};

export interface AppEnvConfig {
  nodeEnv: string;
  isProduction: boolean;
  isTest: boolean;
  dbPath: string;
  docsDir: string;
  backupsDir: string;
  pinSecret: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
  ownerSetupToken: string;
  requireAuthInDev: boolean;
  sqlStudioEnabled: boolean;
  sqlStudioAllowWrites: boolean;
  configuredProvider: AiProvider;
  activeProvider: AiProvider;
  ollamaBaseUrl: string;
  ollamaChatModel: string;
  ollamaPlanningModel: string;
  ollamaVisionModel: string;
  ollamaEmbedModel: string;
  ossBaseUrl: string;
  ossApiKey: string;
  ossModel: string;
  ossVisionModel: string;
  isRemoteAiEndpoint: boolean;
  aiTimeoutMs: number;
  maxBackupsRetained: number;
}

function isLocalhostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "ollama" ||
      parsed.hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

export function resolvePinSecret(isProduction: boolean): string {
  const configured = (process.env.BPS_PIN_SECRET || "").trim();

  if (isProduction) {
    if (INSECURE_SECRETS.has(configured) || configured.length < 32) {
      throw new Error(
        "FATAL: BPS_PIN_SECRET must be set to a cryptographically random string of at least 32 characters in production."
      );
    }
    return configured;
  }

  if (configured && !INSECURE_SECRETS.has(configured) && configured.length >= 16) {
    return configured;
  }

  if (!globalForEnv.devEphemeralPinSecret) {
    globalForEnv.devEphemeralPinSecret = crypto.randomBytes(32).toString("hex");
  }
  return globalForEnv.devEphemeralPinSecret;
}

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV === "production") {
    resolvePinSecret(true);
  }
}

export function getEnvConfig(): AppEnvConfig {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const isTest = nodeEnv === "test" || Boolean(process.env.VITEST);

  const dbPath = path.resolve(
    process.cwd(),
    process.env.BPS_DB_PATH || "./data/bps_income.db"
  );
  const docsDir = path.resolve(
    process.cwd(),
    process.env.BPS_DOCS_DIR || "./data/documents"
  );
  const backupsDir = path.resolve(
    process.cwd(),
    process.env.BPS_BACKUPS_DIR || path.join(path.dirname(dbPath), "backups")
  );

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
  const ossApiKey = process.env.OSS_OPENAI_API_KEY?.trim() || "";
  const ossModel =
    process.env.OSS_OPENAI_MODEL?.trim() || "Qwen/Qwen2.5-7B-Instruct";
  const ossVisionModel =
    process.env.OSS_OPENAI_VISION_MODEL?.trim() ||
    "Qwen/Qwen2.5-VL-7B-Instruct";

  const activeEndpoint =
    configuredProvider === "oss_openai" ? ossBaseUrl : ollamaBaseUrl;
  const isRemoteAiEndpoint =
    configuredProvider !== "local" && !isLocalhostUrl(activeEndpoint);

  const cookieSecureEnv = process.env.BPS_COOKIE_SECURE?.trim().toLowerCase();
  const cookieSecure =
    cookieSecureEnv === "true"
      ? true
      : cookieSecureEnv === "false"
        ? false
        : isProduction;

  const sessionTtlRaw = Number.parseInt(
    process.env.BPS_SESSION_TTL_HOURS || "12",
    10
  );
  const sessionTtlHours =
    Number.isFinite(sessionTtlRaw) && sessionTtlRaw > 0 && sessionTtlRaw <= 168
      ? sessionTtlRaw
      : 12;

  const aiTimeoutRaw = Number.parseInt(
    process.env.AI_TIMEOUT_MS || "120000",
    10
  );
  const aiTimeoutMs =
    Number.isFinite(aiTimeoutRaw) && aiTimeoutRaw >= 2000 && aiTimeoutRaw <= 300000
      ? aiTimeoutRaw
      : 120000;

  const maxBackupsRaw = Number.parseInt(
    process.env.BPS_MAX_BACKUPS || "15",
    10
  );
  const maxBackupsRetained =
    Number.isFinite(maxBackupsRaw) && maxBackupsRaw >= 1 && maxBackupsRaw <= 200
      ? maxBackupsRaw
      : 15;

  const sqlStudioEnabledEnv =
    process.env.SQL_STUDIO_ENABLED?.trim().toLowerCase();
  const sqlStudioEnabled =
    sqlStudioEnabledEnv === "true"
      ? true
      : sqlStudioEnabledEnv === "false"
        ? false
        : true; // Always read-only in production unless writes explicitly allowed below

  const sqlStudioAllowWrites =
    !isProduction &&
    process.env.SQL_STUDIO_ALLOW_WRITES?.trim().toLowerCase() === "true";

  return {
    nodeEnv,
    isProduction,
    isTest,
    dbPath,
    docsDir,
    backupsDir,
    pinSecret: resolvePinSecret(isProduction),
    cookieSecure,
    sessionTtlHours,
    ownerSetupToken: (process.env.BPS_OWNER_SETUP_TOKEN || "").trim(),
    requireAuthInDev:
      process.env.BPS_REQUIRE_AUTH_IN_DEV?.trim().toLowerCase() === "true",
    sqlStudioEnabled,
    sqlStudioAllowWrites,
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
    isRemoteAiEndpoint,
    aiTimeoutMs,
    maxBackupsRetained,
  };
}
