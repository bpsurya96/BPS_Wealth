import { fromMinorUnits, toMinorUnits } from "./currency";
import { holdingInrValues } from "./finance";

export interface GoalTemplate {
  key: string;
  name: string;
  category: string;
  description: string;
  defaultReturnPct: number;
  defaultInflationPct: number;
  defaultPriority: "high" | "medium" | "low";
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    key: "emergency_fund",
    name: "Emergency Fund",
    category: "emergency",
    description: "Liquid reserve covering 6 months of essential household expenses",
    defaultReturnPct: 6.5,
    defaultInflationPct: 6,
    defaultPriority: "high",
  },
  {
    key: "house_purchase",
    name: "House Purchase",
    category: "house",
    description: "Down payment or full purchase corpus for residential property",
    defaultReturnPct: 10,
    defaultInflationPct: 7,
    defaultPriority: "high",
  },
  {
    key: "car_purchase",
    name: "Car Purchase",
    category: "car",
    description: "Vehicle purchase or upgrade fund without high-interest auto debt",
    defaultReturnPct: 8,
    defaultInflationPct: 5,
    defaultPriority: "medium",
  },
  {
    key: "retirement",
    name: "Retirement",
    category: "retirement",
    description: "Long-term retirement corpus to sustain post-work lifestyle",
    defaultReturnPct: 11,
    defaultInflationPct: 6,
    defaultPriority: "high",
  },
  {
    key: "child_education",
    name: "Children's Education",
    category: "education",
    description: "Higher education tuition and living expenses corpus",
    defaultReturnPct: 11,
    defaultInflationPct: 8,
    defaultPriority: "high",
  },
  {
    key: "marriage",
    name: "Marriage",
    category: "marriage",
    description: "Wedding and family celebration fund",
    defaultReturnPct: 9,
    defaultInflationPct: 6,
    defaultPriority: "medium",
  },
  {
    key: "vacation",
    name: "Vacation",
    category: "vacation",
    description: "Dedicated travel and family holiday reserve",
    defaultReturnPct: 7,
    defaultInflationPct: 5,
    defaultPriority: "low",
  },
  {
    key: "business",
    name: "Business",
    category: "business",
    description: "Seed capital or expansion reserve for entrepreneurial venture",
    defaultReturnPct: 9,
    defaultInflationPct: 6,
    defaultPriority: "medium",
  },
  {
    key: "financial_independence",
    name: "Financial Independence",
    category: "fire",
    description: "Investable corpus required to cover living expenses indefinitely",
    defaultReturnPct: 11,
    defaultInflationPct: 6,
    defaultPriority: "high",
  },
  {
    key: "custom",
    name: "Custom Goal",
    category: "custom",
    description: "Custom financial milestone with configurable assumptions",
    defaultReturnPct: 10,
    defaultInflationPct: 6,
    defaultPriority: "medium",
  },
];

export type LiquidityBucket =
  | "immediately_accessible"
  | "relatively_liquid"
  | "maturity_based"
  | "restricted_locked"
  | "unknown";

export const LIQUIDITY_LABELS: Record<LiquidityBucket, string> = {
  immediately_accessible: "Immediately Accessible",
  relatively_liquid: "Relatively Liquid",
  maturity_based: "Maturity-Based",
  restricted_locked: "Restricted / Locked",
  unknown: "Unknown Liquidity",
};

const VOLATILE_ASSET_CLASSES = new Set([
  "stock",
  "mutual_fund",
  "etf_us",
  "etf_in",
  "esop",
]);

const LOCKED_ASSET_CLASSES = new Set(["ppf", "nps", "esop"]);

function parseIsoDay(dateStr: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * Returns non-negative integer months between two YYYY-MM-DD dates.
 * Adjusts down by 1 if target day-of-month is earlier than reference day-of-month.
 */
export function monthsBetweenDates(fromIso: string, toIso: string): number {
  const start = parseIsoDay(fromIso);
  const end = parseIsoDay(toIso);
  if (!start || !end) return 0;
  let months = (end.year - start.year) * 12 + (end.month - start.month);
  if (end.day < start.day) {
    months -= 1;
  }
  return Math.max(0, months);
}

export function addMonthsToIsoDate(fromIso: string, months: number): string {
  const parsed = parseIsoDay(fromIso);
  const base = parsed
    ? new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
    : new Date();
  const target = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + Math.max(0, Math.round(months)), base.getUTCDate())
  );
  return target.toISOString().slice(0, 10);
}

/**
 * Effective monthly compounding rate equivalent to annual effective return R:
 * r_m = (1 + R)^(1/12) - 1, so (1 + r_m)^12 === 1 + R.
 */
export function effectiveMonthlyRate(annualRatePct: number): number {
  if (!Number.isFinite(annualRatePct)) return 0;
  const r = annualRatePct / 100;
  if (r <= -0.99) return -0.99;
  return Math.pow(1 + r, 1 / 12) - 1;
}

/**
 * Future value of starting principal + end-of-month SIP contributions over n months:
 * FV = P * (1 + r_m)^n + C * ((1 + r_m)^n - 1) / r_m
 */
export function futureValueWithSip(
  presentValue: number,
  monthlyContribution: number,
  annualRatePct: number,
  months: number
): number {
  const p = Math.max(0, Number.isFinite(presentValue) ? presentValue : 0);
  const c = Math.max(0, Number.isFinite(monthlyContribution) ? monthlyContribution : 0);
  const n = Math.max(0, Math.round(months));
  if (n === 0) return p;

  const rm = effectiveMonthlyRate(annualRatePct);
  if (Math.abs(rm) < 1e-10) {
    return p + c * n;
  }
  const factor = Math.pow(1 + rm, n);
  return p * factor + c * ((factor - 1) / rm);
}

/**
 * Required monthly SIP contribution to reach targetValue from presentValue in n months.
 * When n <= 0, returns remaining immediate shortfall (targetValue - presentValue, floored at 0).
 */
export function requiredMonthlySip(
  presentValue: number,
  targetValue: number,
  annualRatePct: number,
  months: number
): number {
  const p = Math.max(0, Number.isFinite(presentValue) ? presentValue : 0);
  const t = Math.max(0, Number.isFinite(targetValue) ? targetValue : 0);
  const n = Math.max(0, Math.round(months));
  if (n === 0) return Math.max(0, t - p);

  const rm = effectiveMonthlyRate(annualRatePct);
  const fvExisting = Math.abs(rm) < 1e-10 ? p : p * Math.pow(1 + rm, n);
  const gap = Math.max(0, t - fvExisting);
  if (gap <= 0) return 0;
  if (Math.abs(rm) < 1e-10) {
    return gap / n;
  }
  const annuityFactor = (Math.pow(1 + rm, n) - 1) / rm;
  return annuityFactor > 0 ? gap / annuityFactor : gap / n;
}

export function estimateMonthsToTarget(params: {
  presentValue: number;
  monthlyContribution: number;
  targetValue: number;
  annualReturnPct: number;
  annualInflationPct?: number;
  maxMonths?: number;
}): { months: number | null; achievable: boolean } {
  const maxMonths = params.maxMonths ?? 600;
  let corpus = Math.max(0, params.presentValue);
  let target = Math.max(0, params.targetValue);
  if (target <= 0 || corpus >= target) {
    return { months: 0, achievable: true };
  }
  const monthlyContrib = Math.max(0, params.monthlyContribution);
  if (corpus <= 0 && monthlyContrib <= 0) {
    return { months: null, achievable: false };
  }

  const rm = effectiveMonthlyRate(params.annualReturnPct);
  const infM = effectiveMonthlyRate(params.annualInflationPct ?? 0);

  for (let m = 1; m <= maxMonths; m++) {
    corpus = corpus * (1 + rm) + monthlyContrib;
    if ((params.annualInflationPct ?? 0) > 0) {
      target = target * (1 + infM);
    }
    if (corpus >= target) {
      return { months: m, achievable: true };
    }
  }
  return { months: null, achievable: false };
}

export interface GoalScenarioProjection {
  key: "conservative" | "moderate" | "optimistic";
  label: string;
  annualReturnPct: number;
  projectedAtTarget: number;
  requiredMonthly: number;
  shortfallAtTarget: number;
  monthsToComplete: number | null;
  expectedCompletionDate: string | null;
}

