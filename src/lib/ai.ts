import { desc } from "drizzle-orm";
import { db } from "@/db";
import {
  documents,
  financialGoals,
  incomeEntries,
  insurancePolicies,
  investmentHoldings,
  investmentTransactions,
  loans,
  rentalPayments,
  rentalProperties,
} from "@/db/schema";
import { getSetting } from "./auth";
import { getEnvConfig } from "./env";
import { calculateXIRR, holdingInrValues } from "./finance";
import { formatCompactINR, formatINR, formatPercent } from "./utils";

export interface PortfolioSnapshot {
  usdInrRate: number;
  netWorthInr: number;
  totalPortfolioInr: number;
  totalInvestedInr: number;
  totalGainInr: number;
  portfolioXirr: number | null;
  totalLiabilitiesInr: number;
  totalPlannedSipInr: number;
  emergencyInvestedInr: number;
  emergencyTargetInr: number;
  mainIncomeTotal: number;
  passiveIncomeTotal: number;
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
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
  const emergencyTargetInr = Number.parseFloat(
    getSetting("emergency_fund_target", "600000")
  );
  const holdings = db.select().from(investmentHoldings).all();
  const txns = db.select().from(investmentTransactions).all();
  const incomes = db
    .select()
    .from(incomeEntries)
    .orderBy(desc(incomeEntries.date))
    .all();
  const rentPays = db.select().from(rentalPayments).all();
  const rentals = db.select().from(rentalProperties).all();
  const allLoans = db.select().from(loans).all();
  const policies = db.select().from(insurancePolicies).all();
  const goals = db.select().from(financialGoals).all();
  const docs = db.select().from(documents).all();

  const txnsByHolding = new Map<number, typeof txns>();
  for (const t of txns) {
    const arr = txnsByHolding.get(t.holdingId) ?? [];
    arr.push(t);
    txnsByHolding.set(t.holdingId, arr);
  }

  let totalInvestedInr = 0;
  let totalPortfolioInr = 0;
  let totalPlannedSipInr = 0;
  let emergencyInvestedInr = 0;
  const allCashflows: Array<{ date: string; amount: number }> = [];

  const holdingsSummary = holdings
    .filter((h) => h.status !== "closed")
    .map((h) => {
      const vals = holdingInrValues(h, usdInrRate);
      totalInvestedInr += vals.investedInr;
      totalPortfolioInr += vals.currentInr;
      totalPlannedSipInr += vals.plannedSipInr;
      if (h.isEmergencyFund || h.assetClass === "fd" || h.assetClass === "rd") {
        emergencyInvestedInr += vals.currentInr;
      }

      const hTxns = txnsByHolding.get(h.id) ?? [];
      const hCfs = hTxns.map((t) => ({
        date: t.date,
        amount:
          t.type === "sell" || t.type === "dividend"
            ? Math.abs(t.amount)
            : -Math.abs(t.amount),
      }));
      const nativeCurrent =
        h.units > 0 && h.currentNav > 0
          ? h.units * h.currentNav
          : h.currentValue;
      if (nativeCurrent > 0 && hCfs.length > 0) {
        hCfs.push({
          date: new Date().toISOString().slice(0, 10),
          amount: nativeCurrent,
        });
      }
      for (const t of hTxns) {
        const fx = t.currency === "USD" ? usdInrRate : 1;
        allCashflows.push({
          date: t.date,
          amount:
            t.type === "sell" || t.type === "dividend"
              ? Math.abs(t.amount) * fx
              : -Math.abs(t.amount) * fx,
        });
      }
      return {
        name: h.name,
        assetClass: h.assetClass,
        investedInr: Math.round(vals.investedInr),
        currentInr: Math.round(vals.currentInr),
        plannedSipInr: Math.round(vals.plannedSipInr),
        xirr: calculateXIRR(hCfs),
      };
    });

  if (totalPortfolioInr > 0 && allCashflows.length > 0) {
    allCashflows.push({
      date: new Date().toISOString().slice(0, 10),
      amount: totalPortfolioInr,
    });
  }

  const totalLiabilitiesInr = allLoans
    .filter((l) => l.status === "active")
    .reduce((s, l) => s + l.currentBalance, 0);

