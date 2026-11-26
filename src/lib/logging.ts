type LogLevel = "info" | "warn" | "error";

const SENSITIVE_KEY_PATTERN =
  /^(pin|pinHash|pin_hash|password|secret|token|authorization|cookie|apiKey|api_key|ossApiKey|amount|inhandAmount|grossAmount|tdsAmount|investedAmount|currentValue|currentBalance|principalSanctioned|emiAmount|rentAmount|salaryAmount|premiumAmount|netWorth|totalAssets|totalLiabilities|holdingsSummary|loansSummary|policiesSummary|snapshots|incomes|holdings|transactions|fileContent|base64Image|textContent)$/i;

function sanitizeValue(key: string, value: unknown, depth = 0): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return "[REDACTED]";
  }
  if (depth > 4) return "[TRUNCATED]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 500) {
      return `${value.slice(0, 120)}...[len=${value.length}]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(k, v, depth + 1);
    }
    return out;
  }
  return value;
}

function writeLog(
  level: LogLevel,
  event: string,
  meta?: Record<string, unknown>
) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(meta ? (sanitizeValue("root", meta) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else if (process.env.NODE_ENV !== "test") {
    console.info(line);
  }
}

export const logger = {
  info: (event: string, meta?: Record<string, unknown>) =>
    writeLog("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) =>
    writeLog("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) =>
    writeLog("error", event, meta),
};