export type GoalHealth =
  | "completed"
  | "on_track"
  | "attention"
  | "at_risk"
  | "paused"
  | "archived";

export interface GoalProjectionResult {
  currentAmount: number;
  standaloneAmount: number;
  allocatedAmount: number;
  targetAmount: number;
  inflationAdjustedTarget: number;
  remainingNominal: number;
  remainingInflationAdjusted: number;
  completionPct: number;
  monthsRemaining: number;
  hasTargetDate: boolean;
  requiredMonthlyNominal: number;
  requiredMonthlyInflationAdjusted: number;
  projectedAtTarget: number;
  expectedProgressPct: number | null;
  health: GoalHealth;
  scenarios: {
    conservative: GoalScenarioProjection;
    moderate: GoalScenarioProjection;
    optimistic: GoalScenarioProjection;
  };
}

export function computeGoalProjection(input: {
  targetAmount: number;
  standaloneAmount: number;
  allocatedAmount: number;
  targetDate: string;
  createdAt?: string;
  expectedAnnualReturn: number;
  inflationRate: number;
  monthlyContribution: number;
  status: string;
  referenceDate?: string;
}): GoalProjectionResult {
  const refDate = input.referenceDate || new Date().toISOString().slice(0, 10);
  const standaloneAmount = Math.max(0, input.standaloneAmount);
  const allocatedAmount = Math.max(0, input.allocatedAmount);
  const currentAmount = standaloneAmount + allocatedAmount;
  const targetAmount = Math.max(0, input.targetAmount);
  const hasTargetDate = Boolean(parseIsoDay(input.targetDate || ""));
  const monthsRemaining = hasTargetDate
    ? monthsBetweenDates(refDate, input.targetDate)
    : 0;

  const inflationRate = Math.max(0, input.inflationRate || 0);
  const inflationAdjustedTarget =
    hasTargetDate && monthsRemaining > 0 && inflationRate > 0
      ? targetAmount * Math.pow(1 + inflationRate / 100, monthsRemaining / 12)
      : targetAmount;

  const remainingNominal = Math.max(0, targetAmount - currentAmount);
  const remainingInflationAdjusted = Math.max(
    0,
    inflationAdjustedTarget - currentAmount
  );
  const completionPct = targetAmount > 0 ? currentAmount / targetAmount : 0;

  const horizonMonths = hasTargetDate ? monthsRemaining : 60;
  const baseReturn = Number.isFinite(input.expectedAnnualReturn)
    ? input.expectedAnnualReturn
    : 10;

  const buildScenario = (
    key: "conservative" | "moderate" | "optimistic",
    label: string,
    annualReturnPct: number
  ): GoalScenarioProjection => {
    const clampedReturn = Math.max(0, annualReturnPct);
    const projectedAtTarget = futureValueWithSip(
      currentAmount,
      input.monthlyContribution,
      clampedReturn,
      horizonMonths
    );
    const reqMonthly = hasTargetDate
      ? requiredMonthlySip(
          currentAmount,
          inflationAdjustedTarget,
          clampedReturn,
          monthsRemaining
        )
      : requiredMonthlySip(
          currentAmount,
          targetAmount,
          clampedReturn,
          60
        );
    const est = estimateMonthsToTarget({
      presentValue: currentAmount,
      monthlyContribution: input.monthlyContribution,
      targetValue: targetAmount,
      annualReturnPct: clampedReturn,
      annualInflationPct: inflationRate,
    });
    return {
      key,
      label,
      annualReturnPct: clampedReturn,
      projectedAtTarget: Math.round(projectedAtTarget),
      requiredMonthly: Math.round(reqMonthly),
      shortfallAtTarget: Math.round(
        Math.max(0, inflationAdjustedTarget - projectedAtTarget)
      ),
      monthsToComplete: est.months,
      expectedCompletionDate:
        est.months !== null ? addMonthsToIsoDate(refDate, est.months) : null,
    };
  };

  const conservative = buildScenario(
    "conservative",
    "Conservative",
    Math.max(0, baseReturn - 3)
  );
  const moderate = buildScenario("moderate", "Moderate", baseReturn);
  const optimistic = buildScenario("optimistic", "Optimistic", baseReturn + 3);

  const requiredMonthlyNominal = hasTargetDate
    ? requiredMonthlySip(currentAmount, targetAmount, baseReturn, monthsRemaining)
    : 0;
  const requiredMonthlyInflationAdjusted = hasTargetDate
    ? requiredMonthlySip(
        currentAmount,
        inflationAdjustedTarget,
        baseReturn,
        monthsRemaining
      )
    : 0;

  let expectedProgressPct: number | null = null;
  const createdIso = (input.createdAt || "").slice(0, 10);
  if (hasTargetDate && parseIsoDay(createdIso)) {
    const totalMonths = monthsBetweenDates(createdIso, input.targetDate);
    const elapsedMonths = monthsBetweenDates(createdIso, refDate);
    if (totalMonths > 0) {
      expectedProgressPct = Math.min(1, Math.max(0, elapsedMonths / totalMonths));
    }
  }

  let health: GoalHealth;
  if (input.status === "archived") {
    health = "archived";
  } else if (input.status === "paused") {
    health = "paused";
  } else if (
    input.status === "completed" ||
    (targetAmount > 0 && currentAmount >= targetAmount)
  ) {
    health = "completed";
  } else if (!hasTargetDate) {
    health =
      completionPct >= 0.5 || input.monthlyContribution > 0
        ? "on_track"
        : "attention";
  } else if (monthsRemaining === 0 && currentAmount < targetAmount) {
    health = "at_risk";
  } else if (
    moderate.projectedAtTarget >= inflationAdjustedTarget * 0.98 ||
    requiredMonthlyInflationAdjusted <= input.monthlyContribution * 1.05
  ) {
    health = "on_track";
  } else if (
    moderate.projectedAtTarget >= inflationAdjustedTarget * 0.78 ||
    requiredMonthlyInflationAdjusted <= Math.max(1, input.monthlyContribution) * 1.35
  ) {
    health = "attention";
  } else {
    health = "at_risk";
  }

  return {
    currentAmount: Math.round(currentAmount),
    standaloneAmount: Math.round(standaloneAmount),
    allocatedAmount: Math.round(allocatedAmount),
    targetAmount: Math.round(targetAmount),
    inflationAdjustedTarget: Math.round(inflationAdjustedTarget),
    remainingNominal: Math.round(remainingNominal),
    remainingInflationAdjusted: Math.round(remainingInflationAdjusted),
    completionPct,
    monthsRemaining,
    hasTargetDate,
    requiredMonthlyNominal: Math.round(requiredMonthlyNominal),
    requiredMonthlyInflationAdjusted: Math.round(requiredMonthlyInflationAdjusted),
    projectedAtTarget: moderate.projectedAtTarget,
    expectedProgressPct,
    health,
    scenarios: {
      conservative,
      moderate,
      optimistic,
    },
  };
}

export interface AllocationHoldingLike {
  id: number;
  name: string;
  assetClass: string;
  currency: string;
  investedAmount: number;
  currentValue: number;
  units: number;
  currentNav: number;
  plannedSip: number;
  maturityDate?: string | null;
  status: string;
  notes?: string | null;
  isEmergencyFund?: boolean;
}

export interface GoalAllocationRecordLike {
  id: number;
  goalId: number;
  holdingId: number;
  allocationType: string; // 'amount' | 'percentage'
  allocatedAmount: number;
  allocatedMinor: number;
  allocationPct: number;
  notes?: string | null;
}

export interface EffectiveAllocationDetail {
  id: number;
  goalId: number;
  holdingId: number;
  holdingName: string;
  assetClass: string;
  currency: string;
  allocationType: string;
  requestedInr: number;
  effectiveInr: number;
  effectiveInrMinor: number;
  allocationPct: number;
  holdingCurrentInr: number;
  holdingInvestedInr: number;
  holdingGainPct: number;
  holdingStatus: string;
  holdingMaturityDate: string;
  overAllocated: boolean;
  notes: string;
}

