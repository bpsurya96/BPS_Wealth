import { ZodSchema } from "zod";
import { getEnvConfig } from "./env";
import { AppError } from "./errors";
import { logger } from "./logging";
import {
  aiExtractedIncomeSchema,
  aiExtractedInsuranceSchema,
  aiExtractedInvestmentSchema,
  aiExtractedLoanSchema,
  aiExtractedReceiptOrBankSchema,
} from "./validation";
import { getDashboardPortfolioData } from "./../services/portfolio";
import { formatCompactINR, formatINR, formatPercent } from "./utils";

export type ExtractionTargetType =
  | "insurance"
  | "investment"
  | "income"
  | "loan"
  | "receipt"
  | "bank_statement"
  | "financial_document";

export interface PortfolioSnapshot {
  usdInrRate: number;
  netWorthInr: number;
  totalAssetsInr: number;
  totalPortfolioInr: number;
  otherFinancialAssetsInr: number;
  physicalAssetsInr: number;
  totalInvestedInr: number;
  totalGainInr: number;
  portfolioXirr: number | null;
  totalLiabilitiesInr: number;
  totalPlannedSipInr: number;
  emergencyInvestedInr: number;
  emergencyTargetInr: number;
  mainIncomeTotal: number;
  rentalIncomeTotal: number;
  dividendIncomeTotal: number;
  otherIncomeTotal: number;
  passiveIncomeTotal: number;
  totalAnnualInsurancePremiumInr: number;
  holdingsSummary: Array<{
    name: string;
    assetClass: string;
    investedInr: number;
    currentInr: number;
    plannedSipInr: number;
    xirr: number | null;
  }>;
  loansSummary: Array<{
    name: string;
    status: string;
    currentBalance: number;
    emiAmount: number;
  }>;
  policiesSummary: Array<{
    name: string;
    policyType: string;
    premiumAmount: number;
    premiumFrequency: string;
    annualizedPremium: number;
    coverAmount: string | null;
    expiryDate: string | null;
    docCount: number;
  }>;
  goalsSummary: Array<{
    name: string;
    targetAmount: number;
    currentAmount: number;
  }>;
}

export function buildPortfolioSnapshot(): PortfolioSnapshot {
  const dash = getDashboardPortfolioData();
  const m = dash.metrics;

  return {
    usdInrRate: dash.usdInrRate,
    netWorthInr: m.netWorthInr,
    totalAssetsInr: m.totalAssetsInr,
    totalPortfolioInr: m.totalPortfolioInr,
    otherFinancialAssetsInr: m.otherFinancialAssetsInr,
    physicalAssetsInr: m.physicalAssetsInr,
    totalInvestedInr: m.totalInvestedInr,
    totalGainInr: m.totalGainInr,
    portfolioXirr: m.portfolioXirr,
    totalLiabilitiesInr: m.totalLiabilitiesInr,
    totalPlannedSipInr: m.totalPlannedSipInr,
    emergencyInvestedInr: m.emergencyInvestedInr,
    emergencyTargetInr: m.emergencyTargetInr,
    mainIncomeTotal: m.mainIncomeTotal,
    rentalIncomeTotal: m.rentalIncomeTotal,
    dividendIncomeTotal: m.dividendIncomeTotal,
    otherIncomeTotal: m.otherIncomeTotal,
    passiveIncomeTotal: m.passiveIncomeTotal,
    totalAnnualInsurancePremiumInr: m.totalAnnualInsurancePremiumInr,
    holdingsSummary: dash.holdingsSummary,
    loansSummary: dash.loansList.map((l) => ({
      name: l.name,
      status: l.status,
      currentBalance: l.currentBalance,
      emiAmount: l.emiAmount,
    })),
    policiesSummary: dash.policiesList.map((p) => ({
      name: p.name,
      policyType: p.policyType,
      premiumAmount: p.premiumAmount,
      premiumFrequency: p.premiumFrequency,
      annualizedPremium: p.annualizedPremium,
      coverAmount: p.coverAmount,
      expiryDate: p.expiryDate,
      docCount: p.docCount,
    })),
    goalsSummary: dash.goals.map((g) => ({
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
    })),
  };
}

