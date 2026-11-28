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
import {
  getFireAndRetirementData,
  getGoalsDashboardData,
  getMonthlyWealthScorecardData,
  getNetWorthMilestoneData,
  getPortfolioRiskAndLiquidityData,
  getSimulationBaseline,
} from "./../services/wealth-planning";
import { formatCompactINR, formatINR, formatPercent } from "./utils";
import {
  DEFAULT_WHAT_IF_ADJUSTMENTS,
  runWhatIfSimulation,
  SimulationBaseline,
} from "./wealth-calculations";

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
    category: string;
    targetAmount: number;
    currentAmount: number;
    allocatedAmount: number;
    standaloneAmount: number;
    targetDate: string;
    monthlyContribution: number;
    requiredMonthly: number;
    health: string;
    allocations: Array<{ holdingName: string; effectiveInr: number }>;
  }>;
  planningContext: {
    fire: {
      investableCorpusInr: number;
      monthlyExpenses: number;
      expectedReturnPct: number;
      inflationPct: number;
      withdrawalRatePct: number;
      requiredCorpusToday: number;
      currentFireProgressPct: number;
      estimatedFireYear: number | null;
      estimatedFireAge: number | null;
      monthlyInvestmentRequired: number;
    };
    retirement: {
      yearsRemaining: number;
      requiredRetirementCorpus: number;
      projectedCorpus: number;
      monthlyInvestmentShortfall: number;
      readinessPct: number;
    };
    emergency: {
      recommendedCorpus: number;
      actualEmergencyValue: number;
      coverageMonths: number | null;
      coverageMonthsTarget: number;
      remainingAmount: number;
    };
    risk: {
      liquidAssetsInr: number;
      liquidAssetsPct: number;
      topFiveSharePct: number;
      concentrationAlerts: Array<{
        type: string;
        subject: string;
        pct: number;
        message: string;
      }>;
      maturityMismatches: Array<{
        goalName: string;
        holdingName: string;
        holdingMaturityDate: string;
        goalTargetDate: string;
      }>;
    };
    scorecard: {
      month: string;
      totalIncome: number;
      invContributions: number;
      investmentRatePct: number | null;
      savingsRatePct: number | null;
      monthlySurplus: number | null;
    };
    milestones: {
      currentNetWorthInr: number;
      nextMilestoneLabel: string | null;
      nextMilestoneTarget: number | null;
      estimatedDate: string | null;
    };
    simulatorBaseline: SimulationBaseline;
  };
}