/**
 * Resolves effective INR allocation per (goal, holding) without ever double-counting
 * or exceeding any holding's current market value in INR.
 */
export function computeEffectiveHoldingAllocations(params: {
  holdings: AllocationHoldingLike[];
  allocations: GoalAllocationRecordLike[];
  usdInrRate: number;
}): {
  effectiveByAllocationId: Map<number, EffectiveAllocationDetail>;
  allocatedMinorByGoalId: Map<number, number>;
  allocatedMinorByHoldingId: Map<number, number>;
  availableMinorByHoldingId: Map<number, number>;
  holdingValueMinorById: Map<number, number>;
  overAllocatedHoldingIds: number[];
} {
  const holdingMap = new Map<number, AllocationHoldingLike>();
  const holdingValueMinorById = new Map<number, number>();
  const holdingValsMap = new Map<
    number,
    ReturnType<typeof holdingInrValues>
  >();

  for (const h of params.holdings) {
    holdingMap.set(h.id, h);
    const vals = holdingInrValues(h, params.usdInrRate);
    holdingValsMap.set(h.id, vals);
    holdingValueMinorById.set(h.id, vals.currentInrMinor);
  }

  const byHolding = new Map<number, GoalAllocationRecordLike[]>();
  for (const a of params.allocations) {
    const arr = byHolding.get(a.holdingId) ?? [];
    arr.push(a);
    byHolding.set(a.holdingId, arr);
  }

  const effectiveByAllocationId = new Map<number, EffectiveAllocationDetail>();
  const allocatedMinorByGoalId = new Map<number, number>();
  const allocatedMinorByHoldingId = new Map<number, number>();
  const availableMinorByHoldingId = new Map<number, number>();
  const overAllocatedHoldingIds: number[] = [];

  for (const [holdingId, h] of holdingMap.entries()) {
    const list = byHolding.get(holdingId) ?? [];
    const vals = holdingValsMap.get(holdingId)!;
    const capMinor = Math.max(0, vals.currentInrMinor);

    const rawItems = list.map((a) => {
      const rawMinor =
        a.allocationType === "percentage"
          ? Math.round(capMinor * (Math.max(0, Math.min(100, a.allocationPct)) / 100))
          : Math.max(0, a.allocatedMinor || toMinorUnits(a.allocatedAmount, "INR"));
      return { alloc: a, rawMinor };
    });

    const totalRawMinor = rawItems.reduce((s, x) => s + x.rawMinor, 0);
    const overAllocated = totalRawMinor > capMinor && totalRawMinor > 0;
    if (overAllocated) {
      overAllocatedHoldingIds.push(holdingId);
    }

    let runningEffectiveMinor = 0;
    rawItems.forEach(({ alloc, rawMinor }, idx) => {
      let effMinor = rawMinor;
      if (overAllocated) {
        if (capMinor === 0) {
          effMinor = 0;
        } else if (idx === rawItems.length - 1) {
          // Ensure exact conservation without exceeding capMinor due to rounding
          effMinor = Math.min(
            rawMinor,
            Math.max(0, capMinor - runningEffectiveMinor)
          );
        } else {
          effMinor = Math.floor((rawMinor * capMinor) / totalRawMinor);
        }
      }
      runningEffectiveMinor += effMinor;

      const effectivePct =
        capMinor > 0
          ? (effMinor / capMinor) * 100
          : alloc.allocationType === "percentage"
            ? alloc.allocationPct
            : 0;

      effectiveByAllocationId.set(alloc.id, {
        id: alloc.id,
        goalId: alloc.goalId,
        holdingId,
        holdingName: h.name,
        assetClass: h.assetClass,
        currency: h.currency,
        allocationType: alloc.allocationType,
        requestedInr: fromMinorUnits(rawMinor, "INR"),
        effectiveInr: fromMinorUnits(effMinor, "INR"),
        effectiveInrMinor: effMinor,
        allocationPct: Math.round(effectivePct * 100) / 100,
        holdingCurrentInr: vals.currentInr,
        holdingInvestedInr: vals.investedInr,
        holdingGainPct: vals.gainPct,
        holdingStatus: h.status,
        holdingMaturityDate: h.maturityDate ?? "",
        overAllocated,
        notes: alloc.notes ?? "",
      });

      allocatedMinorByGoalId.set(
        alloc.goalId,
        (allocatedMinorByGoalId.get(alloc.goalId) ?? 0) + effMinor
      );
    });

    allocatedMinorByHoldingId.set(holdingId, runningEffectiveMinor);
    availableMinorByHoldingId.set(
      holdingId,
      Math.max(0, capMinor - runningEffectiveMinor)
    );
  }

  return {
    effectiveByAllocationId,
    allocatedMinorByGoalId,
    allocatedMinorByHoldingId,
    availableMinorByHoldingId,
    holdingValueMinorById,
    overAllocatedHoldingIds,
  };
}

export interface FireCalculationInput {
  currentAge: number | null;
  plannedRetirementAge: number;
  monthlyExpenses: number;
  annualInflationPct: number;
  currentInvestableCorpus: number;
  monthlyInvestment: number;
  expectedReturnPct: number;
  withdrawalRatePct: number;
  taxDragPct: number;
  otherRetirementIncomeMonthly: number;
  currentYear?: number;
}

export interface FireScenarioResult {
  key: "conservative" | "moderate" | "optimistic";
  label: string;
  expectedReturnPct: number;
  withdrawalRatePct: number;
  fireYears: number | null;
  fireYear: number | null;
  fireAge: number | null;
  monthlyInvestmentRequired: number;
  projectionSeries: Array<{
    yearOffset: number;
    year: number;
    age: number | null;
    projectedCorpus: number;
    requiredCorpus: number;
    annualExpenses: number;
  }>;
}

export interface FireAnalysisResult {
  annualExpensesToday: number;
  estimatedFutureAnnualExpenses: number;
  requiredCorpusToday: number;
  requiredCorpusAtTarget: number;
  currentFireProgressPct: number;
  additionalCorpusRequired: number;
  monthlyInvestmentRequired: number;
  estimatedFireYears: number | null;
  estimatedFireYear: number | null;
  estimatedFireAge: number | null;
  horizonYears: number;
  scenarios: {
    conservative: FireScenarioResult;
    moderate: FireScenarioResult;
    optimistic: FireScenarioResult;
  };
}