/**
 * Strips potentially identifying free-text names before transmitting to a remote AI endpoint.
 */
function buildMinimizedSnapshot(snap: PortfolioSnapshot, minimizePii: boolean) {
  if (!minimizePii) return snap;
  return {
    ...snap,
    holdingsSummary: snap.holdingsSummary.map((h, i) => ({
      ...h,
      name: `Holding_${i + 1} (${h.assetClass})`,
    })),
    loansSummary: snap.loansSummary.map((l, i) => ({
      ...l,
      name: `Loan_${i + 1}`,
    })),
    policiesSummary: snap.policiesSummary.map((p, i) => ({
      ...p,
      name: `Policy_${i + 1}`,
    })),
    goalsSummary: snap.goalsSummary.map((g, i) => ({
      ...g,
      name: `Goal_${i + 1}`,
    })),
  };
}

async function fetchWithTimeoutAndRetry(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; maxRetries: number; externalSignal?: AbortSignal }
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    if (options.externalSignal?.aborted) {
      throw new AppError("AI request cancelled", 499, "REQUEST_ABORTED");
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.externalSignal?.addEventListener("abort", onExternalAbort, {
      once: true,
    });

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (options.externalSignal?.aborted) {
        throw new AppError("AI request cancelled", 499, "REQUEST_ABORTED");
      }
      if (timedOut) {
        throw new Error(
          `AI request timed out after ${Math.round(options.timeoutMs / 1000)}s`
        );
      }
      lastError = err;
    } finally {
      clearTimeout(timer);
      options.externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("AI request failed after retries");
}

export async function getOllamaStatus(): Promise<{
  reachable: boolean;
  installedModels: string[];
}> {
  const cfg = getEnvConfig();
  try {
    const res = await fetchWithTimeoutAndRetry(
      `${cfg.ollamaBaseUrl}/api/tags`,
      {},
      { timeoutMs: 2500, maxRetries: 0 }
    );
    if (!res.ok) return { reachable: false, installedModels: [] };
    const json = await res.json();
    const installedModels = Array.isArray(json?.models)
      ? json.models.map((m: { name?: string }) => String(m.name || ""))
      : [];
    return { reachable: true, installedModels };
  } catch {
    return { reachable: false, installedModels: [] };
  }
}

export function generateDeterministicInsights(
  snap: PortfolioSnapshot,
  scope = "overview"
): string[] {
  const insights: string[] = [];

  if (snap.holdingsSummary.length === 0) {
    insights.push(
      "Your database is ready! Upload your Excel/CSV sheet in Import & Backup, add holdings, or extract receipts with Vision AI."
    );
    return insights;
  }

  const emergencyGap = Math.max(
    0,
    snap.emergencyTargetInr - snap.emergencyInvestedInr
  );
  if (emergencyGap > 0 && (scope === "overview" || scope === "investments")) {
    insights.push(
      `Emergency Fund is at ${formatCompactINR(
        snap.emergencyInvestedInr
      )} of ${formatCompactINR(
        snap.emergencyTargetInr
      )} (${formatCompactINR(emergencyGap)} pending).`
    );
  } else if (snap.emergencyTargetInr > 0) {
    insights.push("Emergency Fund target is 100% funded.");
  }

  const withXirr = snap.holdingsSummary.filter((h) => h.xirr !== null);
  if (withXirr.length > 0 && (scope === "overview" || scope === "investments")) {
    const sorted = [...withXirr].sort(
      (a, b) => (b.xirr ?? 0) - (a.xirr ?? 0)
    );
    const best = sorted[0];
    insights.push(
      `Top performer by XIRR: ${best.name} at ${formatPercent(
        best.xirr ?? 0
      )} (${formatCompactINR(best.currentInr)}).`
    );
  }

  if (scope === "income" || scope === "overview") {
    const totalInc = snap.mainIncomeTotal + snap.passiveIncomeTotal;
    if (totalInc > 0) {
      const passiveShare = snap.passiveIncomeTotal / totalInc;
      insights.push(
        `Passive income accounts for ${formatPercent(
          passiveShare
        )} (${formatCompactINR(
          snap.passiveIncomeTotal
        )}) of recorded total inflows.`
      );
    }
  }

  if (scope === "loans" || scope === "overview") {
    const missingDocs = snap.policiesSummary.filter((p) => p.docCount === 0);
    if (missingDocs.length > 0) {
      insights.push(
        `${missingDocs.length} insurance ${missingDocs.length === 1 ? "policy" : "policies"
        } (${missingDocs
          .map((p) => p.name)
          .join(", ")}) still need policy document upload.`
      );
    }
  }

  return insights;
}