  const mainIncomeTotal = incomes
    .filter((i) => i.category === "salary")
    .reduce((s, i) => s + i.inhandAmount, 0);
  const passiveIncomeTotal =
    incomes
      .filter((i) => i.category !== "salary")
      .reduce((s, i) => s + i.inhandAmount, 0) +
    rentPays.reduce((s, rp) => s + rp.rentAmount, 0) +
    (rentPays.length === 0
      ? rentals
          .filter((r) => r.status === "occupied")
          .reduce((s, r) => s + r.monthlyRent, 0)
      : 0);

  return {
    usdInrRate,
    netWorthInr: totalPortfolioInr - totalLiabilitiesInr,
    totalPortfolioInr,
    totalInvestedInr,
    totalGainInr: totalPortfolioInr - totalInvestedInr,
    portfolioXirr: calculateXIRR(allCashflows),
    totalLiabilitiesInr,
    totalPlannedSipInr,
    emergencyInvestedInr,
    emergencyTargetInr,
    mainIncomeTotal,
    passiveIncomeTotal,
    holdingsSummary,
    loansSummary: allLoans.map((l) => ({
      name: l.name,
      status: l.status,
      currentBalance: l.currentBalance,
      emiAmount: l.emiAmount,
    })),
    policiesSummary: policies.map((p) => ({
      name: p.name,
      policyType: p.policyType,
      premiumAmount: p.premiumAmount,
      coverAmount: p.coverAmount,
      expiryDate: p.expiryDate,
      docCount: docs.filter(
        (d) => d.entityType === "insurance" && d.entityId === p.id
      ).length,
    })),
    goalsSummary: goals.map((g) => ({
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
    })),
  };
}