export function calculateFireAnalysis(
  input: FireCalculationInput
): FireAnalysisResult {
  const baseYear = input.currentYear ?? new Date().getUTCFullYear();
  const monthlyExpenses = Math.max(0, input.monthlyExpenses);
  const annualExpensesToday = monthlyExpenses * 12;
  const inflation = Math.max(0, input.annualInflationPct) / 100;
  const otherAnnualToday = Math.max(0, input.otherRetirementIncomeMonthly) * 12;
  const taxFactor = Math.max(0.25, 1 - Math.max(0, Math.min(50, input.taxDragPct)) / 100);
  const currentCorpus = Math.max(0, input.currentInvestableCorpus);
  const monthlySip = Math.max(0, input.monthlyInvestment);

  const horizonYears =
    input.currentAge !== null && input.currentAge > 0
      ? Math.max(1, input.plannedRetirementAge - input.currentAge)
      : 15;

  const computeRequiredCorpusAtYear = (
    yearOffset: number,
    withdrawalRatePct: number
  ) => {
    const swr = Math.max(0.01, withdrawalRatePct / 100);
    const futureExpenses = annualExpensesToday * Math.pow(1 + inflation, yearOffset);
    const futureOther = otherAnnualToday * Math.pow(1 + inflation, yearOffset);
    const netGap = Math.max(0, futureExpenses - futureOther);
    const grossNeeded = netGap / taxFactor;
    return {
      futureExpenses,
      requiredCorpus: grossNeeded / swr,
    };
  };

  const simulateScenario = (
    key: "conservative" | "moderate" | "optimistic",
    label: string,
    retPct: number,
    swrPct: number
  ): FireScenarioResult => {
    const safeRet = Math.max(0, retPct);
    const safeSwr = Math.max(1, swrPct);
    const maxYears = 45;
    const series: FireScenarioResult["projectionSeries"] = [];
    let fireYears: number | null = null;

    for (let y = 0; y <= maxYears; y++) {
      const projectedCorpus = futureValueWithSip(
        currentCorpus,
        monthlySip,
        safeRet,
        y * 12
      );
      const { futureExpenses, requiredCorpus } = computeRequiredCorpusAtYear(
        y,
        safeSwr
      );
      if (fireYears === null && requiredCorpus > 0 && projectedCorpus >= requiredCorpus) {
        fireYears = y;
      } else if (fireYears === null && requiredCorpus === 0 && annualExpensesToday > 0) {
        fireYears = 0;
      }
      series.push({
        yearOffset: y,
        year: baseYear + y,
        age: input.currentAge !== null ? input.currentAge + y : null,
        projectedCorpus: Math.round(projectedCorpus),
        requiredCorpus: Math.round(requiredCorpus),
        annualExpenses: Math.round(futureExpenses),
      });
    }

    const reqAtTarget = computeRequiredCorpusAtYear(horizonYears, safeSwr).requiredCorpus;
    const reqMonthly = requiredMonthlySip(
      currentCorpus,
      reqAtTarget,
      safeRet,
      horizonYears * 12
    );

    return {
      key,
      label,
      expectedReturnPct: safeRet,
      withdrawalRatePct: safeSwr,
      fireYears,
      fireYear: fireYears !== null ? baseYear + fireYears : null,
      fireAge:
        fireYears !== null && input.currentAge !== null
          ? input.currentAge + fireYears
          : null,
      monthlyInvestmentRequired: Math.round(reqMonthly),
      projectionSeries: series.slice(0, 36),
    };
  };

  const conservative = simulateScenario(
    "conservative",
    "Conservative",
    Math.max(2, input.expectedReturnPct - 2.5),
    Math.max(2, input.withdrawalRatePct - 0.5)
  );
  const moderate = simulateScenario(
    "moderate",
    "Moderate",
    input.expectedReturnPct,
    input.withdrawalRatePct
  );
  const optimistic = simulateScenario(
    "optimistic",
    "Optimistic",
    input.expectedReturnPct + 2,
    input.withdrawalRatePct + 0.5
  );

  const todayReq = computeRequiredCorpusAtYear(0, input.withdrawalRatePct);
  const targetReq = computeRequiredCorpusAtYear(
    horizonYears,
    input.withdrawalRatePct
  );

  const currentFireProgressPct =
    todayReq.requiredCorpus > 0
      ? currentCorpus / todayReq.requiredCorpus
      : 0;

  return {
    annualExpensesToday: Math.round(annualExpensesToday),
    estimatedFutureAnnualExpenses: Math.round(targetReq.futureExpenses),
    requiredCorpusToday: Math.round(todayReq.requiredCorpus),
    requiredCorpusAtTarget: Math.round(targetReq.requiredCorpus),
    currentFireProgressPct,
    additionalCorpusRequired: Math.round(
      Math.max(0, targetReq.requiredCorpus - currentCorpus)
    ),
    monthlyInvestmentRequired: moderate.monthlyInvestmentRequired,
    estimatedFireYears: moderate.fireYears,
    estimatedFireYear: moderate.fireYear,
    estimatedFireAge: moderate.fireAge,
    horizonYears,
    scenarios: {
      conservative,
      moderate,
      optimistic,
    },
  };
}

export interface RetirementPlanInput {
  currentAge: number;
  retirementAge: number;
  lifeExpectancy: number;
  currentRetirementCorpus: number;
  monthlyRetirementInvestment: number;
  expectedReturnPct: number;
  inflationPct: number;
  expectedMonthlyExpensesToday: number;
  otherRetirementIncomeMonthly: number;
  withdrawalRatePct: number;
}

export function calculateRetirementPlan(input: RetirementPlanInput) {
  const yearsRemaining = Math.max(0, input.retirementAge - input.currentAge);
  const yearsInRetirement = Math.max(1, input.lifeExpectancy - input.retirementAge);
  const inflation = Math.max(0, input.inflationPct) / 100;
  const futureMonthlyExpenses =
    Math.max(0, input.expectedMonthlyExpensesToday) *
    Math.pow(1 + inflation, yearsRemaining);
  const futureAnnualExpenses = futureMonthlyExpenses * 12;
  const futureOtherAnnual =
    Math.max(0, input.otherRetirementIncomeMonthly) *
    12 *
    Math.pow(1 + inflation, yearsRemaining);
  const netAnnualRetirementNeed = Math.max(0, futureAnnualExpenses - futureOtherAnnual);

  // Required corpus based on configurable withdrawal rate (and annuity cross-check)
  const swr = Math.max(0.01, input.withdrawalRatePct / 100);
  const requiredCorpusSwr = netAnnualRetirementNeed / swr;

  // Present value of inflation-indexed annuity over yearsInRetirement assuming conservative post-retirement nominal return = max(6%, expectedReturn - 2%)
  const postRetReturn = Math.max(0.04, (input.expectedReturnPct - 2) / 100);
  const realPostReturn = (1 + postRetReturn) / (1 + inflation) - 1;
  let requiredCorpusAnnuity = netAnnualRetirementNeed * yearsInRetirement;
  if (Math.abs(realPostReturn) > 1e-6) {
    requiredCorpusAnnuity =
      netAnnualRetirementNeed *
      ((1 - Math.pow(1 + realPostReturn, -yearsInRetirement)) / realPostReturn);
  }

  const requiredRetirementCorpus = Math.round(requiredCorpusSwr);
  const projectedCorpus = Math.round(
    futureValueWithSip(
      input.currentRetirementCorpus,
      input.monthlyRetirementInvestment,
      input.expectedReturnPct,
      yearsRemaining * 12
    )
  );
  const requiredMonthlyTotal = Math.round(
    requiredMonthlySip(
      input.currentRetirementCorpus,
      requiredRetirementCorpus,
      input.expectedReturnPct,
      yearsRemaining * 12
    )
  );
  const monthlyInvestmentShortfall = Math.max(
    0,
    requiredMonthlyTotal - Math.max(0, input.monthlyRetirementInvestment)
  );
  const readinessPct =
    requiredRetirementCorpus > 0
      ? projectedCorpus / requiredRetirementCorpus
      : 0;

  return {
    yearsRemaining,
    yearsInRetirement,
    futureMonthlyExpenses: Math.round(futureMonthlyExpenses),
    futureAnnualExpenses: Math.round(futureAnnualExpenses),
    netAnnualRetirementNeed: Math.round(netAnnualRetirementNeed),
    requiredRetirementCorpus,
    requiredCorpusAnnuityReference: Math.round(requiredCorpusAnnuity),
    projectedCorpus,
    corpusShortfall: Math.max(0, requiredRetirementCorpus - projectedCorpus),
    requiredMonthlyTotal,
    monthlyInvestmentShortfall,
    readinessPct,
  };
}

export interface SimulationBaseline {
  monthlySalary: number;
  monthlyRental: number;
  monthlyDividend: number;
  monthlyOtherIncome: number;
  monthlyExpenses: number; // base living expenses
  monthlyInsurance: number;
  monthlySip: number;
  investableCorpus: number;
  nonInvestableAssets: number; // physical + other non-portfolio assets
  expectedReturnPct: number;
  inflationPct: number;
  withdrawalRatePct: number;
  taxDragPct: number;
  loans: Array<{
    id: number;
    name: string;
    currentBalance: number;
    interestRate: number;
    emiAmount: number;
  }>;
  goals: Array<{
    id: number;
    name: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    expectedAnnualReturn: number;
    inflationRate: number;
    monthlyContribution: number;
  }>;
}

export interface WhatIfAdjustments {
  salaryChangePct: number;
  additionalRentalMonthly: number;
  additionalPassiveMonthly: number;
  sipDeltaMonthly: number;
  pauseSipMonths: number;
  annualLumpSumAddition: number;
  returnRateOverridePct: number | null;
  marketShockPct: number; // e.g. -20 for 20% decline
  newMonthlyExpenseDelta: number;
  oneTimeExpense: number;
  loanPrepaymentAmount: number;
  emiDeltaMonthly: number;
  closeLoanIds: number[];
}