export function buildPortfolioSnapshot(): PortfolioSnapshot {
  const dash = getDashboardPortfolioData();
  const m = dash.metrics;
  const goalsData = getGoalsDashboardData();
  const fireData = getFireAndRetirementData();
  const riskData = getPortfolioRiskAndLiquidityData();
  const scorecard = getMonthlyWealthScorecardData();
  const milestones = getNetWorthMilestoneData();
  const simBaseline = getSimulationBaseline();

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
    emergencyInvestedInr: riskData.emergency.actualEmergencyValue,
    emergencyTargetInr: riskData.emergency.recommendedCorpus,
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
    goalsSummary: goalsData.goals.map((g) => ({
      name: g.name,
      category: g.category,
      targetAmount: g.targetAmount,
      currentAmount: g.projection.currentAmount,
      allocatedAmount: g.allocatedAmount,
      standaloneAmount: g.standaloneAmount,
      targetDate: g.targetDate ?? "",
      monthlyContribution: g.monthlyContribution,
      requiredMonthly: g.projection.requiredMonthlyInflationAdjusted,
      health: g.projection.health,
      allocations: g.allocations.map((a) => ({
        holdingName: a.holdingName,
        effectiveInr: a.effectiveInr,
      })),
    })),
    planningContext: {
      fire: {
        investableCorpusInr: fireData.corpusInfo.investableCorpusInr,
        monthlyExpenses: fireData.profile.monthlyExpenses,
        expectedReturnPct: fireData.profile.expectedReturnPct,
        inflationPct: fireData.profile.expenseInflationPct,
        withdrawalRatePct: fireData.profile.safeWithdrawalRatePct,
        requiredCorpusToday: fireData.fire.requiredCorpusToday,
        currentFireProgressPct: fireData.fire.currentFireProgressPct,
        estimatedFireYear: fireData.fire.estimatedFireYear,
        estimatedFireAge: fireData.fire.estimatedFireAge,
        monthlyInvestmentRequired: fireData.fire.monthlyInvestmentRequired,
      },
      retirement: {
        yearsRemaining: fireData.retirement.yearsRemaining,
        requiredRetirementCorpus:
          fireData.retirement.requiredRetirementCorpus,
        projectedCorpus: fireData.retirement.projectedCorpus,
        monthlyInvestmentShortfall:
          fireData.retirement.monthlyInvestmentShortfall,
        readinessPct: fireData.retirement.readinessPct,
      },
      emergency: {
        recommendedCorpus: riskData.emergency.recommendedCorpus,
        actualEmergencyValue: riskData.emergency.actualEmergencyValue,
        coverageMonths: riskData.emergency.coverageMonths,
        coverageMonthsTarget: riskData.emergency.coverageMonthsTarget,
        remainingAmount: riskData.emergency.remainingAmount,
      },
      risk: {
        liquidAssetsInr: riskData.risk.liquidAssetsInr,
        liquidAssetsPct: riskData.risk.liquidAssetsPct,
        topFiveSharePct: riskData.risk.topFiveSharePct,
        concentrationAlerts: riskData.risk.concentrationAlerts.map((a) => ({
          type: a.type,
          subject: a.subject,
          pct: a.pct,
          message: a.message,
        })),
        maturityMismatches: riskData.risk.maturityMismatches.map((mm) => ({
          goalName: mm.goalName,
          holdingName: mm.holdingName,
          holdingMaturityDate: mm.holdingMaturityDate,
          goalTargetDate: mm.goalTargetDate,
        })),
      },
      scorecard: {
        month: scorecard.currentMonth,
        totalIncome: scorecard.current.totalIncome,
        invContributions:
          scorecard.current.invContributions +
          scorecard.current.employerContributions,
        investmentRatePct: scorecard.current.investmentRatePct,
        savingsRatePct: scorecard.current.savingsRatePct,
        monthlySurplus: scorecard.current.monthlySurplus,
      },
      milestones: {
        currentNetWorthInr: milestones.currentNetWorthInr,
        nextMilestoneLabel: milestones.nextMilestone?.label ?? null,
        nextMilestoneTarget: milestones.nextMilestone?.targetAmount ?? null,
        estimatedDate: milestones.nextMilestone?.estimatedDate ?? null,
      },
      simulatorBaseline: simBaseline,
    },
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
      allocations: g.allocations.map((a, ai) => ({
        holdingName: `Holding_Ref_${ai + 1}`,
        effectiveInr: a.effectiveInr,
      })),
    })),
    planningContext: {
      ...snap.planningContext,
      risk: {
        ...snap.planningContext.risk,
        concentrationAlerts: snap.planningContext.risk.concentrationAlerts.map(
          (a, idx) => ({
            type: a.type,
            subject: `Subject_${idx + 1}`,
            pct: a.pct,
            message: `${a.type} concentration at ${a.pct}%`,
          })
        ),
        maturityMismatches: snap.planningContext.risk.maturityMismatches.map(
          (mm, idx) => ({
            goalName: `Goal_Ref_${idx + 1}`,
            holdingName: `Holding_Ref_${idx + 1}`,
            holdingMaturityDate: mm.holdingMaturityDate,
            goalTargetDate: mm.goalTargetDate,
          })
        ),
      },
      simulatorBaseline: {
        ...snap.planningContext.simulatorBaseline,
        loans: snap.planningContext.simulatorBaseline.loans.map((l, idx) => ({
          ...l,
          name: `Loan_${idx + 1}`,
        })),
        goals: snap.planningContext.simulatorBaseline.goals.map((g, idx) => ({
          ...g,
          name: `Goal_${idx + 1}`,
        })),
      },
    },
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

  if (scope === "goals" || scope === "overview") {
    const atRisk = snap.goalsSummary.filter(
      (g) => g.health === "at_risk" || g.health === "attention"
    );
    if (atRisk.length > 0) {
      insights.push(
        `${atRisk.length} financial goal(s) need attention: ${atRisk
          .slice(0, 3)
          .map((g) => g.name)
          .join(", ")}.`
      );
    }
  }

  if (scope === "fire") {
    const f = snap.planningContext.fire;
    if (f.monthlyExpenses <= 0) {
      insights.push(
        "Enter your monthly expenses to unlock FIRE corpus and target independence year projections."
      );
    } else {
      insights.push(
        `Current investable corpus (${formatCompactINR(f.investableCorpusInr)}) covers ${formatPercent(f.currentFireProgressPct)} of today's FIRE target (${formatCompactINR(f.requiredCorpusToday)} at ${f.withdrawalRatePct}% SWR).`
      );
    }
  }

  if (scope === "portfolio-risk" || scope === "overview") {
    const alerts = snap.planningContext.risk.concentrationAlerts;
    if (alerts.length > 0) {
      insights.push(alerts[0].message);
    }
    const mismatches = snap.planningContext.risk.maturityMismatches;
    if (mismatches.length > 0) {
      insights.push(
        `${mismatches.length} goal maturity mismatch(es) detected where linked holdings mature after the goal date.`
      );
    }
  }

  if (scope === "scorecard") {
    const sc = snap.planningContext.scorecard;
    insights.push(
      `In ${sc.month}, recorded income is ${formatCompactINR(sc.totalIncome)} with ${formatCompactINR(sc.invContributions)} in investment contributions.`
    );
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
  const pc = snap.planningContext;

  // Deterministic What-If simulation queries (e.g. "increase SIP by 5000", "salary increases by 10%")
  if (
    /what\s+if|what\s+happens|simulat/i.test(q) &&
    (/sip|salary|expense|loan|prepay|market/i.test(q))
  ) {
    const adj = { ...DEFAULT_WHAT_IF_ADJUSTMENTS };
    const sipMatch = q.match(/sip[^0-9]*([0-9,]+)/i);
    const salMatch = q.match(/salary[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    if (sipMatch) {
      adj.sipDeltaMonthly = Number(sipMatch[1].replace(/,/g, "")) || 5000;
    }
    if (salMatch) {
      adj.salaryChangePct = Number(salMatch[1]) || 10;
    }
    const sim = runWhatIfSimulation(pc.simulatorBaseline, adj);
    lines.push("Deterministic What-If Simulation (isolated from live records):");
    lines.push(
      `• Actual Starting Investable Corpus: ${formatCompactINR(sim.baseline.startingCorpus)} | Actual Monthly SIP: ${formatINR(sim.baseline.monthlySip)}`
    );
    lines.push(
      `• Scenario 10-Year Projected Net Worth: ${formatCompactINR(sim.scenario.horizons.y10.netWorth)} (${sim.deltas.y10NetWorthDelta >= 0 ? "+" : ""}${formatCompactINR(sim.deltas.y10NetWorthDelta)} vs baseline ${formatCompactINR(sim.baseline.horizons.y10.netWorth)})`
    );
    lines.push(
      `• Scenario 20-Year Projected Net Worth: ${formatCompactINR(sim.scenario.horizons.y20.netWorth)} (${sim.deltas.y20NetWorthDelta >= 0 ? "+" : ""}${formatCompactINR(sim.deltas.y20NetWorthDelta)} vs baseline)`
    );
    lines.push(
      `• Projected FIRE Timeline: ${sim.scenario.fireYears !== null ? `${sim.scenario.fireYears} years` : "20+ years"} (Assumptions: ${pc.simulatorBaseline.expectedReturnPct}% return, ${pc.simulatorBaseline.inflationPct}% inflation, ${pc.simulatorBaseline.withdrawalRatePct}% SWR).`
    );
  } else if (
    /\b(fire|financially independent|financial independence|retire|retirement)\b/.test(
      q
    )
  ) {
    const f = pc.fire;
    const r = pc.retirement;
    lines.push(
      `Actual Investable Corpus (excluding physical/residence assets): ${formatINR(f.investableCorpusInr)}`
    );
    if (f.monthlyExpenses <= 0) {
      lines.push(
        "Projected FIRE Year / Required Corpus: Monthly expenses are currently ₹0. Set your monthly expenses in FIRE & Retirement to compute your exact FIRE corpus and independence year."
      );
    } else {
      lines.push(
        `Projected Today's FIRE Target: ${formatINR(f.requiredCorpusToday)} (Current progress: ${formatPercent(f.currentFireProgressPct)})`
      );
      lines.push(
        `Estimated FIRE Year: ${f.estimatedFireYear ?? "Beyond 45 years"}${f.estimatedFireAge ? ` (Age ${f.estimatedFireAge})` : ""} • Required Monthly SIP for target horizon: ${formatINR(f.monthlyInvestmentRequired)}/mo`
      );
      lines.push(
        `Retirement Readiness (${r.yearsRemaining} yrs remaining): ${formatPercent(r.readinessPct)} (Projected ${formatCompactINR(r.projectedCorpus)} vs Required ${formatCompactINR(r.requiredRetirementCorpus)}; monthly shortfall ${formatINR(r.monthlyInvestmentShortfall)}/mo).`
      );
    }
    lines.push(
      `Assumptions (estimates, not guaranteed): ${f.expectedReturnPct}% return, ${f.inflationPct}% inflation, ${f.withdrawalRatePct}% withdrawal rate.`
    );
  } else if (
    /\b(goal|goals|house|afford|falling behind|additional sip|shortfall)\b/.test(
      q
    )
  ) {
    if (snap.goalsSummary.length === 0) {
      lines.push("No financial goals are currently configured.");
    } else {
      lines.push(
        `Financial Goals Summary (${snap.goalsSummary.length} goal(s)):`
      );
      for (const g of snap.goalsSummary) {
        const gapMonthly = Math.max(
          0,
          g.requiredMonthly - g.monthlyContribution
        );
        lines.push(
          `• ${g.name} [${g.health}]: Actual ${formatCompactINR(g.currentAmount)} (Linked ${formatCompactINR(g.allocatedAmount)} + Cash ${formatCompactINR(g.standaloneAmount)}) / Target ${formatCompactINR(g.targetAmount)}${g.targetDate ? ` by ${g.targetDate}` : ""} • Req. SIP ${formatINR(g.requiredMonthly)}/mo${gapMonthly > 0 ? ` (+${formatINR(gapMonthly)}/mo additional needed)` : ""}`
        );
      }
    }
  } else if (/\b(emergency)\b/.test(q)) {
    const e = pc.emergency;
    lines.push(
      `Actual Accessible Emergency Fund: ${formatINR(e.actualEmergencyValue)} (excludes locked PPF/NPS/ESOP).`
    );
    lines.push(
      `Recommended Emergency Corpus (${e.coverageMonthsTarget} months): ${formatINR(e.recommendedCorpus)} • Remaining Gap: ${formatINR(e.remainingAmount)}${e.coverageMonths !== null ? ` • Current Coverage: ${e.coverageMonths} months` : ""}`
    );
  } else if (
    /\b(liquid|liquidity|concentration|risk|risks|mismatch)\b/.test(q)
  ) {
    const r = pc.risk;
    lines.push(
      `Actual Liquid Portfolio Assets: ${formatCompactINR(r.liquidAssetsInr)} (${r.liquidAssetsPct.toFixed(1)}% of portfolio). Top 5 holdings share: ${r.topFiveSharePct.toFixed(1)}%.`
    );
    if (r.concentrationAlerts.length > 0) {
      lines.push("Concentration Indicators:");
      for (const a of r.concentrationAlerts) {
        lines.push(`• ${a.message}`);
      }
    } else {
      lines.push("No configured concentration thresholds are currently exceeded.");
    }
    if (r.maturityMismatches.length > 0) {
      lines.push("Goal Maturity Mismatches:");
      for (const mm of r.maturityMismatches) {
        lines.push(
          `• ${mm.holdingName} matures ${mm.holdingMaturityDate}, after goal "${mm.goalName}" (${mm.goalTargetDate}).`
        );
      }
    }
  } else if (
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
Rules:
1. Base all numerical figures strictly on the deterministic LIVE PORTFOLIO SNAPSHOT JSON below. Never invent figures; if data is missing (e.g. monthly expenses or savings rate), state that it is not recorded.
2. Clearly distinguish ACTUAL recorded values from PROJECTED estimates and always state the assumptions (expected return, inflation, withdrawal rate) when discussing projections.
3. Never execute transactions or modify investment allocations; provide read-only analysis and clear recommendations only.
4. Use Indian Rupee formatting (₹, Lakhs, Crores).
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