function buildLocalFallbackReply(
  prompt: string,
  snap: PortfolioSnapshot,
  note?: string
): string {
  const q = prompt.toLowerCase();
  const lines: string[] = [];

  if (
    q.includes("xirr") ||
    q.includes("best") ||
    q.includes("perform") ||
    q.includes("sip")
  ) {
    const sorted = [...snap.holdingsSummary].sort(
      (a, b) => (b.xirr ?? -99) - (a.xirr ?? -99)
    );
    lines.push(
      `Portfolio Value: ${formatINR(snap.totalPortfolioInr)} (Invested ${formatINR(
        snap.totalInvestedInr
      )}${snap.portfolioXirr !== null
        ? `, Overall XIRR ${formatPercent(snap.portfolioXirr)}`
        : ""
      }).`
    );
    lines.push(
      `Monthly Planned SIPs: ${formatINR(snap.totalPlannedSipInr)}/month.`
    );
    if (sorted.length > 0) {
      lines.push("Top holdings:");
      for (const h of sorted.slice(0, 5)) {
        lines.push(
          `• ${h.name}: ${formatCompactINR(h.currentInr)}${h.xirr !== null ? ` (XIRR ${formatPercent(h.xirr)})` : ""
          }`
        );
      }
    }
  } else if (
    q.includes("income") ||
    q.includes("passive") ||
    q.includes("rent") ||
    q.includes("salary")
  ) {
    lines.push(`Main Income (Salary): ${formatINR(snap.mainIncomeTotal)}`);
    lines.push(
      `Passive Income: ${formatINR(snap.passiveIncomeTotal)} (Rental: ${formatINR(
        snap.rentalIncomeTotal
      )}, Dividends: ${formatINR(snap.dividendIncomeTotal)}, Other: ${formatINR(
        snap.otherIncomeTotal
      )})`
    );
  } else if (
    /\b(loan|loans|insurance|term\s+insurance|health\s+insurance|policy|policies)\b/.test(
      q
    )
  ) {
    lines.push(`Active Loan Balance: ${formatINR(snap.totalLiabilitiesInr)}`);
    for (const l of snap.loansSummary) {
      lines.push(
        `• ${l.name} [${l.status}]: Balance ${formatINR(l.currentBalance)}`
      );
    }
    lines.push(
      `Total Annualized Insurance Premiums: ${formatINR(
        snap.totalAnnualInsurancePremiumInr
      )}/yr`
    );
    for (const p of snap.policiesSummary) {
      lines.push(
        `• ${p.name} (${p.policyType}): ${formatINR(p.premiumAmount)} / ${p.premiumFrequency
        }, Docs: ${p.docCount}`
      );
    }
  } else {
    lines.push(
      `Net Worth: ${formatINR(snap.netWorthInr)} (Total Assets ${formatCompactINR(
        snap.totalAssetsInr
      )} [Portfolio ${formatCompactINR(snap.totalPortfolioInr)}] - Liabilities ${formatCompactINR(
        snap.totalLiabilitiesInr
      )}).`
    );
    lines.push(...generateDeterministicInsights(snap, "overview"));
  }

  if (note) {
    lines.push(`\n(${note})`);
  }
  return lines.join("\n");
}