export const DEFAULT_WHAT_IF_ADJUSTMENTS: WhatIfAdjustments = {
  salaryChangePct: 0,
  additionalRentalMonthly: 0,
  additionalPassiveMonthly: 0,
  sipDeltaMonthly: 0,
  pauseSipMonths: 0,
  annualLumpSumAddition: 0,
  returnRateOverridePct: null,
  marketShockPct: 0,
  newMonthlyExpenseDelta: 0,
  oneTimeExpense: 0,
  loanPrepaymentAmount: 0,
  emiDeltaMonthly: 0,
  closeLoanIds: [],
};

export interface SimulationTrajectoryPoint {
  year: number;
  month: number;
  investmentCorpus: number;
  remainingDebt: number;
  netWorth: number;
  requiredFireCorpus: number;
}

export interface SingleSimulationResult {
  monthlyIncome: number;
  monthlyExpensesTotal: number;
  monthlyEmi: number;
  monthlySip: number;
  monthlySurplus: number;
  startingCorpus: number;
  startingDebt: number;
  startingNetWorth: number;
  fireMonths: number | null;
  fireYears: number | null;
  debtFreeMonths: number;
  horizons: {
    y5: { corpus: number; debt: number; netWorth: number };
    y10: { corpus: number; debt: number; netWorth: number };
    y15: { corpus: number; debt: number; netWorth: number };
    y20: { corpus: number; debt: number; netWorth: number };
  };
  trajectory: SimulationTrajectoryPoint[];
  goalImpacts: Array<{
    id: number;
    name: string;
    monthsToComplete: number | null;
    projectedAtTarget: number;
    requiredMonthly: number;
  }>;
}

function runSingleSimulation(
  baseline: SimulationBaseline,
  adj: WhatIfAdjustments,
  referenceDate: string
): SingleSimulationResult {
  const adjSalary =
    baseline.monthlySalary * (1 + (adj.salaryChangePct || 0) / 100);
  const adjRental = Math.max(
    0,
    baseline.monthlyRental + (adj.additionalRentalMonthly || 0)
  );
  const adjPassive = Math.max(
    0,
    baseline.monthlyDividend +
      baseline.monthlyOtherIncome +
      (adj.additionalPassiveMonthly || 0)
  );
  const monthlyIncome = Math.max(0, adjSalary + adjRental + adjPassive);

  const baseExpenses = Math.max(
    0,
    baseline.monthlyExpenses + (adj.newMonthlyExpenseDelta || 0)
  );
  const monthlySip = Math.max(0, baseline.monthlySip + (adj.sipDeltaMonthly || 0));
  const annualReturnPct = Math.max(
    -50,
    adj.returnRateOverridePct !== null
      ? adj.returnRateOverridePct
      : baseline.expectedReturnPct
  );
  const rm = effectiveMonthlyRate(annualReturnPct);
  const infAnnual = Math.max(0, baseline.inflationPct) / 100;
  const swr = Math.max(0.01, baseline.withdrawalRatePct / 100);
  const taxFactor = Math.max(
    0.25,
    1 - Math.max(0, Math.min(50, baseline.taxDragPct)) / 100
  );

  // Clone loans safely without mutating baseline
  const closeSet = new Set(adj.closeLoanIds || []);
  let simLoans = baseline.loans
    .filter((l) => !closeSet.has(l.id) && l.currentBalance > 0)
    .map((l) => ({ ...l }))
    .sort((a, b) => b.interestRate - a.interestRate);

  // Apply loan prepayment to highest-interest loans first
  let prepayRemaining = Math.max(0, adj.loanPrepaymentAmount || 0);
  for (const l of simLoans) {
    if (prepayRemaining <= 0) break;
    const pay = Math.min(l.currentBalance, prepayRemaining);
    l.currentBalance -= pay;
    prepayRemaining -= pay;
  }
  simLoans = simLoans.filter((l) => l.currentBalance > 0);

  // Apply immediate market shock & one-time expense / prepayment cash impact
  let corpus = Math.max(
    0,
    baseline.investableCorpus * (1 + (adj.marketShockPct || 0) / 100) -
      Math.max(0, adj.oneTimeExpense || 0)
  );
  const startingCorpus = corpus;

  const startingDebt = simLoans.reduce((s, l) => s + l.currentBalance, 0);
  const startingEmi = simLoans.reduce((s, l) => s + l.emiAmount, 0);
  const startingNetWorth =
    corpus + baseline.nonInvestableAssets - startingDebt;
  const monthlySurplus =
    monthlyIncome -
    baseExpenses -
    baseline.monthlyInsurance -
    startingEmi -
    (adj.pauseSipMonths > 0 ? 0 : monthlySip);

  const trajectory: SimulationTrajectoryPoint[] = [];
  let fireMonths: number | null = null;
  let debtFreeMonths = startingDebt <= 0 ? 0 : -1;

  const computeReqFire = (m: number) => {
    const annualExp =
      (baseExpenses + baseline.monthlyInsurance) *
      12 *
      Math.pow(1 + infAnnual, m / 12);
    return annualExp / taxFactor / swr;
  };

  if (computeReqFire(0) > 0 && corpus >= computeReqFire(0)) {
    fireMonths = 0;
  }

  trajectory.push({
    year: 0,
    month: 0,
    investmentCorpus: Math.round(corpus),
    remainingDebt: Math.round(startingDebt),
    netWorth: Math.round(startingNetWorth),
    requiredFireCorpus: Math.round(computeReqFire(0)),
  });

  const horizons = {
    y5: { corpus: 0, debt: 0, netWorth: 0 },
    y10: { corpus: 0, debt: 0, netWorth: 0 },
    y15: { corpus: 0, debt: 0, netWorth: 0 },
    y20: { corpus: 0, debt: 0, netWorth: 0 },
  };

  for (let m = 1; m <= 240; m++) {
    const sipThisMonth = m <= (adj.pauseSipMonths || 0) ? 0 : monthlySip;
    const lumpThisMonth =
      m % 12 === 0 ? Math.max(0, adj.annualLumpSumAddition || 0) : 0;

    corpus = Math.max(0, corpus * (1 + rm) + sipThisMonth + lumpThisMonth);

    // Step loan balances
    let extraEmiBudget = Math.max(0, adj.emiDeltaMonthly || 0);
    let totalDebt = 0;
    for (const l of simLoans) {
      if (l.currentBalance <= 0) continue;
      const monthlyInterest = (l.currentBalance * (l.interestRate / 100)) / 12;
      const payment = l.emiAmount + extraEmiBudget;
      extraEmiBudget = 0; // apply extra EMI to highest interest active loan
      const newBal = Math.max(0, l.currentBalance + monthlyInterest - payment);
      l.currentBalance = newBal;
      totalDebt += newBal;
    }
    if (debtFreeMonths === -1 && totalDebt <= 1) {
      debtFreeMonths = m;
    }

    const netWorth = corpus + baseline.nonInvestableAssets - totalDebt;
    const reqFire = computeReqFire(m);
    if (fireMonths === null && reqFire > 0 && corpus >= reqFire) {
      fireMonths = m;
    }

    if (m % 12 === 0) {
      trajectory.push({
        year: m / 12,
        month: m,
        investmentCorpus: Math.round(corpus),
        remainingDebt: Math.round(totalDebt),
        netWorth: Math.round(netWorth),
        requiredFireCorpus: Math.round(reqFire),
      });
    }

    if (m === 60) {
      horizons.y5 = {
        corpus: Math.round(corpus),
        debt: Math.round(totalDebt),
        netWorth: Math.round(netWorth),
      };
    } else if (m === 120) {
      horizons.y10 = {
        corpus: Math.round(corpus),
        debt: Math.round(totalDebt),
        netWorth: Math.round(netWorth),
      };
    } else if (m === 180) {
      horizons.y15 = {
        corpus: Math.round(corpus),
        debt: Math.round(totalDebt),
        netWorth: Math.round(netWorth),
      };
    } else if (m === 240) {
      horizons.y20 = {
        corpus: Math.round(corpus),
        debt: Math.round(totalDebt),
        netWorth: Math.round(netWorth),
      };
    }
  }

  // Goal impacts: scale each goal's contribution proportionally if SIP changed, and reflect market shock
  const sipRatio =
    baseline.monthlySip > 0 ? monthlySip / baseline.monthlySip : 1;
  const shockFactor = 1 + (adj.marketShockPct || 0) / 100;

  const goalImpacts = baseline.goals.map((g) => {
    const simCurrent = Math.max(0, g.currentAmount * shockFactor);
    const simContrib =
      g.monthlyContribution > 0
        ? g.monthlyContribution * sipRatio
        : adj.sipDeltaMonthly > 0 && baseline.goals.length > 0
          ? adj.sipDeltaMonthly / baseline.goals.length
          : 0;
    const simReturn =
      adj.returnRateOverridePct !== null
        ? adj.returnRateOverridePct
        : g.expectedAnnualReturn;
    const proj = computeGoalProjection({
      targetAmount: g.targetAmount,
      standaloneAmount: simCurrent,
      allocatedAmount: 0,
      targetDate: g.targetDate,
      expectedAnnualReturn: simReturn,
      inflationRate: g.inflationRate,
      monthlyContribution: simContrib,
      status: "active",
      referenceDate,
    });
    return {
      id: g.id,
      name: g.name,
      monthsToComplete: proj.scenarios.moderate.monthsToComplete,
      projectedAtTarget: proj.projectedAtTarget,
      requiredMonthly: proj.requiredMonthlyInflationAdjusted,
    };
  });

  return {
    monthlyIncome: Math.round(monthlyIncome),
    monthlyExpensesTotal: Math.round(
      baseExpenses + baseline.monthlyInsurance + startingEmi
    ),
    monthlyEmi: Math.round(startingEmi),
    monthlySip: Math.round(monthlySip),
    monthlySurplus: Math.round(monthlySurplus),
    startingCorpus: Math.round(startingCorpus),
    startingDebt: Math.round(startingDebt),
    startingNetWorth: Math.round(startingNetWorth),
    fireMonths,
    fireYears:
      fireMonths !== null ? Math.round((fireMonths / 12) * 10) / 10 : null,
    debtFreeMonths: debtFreeMonths === -1 ? 240 : debtFreeMonths,
    horizons,
    trajectory,
    goalImpacts,
  };
}