export async function getOllamaStatus(): Promise<{
  reachable: boolean;
  installedModels: string[];
}> {
  const cfg = getEnvConfig();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${cfg.ollamaBaseUrl}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
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
      "Your database is ready! Upload your Excel sheet in Import & Backup, use SQL Studio to inspect tables, or extract receipts with Open-Source Vision AI."
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
        `${missingDocs.length} insurance ${
          missingDocs.length === 1 ? "policy" : "policies"
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
      )}${
        snap.portfolioXirr !== null
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
          `• ${h.name}: ${formatCompactINR(h.currentInr)}${
            h.xirr !== null ? ` (XIRR ${formatPercent(h.xirr)})` : ""
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
      `Passive Income (Rent & Other): ${formatINR(snap.passiveIncomeTotal)}`
    );
  } else if (
    q.includes("loan") ||
    q.includes("insurance") ||
    q.includes("term") ||
    q.includes("health")
  ) {
    lines.push(`Active Loan Balance: ${formatINR(snap.totalLiabilitiesInr)}`);
    for (const l of snap.loansSummary) {
      lines.push(
        `• ${l.name} [${l.status}]: Balance ${formatINR(l.currentBalance)}`
      );
    }
    for (const p of snap.policiesSummary) {
      lines.push(
        `• ${p.name} (${p.policyType}): Premium ${formatINR(
          p.premiumAmount
        )}, Docs uploaded: ${p.docCount}`
      );
    }
  } else {
    lines.push(
      `Net Worth: ${formatINR(snap.netWorthInr)} (Assets ${formatCompactINR(
        snap.totalPortfolioInr
      )} - Liabilities ${formatCompactINR(snap.totalLiabilitiesInr)}).`
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
  mode: "chat" | "planning" = "chat"
): Promise<{
  reply: string;
  provider: string;
}> {
  const cfg = getEnvConfig();
  const snap = buildPortfolioSnapshot();

  const isPlanning =
    mode === "planning" ||
    /plan|goal|allocate|retire|prepay|strategy|rebalance|roadmap/i.test(prompt);
  const selectedOllamaModel = isPlanning
    ? cfg.ollamaPlanningModel
    : cfg.ollamaChatModel;

  const systemPrompt = `You are BPS Personal Wealth Assistant, running 100% locally on open-source AI inside the user's Income & Investment Tracker.
Always base numbers strictly on the live portfolio JSON below. Use Indian Rupee formatting (₹, Lakhs, Crores). Do not invent figures.
Current page context: ${pageContext}

LIVE PORTFOLIO SNAPSHOT:
${JSON.stringify(snap, null, 2)}`;

  if (cfg.activeProvider === "ollama") {
    try {
      const res = await fetch(`${cfg.ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedOllamaModel,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.message?.content;
        if (text) {
          return {
            reply: text,
            provider: `Ollama (${selectedOllamaModel})`,
          };
        }
      }
      const errJson = await res.json().catch(() => ({}));
      const ollamaMsg = errJson?.error
        ? `Ollama model "${selectedOllamaModel}" not pulled yet — run: ollama pull ${selectedOllamaModel}`
        : `Ollama could not respond for ${selectedOllamaModel}`;
      return {
        reply: buildLocalFallbackReply(prompt, snap, ollamaMsg),
        provider: "Local Deterministic Copilot",
      };
    } catch {
      return {
        reply: buildLocalFallbackReply(
          prompt,
          snap,
          `Ollama not reachable at ${cfg.ollamaBaseUrl} — run: ollama serve & ollama pull ${selectedOllamaModel}`
        ),
        provider: "Local Deterministic Copilot",
      };
    }
  }

  if (cfg.activeProvider === "oss_openai") {
    try {
      const res = await fetch(`${cfg.ossBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.ossApiKey}`,
        },
        body: JSON.stringify({
          model: cfg.ossModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content;
        if (text) {
          return {
            reply: text,
            provider: `Open-Source Endpoint (${cfg.ossModel})`,
          };
        }
      }
    } catch {
      // fall through
    }
  }

  return {
    reply: buildLocalFallbackReply(
      prompt,
      snap,
      `Local Copilot mode (Ollama model: ${selectedOllamaModel})`
    ),
    provider: "Local Deterministic Copilot",
  };
}

export async function extractStructuredDataWithVision(params: {
  base64Image?: string;
  textContent?: string;
  targetType: "insurance" | "investment" | "income" | "loan";
}): Promise<{
  ok: boolean;
  model: string;
  extracted: Record<string, unknown> | null;
  rawText: string;
  hint?: string;
}> {
  const cfg = getEnvConfig();

  const schemaPromptByType: Record<string, string> = {
    insurance: `Extract insurance policy details as valid JSON with keys:
{ "name": string, "policyType": "term" | "health" | "life_endowment", "provider": string, "premiumAmount": number, "coverAmount": string, "expiryDate": "YYYY-MM-DD or text", "notes": string }`,
    investment: `Extract investment/SIP statement details as valid JSON with keys:
{ "name": string, "assetClass": "mutual_fund" | "stock" | "nps" | "ppf" | "fd" | "rd", "date": "YYYY-MM-DD", "amount": number, "navOrPrice": number, "units": number, "remarks": string }`,
    income: `Extract salary/rental income details as valid JSON with keys:
{ "date": "YYYY-MM-DD", "source": string, "category": "salary" | "rental" | "dividend" | "other", "inhandAmount": number, "account": string, "notes": string }`,
    loan: `Extract loan statement details as valid JSON with keys:
{ "name": string, "lender": string, "principalSanctioned": number, "currentBalance": number, "interestRate": number, "emiAmount": number, "notes": string }`,
  };

  const instruction = `You are a financial document & image data extractor. Return ONLY a JSON object matching this schema (use null or 0 if not visible):\n${
    schemaPromptByType[params.targetType] || schemaPromptByType.investment
  }`;

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

      const res = await fetch(`${cfg.ollamaBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: [message],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          ok: false,
          model,
          extracted: null,
          rawText: err?.error || "Ollama vision extraction failed",
          hint: `Pull the open-source vision model with: ollama pull ${model}`,
        };
      }

      const json = await res.json();
      const rawText = String(json?.message?.content || "");
      let extracted: Record<string, unknown> | null = null;
      try {
        const match = rawText.match(/\{[\s\S]*\}/);
        extracted = JSON.parse(match ? match[0] : rawText);
      } catch {
        extracted = null;
      }

      return { ok: true, model, extracted, rawText };
    } catch {
      return {
        ok: false,
        model,
        extracted: null,
        rawText: `Could not connect to Ollama at ${cfg.ollamaBaseUrl}`,
        hint: `Start Ollama and pull: ollama pull ${model}`,
      };
    }
  }

  return {
    ok: false,
    model: cfg.ossVisionModel,
    extracted: null,
    rawText: "Set AI_PROVIDER=ollama in .env.local to use local open-source vision extraction.",
    hint: `ollama pull ${cfg.ollamaVisionModel}`,
  };
}