export async function askPersonalAssistant(
  prompt: string,
  pageContext = "overview",
  mode: "chat" | "planning" = "chat",
  options?: { allowRemoteEgress?: boolean; signal?: AbortSignal }
): Promise<{
  reply: string;
  provider: string;
  isRemote: boolean;
}> {
  const cfg = getEnvConfig();
  const snap = buildPortfolioSnapshot();

  if (cfg.isRemoteAiEndpoint && !options?.allowRemoteEgress) {
    throw new AppError(
      "Configured AI endpoint is remote. Confirm remote data sharing before sending portfolio data.",
      409,
      "REMOTE_AI_CONFIRMATION_REQUIRED"
    );
  }

  const isPlanning =
    mode === "planning" ||
    /plan|goal|allocate|retire|prepay|strategy|rebalance|roadmap/i.test(prompt);
  const selectedOllamaModel = isPlanning
    ? cfg.ollamaPlanningModel
    : cfg.ollamaChatModel;

  const safeSnap = buildMinimizedSnapshot(snap, cfg.isRemoteAiEndpoint);

  const systemPrompt = `You are BPS Personal Wealth Assistant inside the user's Wealth Tracker.
Always base numbers strictly on the live portfolio JSON below. Use Indian Rupee formatting (₹, Lakhs, Crores). Do not invent figures; if data is missing, state that it is unknown.
Current page context: ${pageContext}

LIVE PORTFOLIO SNAPSHOT:
${JSON.stringify(safeSnap, null, 2)}`;

  if (cfg.activeProvider === "ollama") {
    try {
      const res = await fetchWithTimeoutAndRetry(
        `${cfg.ollamaBaseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: selectedOllamaModel,
            stream: false,
            keep_alive: "15m",
            options: {
              num_gpu: 99,
            },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
          }),
        },
        {
          timeoutMs: cfg.aiTimeoutMs,
          maxRetries: 1,
          externalSignal: options?.signal,
        }
      );
      if (res.ok) {
        const json = await res.json();
        const text = json?.message?.content;
        if (typeof text === "string" && text.trim()) {
          return {
            reply: text,
            provider: `Ollama (${selectedOllamaModel})`,
            isRemote: cfg.isRemoteAiEndpoint,
          };
        }
      }
      const errJson = await res.json().catch(() => ({}));
      const ollamaMsg = errJson?.error
        ? `Ollama model "${selectedOllamaModel}" unavailable`
        : `Ollama could not respond for ${selectedOllamaModel}`;
      return {
        reply: buildLocalFallbackReply(prompt, snap, ollamaMsg),
        provider: "Local Deterministic Copilot",
        isRemote: false,
      };
    } catch (err) {
      if (err instanceof AppError && err.status === 499) throw err;
      const reason = err instanceof Error ? err.message : "unreachable";
      logger.warn("ai_ollama_fallback", { reason });
      return {
        reply: buildLocalFallbackReply(
          prompt,
          snap,
          reason.includes("timed out")
            ? `Ollama (${selectedOllamaModel}) ${reason}. Try a shorter prompt or increase AI_TIMEOUT_MS.`
            : `Ollama not reachable at ${cfg.ollamaBaseUrl}`
        ),
        provider: "Local Deterministic Copilot",
        isRemote: false,
      };
    }
  }

  if (cfg.activeProvider === "oss_openai") {
    try {
      const res = await fetchWithTimeoutAndRetry(
        `${cfg.ossBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cfg.ossApiKey
              ? { Authorization: `Bearer ${cfg.ossApiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model: cfg.ossModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
          }),
        },
        {
          timeoutMs: cfg.aiTimeoutMs,
          maxRetries: 1,
          externalSignal: options?.signal,
        }
      );
      if (res.ok) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim()) {
          return {
            reply: text,
            provider: `Open-Source Endpoint (${cfg.ossModel})`,
            isRemote: cfg.isRemoteAiEndpoint,
          };
        }
      }
    } catch (err) {
      if (err instanceof AppError && err.status === 499) throw err;
      logger.warn("ai_oss_openai_fallback", {
        reason: err instanceof Error ? err.message : "unreachable",
      });
    }
  }

  return {
    reply: buildLocalFallbackReply(
      prompt,
      snap,
      `Local Copilot mode`
    ),
    provider: "Local Deterministic Copilot",
    isRemote: false,
  };
}

const EXTRACTION_SCHEMAS: Record<ExtractionTargetType, ZodSchema> = {
  insurance: aiExtractedInsuranceSchema,
  investment: aiExtractedInvestmentSchema,
  income: aiExtractedIncomeSchema,
  loan: aiExtractedLoanSchema,
  receipt: aiExtractedReceiptOrBankSchema,
  bank_statement: aiExtractedReceiptOrBankSchema,
  financial_document: aiExtractedReceiptOrBankSchema,
};

export async function extractStructuredDataWithVision(params: {
  base64Image?: string;
  mimeType?: string;
  textContent?: string;
  targetType: ExtractionTargetType;
  allowRemoteEgress?: boolean;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  model: string;
  requiresReview: true;
  isRemote: boolean;
  extracted: Record<string, unknown> | null;
  unknownFields: string[];
  rawText: string;
  hint?: string;
}> {
  const cfg = getEnvConfig();

  if (cfg.isRemoteAiEndpoint && !params.allowRemoteEgress) {
    throw new AppError(
      "Configured vision/AI endpoint is remote. Confirm remote data sharing before uploading documents for extraction.",
      409,
      "REMOTE_AI_CONFIRMATION_REQUIRED"
    );
  }

  const schemaPromptByType: Record<ExtractionTargetType, string> = {
    insurance: `{ "name": string|null, "policyType": "term"|"health"|"life_endowment"|null, "provider": string|null, "premiumAmount": number|null, "premiumFrequency": "annual"|"monthly"|null, "coverAmount": string|null, "expiryDate": "YYYY-MM-DD"|null, "notes": string|null }`,
    investment: `{ "name": string|null, "assetClass": "mutual_fund"|"stock"|"etf_us"|"etf_in"|"nps"|"ppf"|"fd"|"rd"|"chit"|"esop"|"gold_silver"|"bond"|null, "date": "YYYY-MM-DD"|null, "amount": number|null, "navOrPrice": number|null, "units": number|null, "remarks": string|null }`,
    income: `{ "date": "YYYY-MM-DD"|null, "source": string|null, "category": "salary"|"rental"|"dividend"|"other"|null, "inhandAmount": number|null, "account": string|null, "notes": string|null }`,
    loan: `{ "name": string|null, "lender": string|null, "principalSanctioned": number|null, "currentBalance": number|null, "interestRate": number|null, "emiAmount": number|null, "notes": string|null }`,
    receipt: `{ "documentKind": "receipt", "date": "YYYY-MM-DD"|null, "merchantOrInstitution": string|null, "totalAmount": number|null, "currency": string|null, "summary": string|null, "notes": string|null }`,
    bank_statement: `{ "documentKind": "bank_statement", "date": "YYYY-MM-DD"|null, "merchantOrInstitution": string|null, "totalAmount": number|null, "currency": string|null, "summary": string|null, "notes": string|null }`,
    financial_document: `{ "documentKind": "financial_document", "date": "YYYY-MM-DD"|null, "merchantOrInstitution": string|null, "totalAmount": number|null, "currency": string|null, "summary": string|null, "notes": string|null }`,
  };

  const instruction = `You are a financial document extractor. Extract ONLY facts explicitly present in the input. NEVER invent or guess missing numbers or dates; set uncertain or absent fields to null. Return ONLY valid JSON matching:\n${schemaPromptByType[params.targetType]
    }`;

  const validateExtracted = (rawText: string) => {
    const cleaned = rawText
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1")
      .trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch {
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (objMatch) {
        parsedJson = JSON.parse(objMatch[0]);
      } else if (arrMatch) {
        parsedJson = JSON.parse(arrMatch[0]);
      } else {
        throw new Error("No JSON object found in AI output");
      }
    }

    if (Array.isArray(parsedJson)) {
      parsedJson = parsedJson[0] ?? {};
    }
    if (
      parsedJson &&
      typeof parsedJson === "object" &&
      !("name" in parsedJson) &&
      !("date" in parsedJson)
    ) {
      const obj = parsedJson as Record<string, unknown>;
      const nested = obj.data ?? obj.result ?? obj.extracted;
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        parsedJson = nested;
      }
    }

    const validator = EXTRACTION_SCHEMAS[params.targetType];
    const validated = validator.parse(parsedJson) as Record<string, unknown>;
    const unknownFields = Object.entries(validated)
      .filter(([, v]) => v === null || v === undefined || v === "")
      .map(([k]) => k);
    return { validated, unknownFields };
  };

  if (cfg.activeProvider === "ollama") {
    const model = params.base64Image
      ? cfg.ollamaVisionModel
      : cfg.ollamaChatModel;
    try {
      const message: Record<string, unknown> = {
        role: "user",
        content: params.textContent
          ? `${instruction}\n\nDOCUMENT TEXT:\n${params.textContent.slice(0, 6000)}`
          : instruction,
      };
      if (params.base64Image) {
        message.images = [params.base64Image];
      }

      const res = await fetchWithTimeoutAndRetry(
        `${cfg.ollamaBaseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            keep_alive: "15m",
            options: {
              num_gpu: 99,
            },
            format: "json",
            messages: [message],
          }),
        },
        {
          timeoutMs: cfg.aiTimeoutMs,
          maxRetries: 1,
          externalSignal: params.signal,
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          ok: false,
          model,
          requiresReview: true,
          isRemote: cfg.isRemoteAiEndpoint,
          extracted: null,
          unknownFields: [],
          rawText: err?.error || "Ollama vision extraction failed",
          hint: `Pull the open-source vision model with: ollama pull ${model}`,
        };
      }

      const json = await res.json();
      const rawText = String(
        json?.message?.content || json?.message?.thinking || ""
      );
      try {
        const { validated, unknownFields } = validateExtracted(rawText);
        return {
          ok: true,
          model,
          requiresReview: true,
          isRemote: cfg.isRemoteAiEndpoint,
          extracted: validated,
          unknownFields,
          rawText,
        };
      } catch (err) {
        logger.warn("ai_extract_schema_mismatch", {
          targetType: params.targetType,
          reason: err instanceof Error ? err.message : "parse_error",
        });
        return {
          ok: false,
          model,
          requiresReview: true,
          isRemote: cfg.isRemoteAiEndpoint,
          extracted: null,
          unknownFields: [],
          rawText:
            "AI response did not match the expected structured schema. Try selecting a more specific document type or uploading a clearer image/PDF.",
        };
      }
    } catch (err) {
      if (err instanceof AppError && err.status === 499) throw err;
      return {
        ok: false,
        model,
        requiresReview: true,
        isRemote: cfg.isRemoteAiEndpoint,
        extracted: null,
        unknownFields: [],
        rawText: "Could not connect to Ollama extraction service",
        hint: `Start Ollama and pull: ollama pull ${model}`,
      };
    }
  }

  if (cfg.activeProvider === "oss_openai") {
    const model = params.base64Image ? cfg.ossVisionModel : cfg.ossModel;
    try {
      const content = params.base64Image
        ? [
          { type: "text", text: instruction },
          {
            type: "image_url",
            image_url: {
              url: `data:${params.mimeType || "image/png"};base64,${params.base64Image
                }`,
            },
          },
        ]
        : `${instruction}\n\nDOCUMENT TEXT:\n${(params.textContent || "").slice(
          0,
          6000
        )}`;

      const res = await fetchWithTimeoutAndRetry(
        `${cfg.ossBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cfg.ossApiKey
              ? { Authorization: `Bearer ${cfg.ossApiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content }],
          }),
        },
        {
          timeoutMs: cfg.aiTimeoutMs,
          maxRetries: 1,
          externalSignal: params.signal,
        }
      );

      if (res.ok) {
        const json = await res.json();
        const rawText = String(json?.choices?.[0]?.message?.content || "");
        const { validated, unknownFields } = validateExtracted(rawText);
        return {
          ok: true,
          model,
          requiresReview: true,
          isRemote: cfg.isRemoteAiEndpoint,
          extracted: validated,
          unknownFields,
          rawText,
        };
      }
    } catch (err) {
      if (err instanceof AppError && err.status === 499) throw err;
    }
  }

  return {
    ok: false,
    model: cfg.ollamaVisionModel,
    requiresReview: true,
    isRemote: cfg.isRemoteAiEndpoint,
    extracted: null,
    unknownFields: [],
    rawText:
      "Local AI extraction requires Ollama or an OpenAI-compatible vision server.",
    hint: `ollama pull ${cfg.ollamaVisionModel}`,
  };
}