export function runWhatIfSimulation(
  baseline: SimulationBaseline,
  adjustments: WhatIfAdjustments,
  referenceDate?: string
) {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  const baseResult = runSingleSimulation(
    baseline,
    DEFAULT_WHAT_IF_ADJUSTMENTS,
    ref
  );
  const scenarioResult = runSingleSimulation(baseline, adjustments, ref);

  return {
    baseline: baseResult,
    scenario: scenarioResult,
    deltas: {
      monthlySurplusDelta:
        scenarioResult.monthlySurplus - baseResult.monthlySurplus,
      y5NetWorthDelta:
        scenarioResult.horizons.y5.netWorth - baseResult.horizons.y5.netWorth,
      y10NetWorthDelta:
        scenarioResult.horizons.y10.netWorth -
        baseResult.horizons.y10.netWorth,
      y20NetWorthDelta:
        scenarioResult.horizons.y20.netWorth -
        baseResult.horizons.y20.netWorth,
      y10CorpusDelta:
        scenarioResult.horizons.y10.corpus - baseResult.horizons.y10.corpus,
      fireMonthsDelta:
        scenarioResult.fireMonths !== null && baseResult.fireMonths !== null
          ? scenarioResult.fireMonths - baseResult.fireMonths
          : null,
    },
  };
}

export function classifyHoldingLiquidity(
  holding: {
    assetClass: string;
    maturityDate?: string | null;
    notes?: string | null;
    status: string;
    isEmergencyFund?: boolean;
  },
  referenceDate?: string
): {
  bucket: LiquidityBucket;
  label: string;
  reason: string;
  daysToMaturity: number | null;
} {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  const cls = holding.assetClass.toLowerCase();
  const notes = (holding.notes || "").toLowerCase();
  const matDate = (holding.maturityDate || "").trim();

  let daysToMaturity: number | null = null;
  if (parseIsoDay(matDate)) {
    const matMs = Date.parse(`${matDate}T00:00:00Z`);
    const refMs = Date.parse(`${ref}T00:00:00Z`);
    daysToMaturity = Math.round((matMs - refMs) / 86_400_000);
  }

  // Explicitly locked retirement / ESOP instruments
  if (LOCKED_ASSET_CLASSES.has(cls)) {
    if (cls === "ppf" && daysToMaturity !== null && daysToMaturity <= 0) {
      return {
        bucket: "relatively_liquid",
        label: LIQUIDITY_LABELS.relatively_liquid,
        reason: "PPF has reached or passed maturity date",
        daysToMaturity,
      };
    }
    return {
      bucket: "restricted_locked",
      label: LIQUIDITY_LABELS.restricted_locked,
      reason: `${cls.toUpperCase()} has statutory lock-in / vesting restrictions`,
      daysToMaturity,
    };
  }

  // Notes indicating lock-in (e.g. ELSS 3-year lock-in, pledged, restricted)
  if (/\b(elss|lock[- ]?in|locked|pledged|restricted)\b/i.test(notes)) {
    return {
      bucket: "restricted_locked",
      label: LIQUIDITY_LABELS.restricted_locked,
      reason: "Notes indicate lock-in or restriction",
      daysToMaturity,
    };
  }

  // Notes indicating instant/liquid fund
  if (/\b(liquid|overnight|instant|savings|sweep)\b/i.test(notes)) {
    return {
      bucket: "immediately_accessible",
      label: LIQUIDITY_LABELS.immediately_accessible,
      reason: "Liquid / overnight / instant-access instrument",
      daysToMaturity,
    };
  }

  // Fixed / term / maturity-based instruments
  if (cls === "fd" || cls === "rd" || cls === "chit" || cls === "bond") {
    if (daysToMaturity !== null) {
      if (daysToMaturity <= 0) {
        return {
          bucket: "immediately_accessible",
          label: LIQUIDITY_LABELS.immediately_accessible,
          reason: `Matured on ${matDate}`,
          daysToMaturity,
        };
      }
      return {
        bucket: "maturity_based",
        label: LIQUIDITY_LABELS.maturity_based,
        reason: `Matures on ${matDate} (${daysToMaturity}d)`,
        daysToMaturity,
      };
    }
    if (holding.isEmergencyFund && (cls === "fd" || cls === "rd")) {
      return {
        bucket: "relatively_liquid",
        label: LIQUIDITY_LABELS.relatively_liquid,
        reason: "Breakable emergency deposit (no maturity date recorded)",
        daysToMaturity,
      };
    }
    return {
      bucket: "unknown",
      label: LIQUIDITY_LABELS.unknown,
      reason: "Maturity date not recorded",
      daysToMaturity,
    };
  }

  // Market-traded instruments (MF, Stocks, ETFs, Gold/Silver)
  if (
    cls === "mutual_fund" ||
    cls === "stock" ||
    cls === "etf_in" ||
    cls === "etf_us" ||
    cls === "gold_silver"
  ) {
    return {
      bucket: "relatively_liquid",
      label: LIQUIDITY_LABELS.relatively_liquid,
      reason: "Market-traded (T+1 to T+3 settlement, subject to market price)",
      daysToMaturity,
    };
  }

  return {
    bucket: "unknown",
    label: LIQUIDITY_LABELS.unknown,
    reason: "Liquidity profile not explicitly classified",
    daysToMaturity,
  };
}

export interface ConcentrationThresholds {
  holdingWarnPct: number;
  categoryWarnPct: number;
  currencyWarnPct: number;
}

export function analyzePortfolioRiskAndLiquidity(params: {
  holdings: AllocationHoldingLike[];
  assets: Array<{
    id: number;
    name: string;
    assetType: string;
    currency: string;
    currentValue: number;
  }>;
  goals: Array<{
    id: number;
    name: string;
    category: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    status: string;
  }>;
  allocations: GoalAllocationRecordLike[];
  usdInrRate: number;
  thresholds: ConcentrationThresholds;
  referenceDate?: string;
}) {
  const ref = params.referenceDate || new Date().toISOString().slice(0, 10);
  const activeHoldings = params.holdings.filter((h) => h.status !== "closed");

  const enrichedHoldings = activeHoldings.map((h) => {
    const vals = holdingInrValues(h, params.usdInrRate);
    const liq = classifyHoldingLiquidity(h, ref);
    return {
      id: h.id,
      name: h.name,
      assetClass: h.assetClass,
      currency: h.currency.toUpperCase(),
      currentInr: Math.round(vals.currentInr),
      currentInrMinor: vals.currentInrMinor,
      maturityDate: h.maturityDate ?? "",
      isEmergencyFund: Boolean(h.isEmergencyFund),
      isVolatile: VOLATILE_ASSET_CLASSES.has(h.assetClass.toLowerCase()),
      ...liq,
    };
  });

  const totalPortfolioMinor = enrichedHoldings.reduce(
    (s, h) => s + h.currentInrMinor,
    0
  );
  const totalPortfolioInr = fromMinorUnits(totalPortfolioMinor, "INR");

  // Concentration by holding
  const holdingConcentration = [...enrichedHoldings]
    .sort((a, b) => b.currentInrMinor - a.currentInrMinor)
    .map((h) => ({
      ...h,
      pct:
        totalPortfolioMinor > 0
          ? (h.currentInrMinor / totalPortfolioMinor) * 100
          : 0,
    }));

  const topFiveHoldings = holdingConcentration.slice(0, 5);
  const topFivePct = topFiveHoldings.reduce((s, h) => s + h.pct, 0);

  // Concentration by category
  const catTotals = new Map<string, number>();
  const currencyTotals = new Map<string, number>();
  for (const h of enrichedHoldings) {
    catTotals.set(
      h.assetClass,
      (catTotals.get(h.assetClass) ?? 0) + h.currentInrMinor
    );
    currencyTotals.set(
      h.currency,
      (currencyTotals.get(h.currency) ?? 0) + h.currentInrMinor
    );
  }

  const categoryExposure = Array.from(catTotals.entries())
    .map(([assetClass, minor]) => ({
      assetClass,
      amountInr: Math.round(fromMinorUnits(minor, "INR")),
      pct: totalPortfolioMinor > 0 ? (minor / totalPortfolioMinor) * 100 : 0,
    }))
    .sort((a, b) => b.amountInr - a.amountInr);

  const currencyExposure = Array.from(currencyTotals.entries())
    .map(([currency, minor]) => ({
      currency,
      amountInr: Math.round(fromMinorUnits(minor, "INR")),
      pct: totalPortfolioMinor > 0 ? (minor / totalPortfolioMinor) * 100 : 0,
    }))
    .sort((a, b) => b.amountInr - a.amountInr);

  const concentrationAlerts: Array<{
    type: "holding" | "category" | "currency";
    subject: string;
    pct: number;
    thresholdPct: number;
    message: string;
  }> = [];

  for (const h of holdingConcentration) {
    if (h.pct > params.thresholds.holdingWarnPct) {
      concentrationAlerts.push({
        type: "holding",
        subject: h.name,
        pct: Math.round(h.pct * 10) / 10,
        thresholdPct: params.thresholds.holdingWarnPct,
        message: `${h.name} represents ${h.pct.toFixed(1)}% of portfolio (above ${params.thresholds.holdingWarnPct}% threshold).`,
      });
    }
  }
  for (const c of categoryExposure) {
    if (c.pct > params.thresholds.categoryWarnPct) {
      concentrationAlerts.push({
        type: "category",
        subject: c.assetClass,
        pct: Math.round(c.pct * 10) / 10,
        thresholdPct: params.thresholds.categoryWarnPct,
        message: `${c.assetClass} represents ${c.pct.toFixed(1)}% of portfolio (above ${params.thresholds.categoryWarnPct}% threshold).`,
      });
    }
  }
  for (const cur of currencyExposure) {
    if (cur.currency !== "INR" && cur.pct > params.thresholds.currencyWarnPct) {
      concentrationAlerts.push({
        type: "currency",
        subject: cur.currency,
        pct: Math.round(cur.pct * 10) / 10,
        thresholdPct: params.thresholds.currencyWarnPct,
        message: `${cur.currency} exposure is ${cur.pct.toFixed(1)}% of portfolio (above ${params.thresholds.currencyWarnPct}% non-INR threshold).`,
      });
    }
  }

  // Liquidity breakdown across portfolio
  const liquidityTotals = new Map<LiquidityBucket, number>();
  for (const h of enrichedHoldings) {
    liquidityTotals.set(
      h.bucket,
      (liquidityTotals.get(h.bucket) ?? 0) + h.currentInrMinor
    );
  }
  const liquidityBreakdown = (
    [
      "immediately_accessible",
      "relatively_liquid",
      "maturity_based",
      "restricted_locked",
      "unknown",
    ] as LiquidityBucket[]
  ).map((bucket) => {
    const minor = liquidityTotals.get(bucket) ?? 0;
    return {
      bucket,
      label: LIQUIDITY_LABELS[bucket],
      amountInr: Math.round(fromMinorUnits(minor, "INR")),
      pct: totalPortfolioMinor > 0 ? (minor / totalPortfolioMinor) * 100 : 0,
    };
  });

  const liquidPortfolioMinor =
    (liquidityTotals.get("immediately_accessible") ?? 0) +
    (liquidityTotals.get("relatively_liquid") ?? 0);
  const liquidAssetsInr = Math.round(fromMinorUnits(liquidPortfolioMinor, "INR"));
  const liquidAssetsPct =
    totalPortfolioMinor > 0
      ? (liquidPortfolioMinor / totalPortfolioMinor) * 100
      : 0;

  // Cash in asset register
  const cashRegisterInr = Math.round(
    params.assets
      .filter((a) => a.assetType === "financial_cash")
      .reduce((s, a) => {
        const m = toMinorUnits(a.currentValue, a.currency);
        const fx = a.currency.toUpperCase() === "USD" ? params.usdInrRate : 1;
        return s + fromMinorUnits(m, a.currency) * fx;
      }, 0)
  );

  // Goal-specific risk & maturity mismatches
  const { effectiveByAllocationId } = computeEffectiveHoldingAllocations({
    holdings: params.holdings,
    allocations: params.allocations,
    usdInrRate: params.usdInrRate,
  });

  const holdingById = new Map(enrichedHoldings.map((h) => [h.id, h]));
  const maturityMismatches: Array<{
    goalId: number;
    goalName: string;
    goalTargetDate: string;
    holdingId: number;
    holdingName: string;
    holdingMaturityDate: string;
    allocatedInr: number;
  }> = [];

  const goalRisks = params.goals
    .filter((g) => g.status !== "archived")
    .map((g) => {
      const allocs = Array.from(effectiveByAllocationId.values()).filter(
        (a) => a.goalId === g.id
      );
      const totalAllocatedInr = allocs.reduce((s, a) => s + a.effectiveInr, 0);
      const totalGoalCurrent = g.currentAmount + totalAllocatedInr;
      const fundingGap = Math.max(0, g.targetAmount - totalGoalCurrent);

      let volatileInr = 0;
      let illiquidInr = 0;
      let maturingBeforeGoalInr = 0;
      let maxHoldingSharePct = 0;
      const mismatchHoldings: string[] = [];

      for (const a of allocs) {
        const h = holdingById.get(a.holdingId);
        if (!h) continue;
        if (totalAllocatedInr > 0) {
          const share = (a.effectiveInr / totalAllocatedInr) * 100;
          if (share > maxHoldingSharePct) maxHoldingSharePct = share;
        }
        if (h.isVolatile) volatileInr += a.effectiveInr;
        if (h.bucket === "restricted_locked") illiquidInr += a.effectiveInr;
        if (g.targetDate && h.maturityDate) {
          if (h.maturityDate > g.targetDate) {
            mismatchHoldings.push(h.name);
            maturityMismatches.push({
              goalId: g.id,
              goalName: g.name,
              goalTargetDate: g.targetDate,
              holdingId: h.id,
              holdingName: h.name,
              holdingMaturityDate: h.maturityDate,
              allocatedInr: Math.round(a.effectiveInr),
            });
          } else {
            maturingBeforeGoalInr += a.effectiveInr;
          }
        }
      }

      const monthsToGoal = g.targetDate
        ? monthsBetweenDates(ref, g.targetDate)
        : null;
      const volatilePct =
        totalAllocatedInr > 0 ? (volatileInr / totalAllocatedInr) * 100 : 0;
      const illiquidPct =
        totalAllocatedInr > 0 ? (illiquidInr / totalAllocatedInr) * 100 : 0;

      const flags: string[] = [];
      if (mismatchHoldings.length > 0) {
        flags.push(
          `Maturity after goal date: ${mismatchHoldings.join(", ")}`
        );
      }
      if (illiquidPct > 30) {
        flags.push(
          `${illiquidPct.toFixed(0)}% of linked holdings are restricted/locked`
        );
      }
      if (monthsToGoal !== null && monthsToGoal <= 36 && volatilePct > 50) {
        flags.push(
          `${volatilePct.toFixed(0)}% volatile exposure for a ≤3-year horizon`
        );
      }
      if (maxHoldingSharePct > 60 && allocs.length > 0) {
        flags.push(
          `Single-holding concentration (${maxHoldingSharePct.toFixed(0)}%)`
        );
      }

      let liquiditySuitability: "good" | "caution" | "mismatch" | "unlinked" =
        "unlinked";
      if (allocs.length > 0) {
        if (mismatchHoldings.length > 0 || (g.category === "emergency" && illiquidPct > 0)) {
          liquiditySuitability = "mismatch";
        } else if (flags.length > 0) {
          liquiditySuitability = "caution";
        } else {
          liquiditySuitability = "good";
        }
      }

      return {
        goalId: g.id,
        goalName: g.name,
        category: g.category,
        targetDate: g.targetDate,
        monthsToGoal,
        totalAllocatedInr: Math.round(totalAllocatedInr),
        fundingGap: Math.round(fundingGap),
        maxHoldingConcentrationPct: Math.round(maxHoldingSharePct * 10) / 10,
        volatileExposurePct: Math.round(volatilePct * 10) / 10,
        illiquidExposurePct: Math.round(illiquidPct * 10) / 10,
        maturingBeforeGoalInr: Math.round(maturingBeforeGoalInr),
        liquiditySuitability,
        flags,
      };
    });

  return {
    totalPortfolioInr: Math.round(totalPortfolioInr),
    liquidAssetsInr,
    liquidAssetsPct: Math.round(liquidAssetsPct * 10) / 10,
    cashRegisterInr,
    topFiveHoldings,
    topFiveSharePct: Math.round(topFivePct * 10) / 10,
    holdingConcentration,
    categoryExposure,
    currencyExposure,
    concentrationAlerts,
    liquidityBreakdown,
    maturityMismatches,
    goalRisks,
  };
}

export function analyzeEmergencyFund(params: {
  holdings: AllocationHoldingLike[];
  assets: Array<{
    id: number;
    name: string;
    assetType: string;
    currency: string;
    currentValue: number;
  }>;
  usdInrRate: number;
  monthlyExpenses: number;
  coverageMonthsTarget: number;
  configuredTargetInr: number;
  referenceDate?: string;
}) {
  const ref = params.referenceDate || new Date().toISOString().slice(0, 10);
  const monthsTarget = [3, 6, 9, 12].includes(params.coverageMonthsTarget)
    ? params.coverageMonthsTarget
    : 6;

  const recommendedCorpus =
    params.monthlyExpenses > 0
      ? Math.round(params.monthlyExpenses * monthsTarget)
      : Math.round(params.configuredTargetInr);

  const eligibleHoldings: Array<{
    id: number;
    name: string;
    assetClass: string;
    currentInr: number;
    liquidityBucket: LiquidityBucket;
    source: "holding" | "cash_asset";
  }> = [];
  const excludedHoldings: Array<{
    id: number;
    name: string;
    assetClass: string;
    currentInr: number;
    reason: string;
  }> = [];

  for (const h of params.holdings) {
    if (h.status === "closed") continue;
    const vals = holdingInrValues(h, params.usdInrRate);
    const liq = classifyHoldingLiquidity(h, ref);
    const taggedOrFd =
      h.isEmergencyFund || h.assetClass === "fd" || h.assetClass === "rd";

    if (!taggedOrFd) continue;

    // Never count locked retirement assets (PPF, NPS, ESOP, ELSS/locked) as accessible emergency funds
    if (liq.bucket === "restricted_locked") {
      excludedHoldings.push({
        id: h.id,
        name: h.name,
        assetClass: h.assetClass,
        currentInr: Math.round(vals.currentInr),
        reason: liq.reason,
      });
      continue;
    }

    eligibleHoldings.push({
      id: h.id,
      name: h.name,
      assetClass: h.assetClass,
      currentInr: Math.round(vals.currentInr),
      liquidityBucket: liq.bucket,
      source: "holding",
    });
  }

  for (const a of params.assets) {
    if (a.assetType !== "financial_cash") continue;
    const fx = a.currency.toUpperCase() === "USD" ? params.usdInrRate : 1;
    const inr = Math.round(a.currentValue * fx);
    if (inr <= 0) continue;
    eligibleHoldings.push({
      id: a.id,
      name: a.name,
      assetClass: "financial_cash",
      currentInr: inr,
      liquidityBucket: "immediately_accessible",
      source: "cash_asset",
    });
  }

  const actualEmergencyValue = eligibleHoldings.reduce(
    (s, item) => s + item.currentInr,
    0
  );
  const coverageMonths =
    params.monthlyExpenses > 0
      ? Math.round((actualEmergencyValue / params.monthlyExpenses) * 10) / 10
      : null;
  const remainingAmount = Math.max(0, recommendedCorpus - actualEmergencyValue);
  const progressPct =
    recommendedCorpus > 0 ? actualEmergencyValue / recommendedCorpus : 0;

  return {
    coverageMonthsTarget: monthsTarget,
    monthlyExpenses: Math.round(params.monthlyExpenses),
    recommendedCorpus,
    actualEmergencyValue,
    coverageMonths,
    remainingAmount,
    progressPct,
    eligibleHoldings,
    excludedHoldings,
  };
}

export function analyzeNetWorthMilestones(params: {
  currentNetWorthInr: number;
  monthlyContributionInr: number;
  expectedAnnualReturnPct: number;
  milestones: Array<{
    id: number;
    label: string;
    targetAmount: number;
    isPreset: boolean;
    achievedDate: string;
    notes: string;
  }>;
  referenceDate?: string;
}) {
  const ref = params.referenceDate || new Date().toISOString().slice(0, 10);
  const sorted = [...params.milestones].sort(
    (a, b) => a.targetAmount - b.targetAmount
  );

  const enriched = sorted.map((m) => {
    const achieved = params.currentNetWorthInr >= m.targetAmount;
    const est = achieved
      ? { months: 0, achievable: true }
      : estimateMonthsToTarget({
          presentValue: Math.max(0, params.currentNetWorthInr),
          monthlyContribution: Math.max(0, params.monthlyContributionInr),
          targetValue: m.targetAmount,
          annualReturnPct: params.expectedAnnualReturnPct,
        });
    return {
      ...m,
      achieved,
      progressPct:
        m.targetAmount > 0
          ? Math.max(0, Math.min(1, params.currentNetWorthInr / m.targetAmount))
          : 0,
      remainingAmount: Math.max(0, m.targetAmount - params.currentNetWorthInr),
      estimatedMonths: est.months,
      estimatedDate:
        est.months !== null ? addMonthsToIsoDate(ref, est.months) : null,
    };
  });

  const achievedList = enriched.filter((m) => m.achieved);
  const previousMilestone =
    achievedList.length > 0 ? achievedList[achievedList.length - 1] : null;
  const nextMilestone = enriched.find((m) => !m.achieved) ?? null;

  let progressToNextPct = 1;
  if (nextMilestone) {
    const floor = previousMilestone ? previousMilestone.targetAmount : 0;
    const span = nextMilestone.targetAmount - floor;
    progressToNextPct =
      span > 0
        ? Math.max(
            0,
            Math.min(1, (params.currentNetWorthInr - floor) / span)
          )
        : 0;
  }

  return {
    currentNetWorthInr: Math.round(params.currentNetWorthInr),
    previousMilestone,
    nextMilestone,
    progressToNextPct,
    milestones: enriched,
  };
}
