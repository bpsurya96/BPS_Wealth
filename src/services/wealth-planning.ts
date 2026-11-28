import { asc, desc, eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  assetRegister,
  financialGoals,
  financialScenarios,
  goalContributions,
  goalInvestmentAllocations,
  goalSnapshots,
  incomeEntries,
  investmentHoldings,
  investmentTransactions,
  loanTransactions,
  monthlyWealthSnapshots,
  netWorthMilestones,
  rentalPayments,
} from "@/db/schema";
import { planningProfiles } from "@/db/schema";
import { getSetting } from "@/lib/auth";
import {
  convertMinorToInrMinor,
  fromMinorUnits,
  toMinorUnits,
} from "@/lib/currency";
import { AppError } from "@/lib/errors";
import {
  buildHoldingCashflowsNative,
  calculateXIRR,
  holdingInrValues,
} from "@/lib/finance";
import {
  analyzeEmergencyFund,
  analyzeNetWorthMilestones,
  analyzePortfolioRiskAndLiquidity,
  calculateFireAnalysis,
  calculateRetirementPlan,
  classifyHoldingLiquidity,
  computeEffectiveHoldingAllocations,
  computeGoalProjection,
  DEFAULT_WHAT_IF_ADJUSTMENTS,
  runWhatIfSimulation,
  SimulationBaseline,
  WhatIfAdjustments,
} from "@/lib/wealth-calculations";
import { getDashboardPortfolioData } from "./portfolio";

export function getOrCreatePlanningProfile() {
  let row = db
    .select()
    .from(planningProfiles)
    .where(eq(planningProfiles.profileKey, "default"))
    .get();

  if (!row) {
    const now = new Date().toISOString();
    row = db
      .insert(planningProfiles)
      .values({
        profileKey: "default",
        currentAge: null,
        plannedRetirementAge: 50,
        lifeExpectancy: 85,
        monthlyExpenses: 0,
        monthlyExpensesMinor: 0,
        expenseInflationPct: 6,
        expectedReturnPct: 11,
        safeWithdrawalRatePct: 3.5,
        otherRetirementIncome: 0,
        otherRetirementIncomeMinor: 0,
        taxDragPct: 10,
        includePrimaryResidence: false,
        emergencyMonthsTarget: 6,
        concentrationHoldingWarnPct: 25,
        concentrationCategoryWarnPct: 45,
        concentrationCurrencyWarnPct: 35,
        updatedAt: now,
      })
      .returning()
      .get();
  }
  return row;
}

export function updatePlanningProfile(
  patch: Partial<{
    currentAge: number | null;
    plannedRetirementAge: number;
    lifeExpectancy: number;
    monthlyExpenses: number;
    expenseInflationPct: number;
    expectedReturnPct: number;
    safeWithdrawalRatePct: number;
    otherRetirementIncome: number;
    taxDragPct: number;
    includePrimaryResidence: boolean;
    emergencyMonthsTarget: number;
    concentrationHoldingWarnPct: number;
    concentrationCategoryWarnPct: number;
    concentrationCurrencyWarnPct: number;
  }>
) {
  const existing = getOrCreatePlanningProfile();
  const nextMonthlyExpenses = patch.monthlyExpenses ?? existing.monthlyExpenses;
  const nextOtherIncome =
    patch.otherRetirementIncome ?? existing.otherRetirementIncome;

  return db
    .update(planningProfiles)
    .set({
      currentAge:
        patch.currentAge !== undefined ? patch.currentAge : existing.currentAge,
      plannedRetirementAge:
        patch.plannedRetirementAge ?? existing.plannedRetirementAge,
      lifeExpectancy: patch.lifeExpectancy ?? existing.lifeExpectancy,
      monthlyExpenses: nextMonthlyExpenses,
      monthlyExpensesMinor: toMinorUnits(nextMonthlyExpenses, "INR"),
      expenseInflationPct:
        patch.expenseInflationPct ?? existing.expenseInflationPct,
      expectedReturnPct: patch.expectedReturnPct ?? existing.expectedReturnPct,
      safeWithdrawalRatePct:
        patch.safeWithdrawalRatePct ?? existing.safeWithdrawalRatePct,
      otherRetirementIncome: nextOtherIncome,
      otherRetirementIncomeMinor: toMinorUnits(nextOtherIncome, "INR"),
      taxDragPct: patch.taxDragPct ?? existing.taxDragPct,
      includePrimaryResidence:
        patch.includePrimaryResidence ?? existing.includePrimaryResidence,
      emergencyMonthsTarget:
        patch.emergencyMonthsTarget ?? existing.emergencyMonthsTarget,
      concentrationHoldingWarnPct:
        patch.concentrationHoldingWarnPct ??
        existing.concentrationHoldingWarnPct,
      concentrationCategoryWarnPct:
        patch.concentrationCategoryWarnPct ??
        existing.concentrationCategoryWarnPct,
      concentrationCurrencyWarnPct:
        patch.concentrationCurrencyWarnPct ??
        existing.concentrationCurrencyWarnPct,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(planningProfiles.id, existing.id))
    .returning()
    .get();
}

export function recordGoalSnapshot(goalId: number, snapshotDate?: string) {
  const dateStr = snapshotDate || new Date().toISOString().slice(0, 10);
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
  const goal = db
    .select()
    .from(financialGoals)
    .where(eq(financialGoals.id, goalId))
    .get();
  if (!goal) return null;

  const holdings = db.select().from(investmentHoldings).all();
  const allocations = db.select().from(goalInvestmentAllocations).all();
  const { allocatedMinorByGoalId } = computeEffectiveHoldingAllocations({
    holdings,
    allocations,
    usdInrRate,
  });

  const standaloneMinor =
    goal.currentMinor || toMinorUnits(goal.currentAmount, "INR");
  const allocatedMinor = allocatedMinorByGoalId.get(goalId) ?? 0;
  const totalMinor = standaloneMinor + allocatedMinor;
  const targetMinor =
    goal.targetMinor || toMinorUnits(goal.targetAmount, "INR");

  return db
    .insert(goalSnapshots)
    .values({
      goalId,
      snapshotDate: dateStr,
      standaloneMinor,
      allocatedMinor,
      totalMinor,
      targetMinor,
    })
    .returning()
    .get();
}

export function upsertGoalAllocation(input: {
  goalId: number;
  holdingId: number;
  allocationType: "amount" | "percentage";
  allocatedAmount: number;
  allocationPct: number;
  notes?: string;
}) {
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));

  const result = sqlite.transaction(() => {
    const goal = db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.id, input.goalId))
      .get();
    if (!goal) {
      throw new AppError("Goal not found", 404, "GOAL_NOT_FOUND");
    }

    const holding = db
      .select()
      .from(investmentHoldings)
      .where(eq(investmentHoldings.id, input.holdingId))
      .get();
    if (!holding) {
      throw new AppError("Holding not found", 404, "HOLDING_NOT_FOUND");
    }
    if (holding.status === "closed") {
      throw new AppError(
        "Cannot allocate a closed holding to a goal",
        400,
        "HOLDING_CLOSED"
      );
    }

    const holdingVals = holdingInrValues(holding, usdInrRate);
    const holdingCapMinor = holdingVals.currentInrMinor;
    if (holdingCapMinor <= 0) {
      throw new AppError(
        "Holding has ₹0 current value and cannot be allocated",
        400,
        "ZERO_VALUE_HOLDING"
      );
    }

    const existingForHolding = db
      .select()
      .from(goalInvestmentAllocations)
      .where(eq(goalInvestmentAllocations.holdingId, input.holdingId))
      .all();

    let otherAllocatedMinor = 0;
    let currentRow: (typeof existingForHolding)[number] | undefined;

    for (const row of existingForHolding) {
      if (row.goalId === input.goalId) {
        currentRow = row;
        continue;
      }
      const rowMinor =
        row.allocationType === "percentage"
          ? Math.round(holdingCapMinor * (row.allocationPct / 100))
          : row.allocatedMinor || toMinorUnits(row.allocatedAmount, "INR");
      otherAllocatedMinor += rowMinor;
    }

    const requestedMinor =
      input.allocationType === "percentage"
        ? Math.round(holdingCapMinor * (input.allocationPct / 100))
        : toMinorUnits(input.allocatedAmount, "INR");

    if (requestedMinor <= 0) {
      throw new AppError(
        "Allocation value must be greater than ₹0",
        400,
        "INVALID_ALLOCATION"
      );
    }

    if (otherAllocatedMinor + requestedMinor > holdingCapMinor) {
      const availableInr = fromMinorUnits(
        Math.max(0, holdingCapMinor - otherAllocatedMinor),
        "INR"
      );
      throw new AppError(
        `Total allocations for "${holding.name}" cannot exceed its current value of ₹${holdingVals.currentInr.toLocaleString("en-IN")}. Available to allocate: ₹${availableInr.toLocaleString("en-IN")}.`,
        400,
        "ALLOCATION_LIMIT_EXCEEDED"
      );
    }

    const now = new Date().toISOString();
    const allocatedAmountInr =
      input.allocationType === "percentage"
        ? fromMinorUnits(requestedMinor, "INR")
        : input.allocatedAmount;
    const allocationPct =
      input.allocationType === "percentage"
        ? input.allocationPct
        : holdingCapMinor > 0
          ? Math.round((requestedMinor / holdingCapMinor) * 10000) / 100
          : 0;

    let saved;
    if (currentRow) {
      saved = db
        .update(goalInvestmentAllocations)
        .set({
          allocationType: input.allocationType,
          allocatedAmount: allocatedAmountInr,
          allocatedMinor: requestedMinor,
          allocationPct,
          notes: input.notes ?? "",
          updatedAt: now,
        })
        .where(eq(goalInvestmentAllocations.id, currentRow.id))
        .returning()
        .get();
    } else {
      saved = db
        .insert(goalInvestmentAllocations)
        .values({
          goalId: input.goalId,
          holdingId: input.holdingId,
          allocationType: input.allocationType,
          allocatedAmount: allocatedAmountInr,
          allocatedMinor: requestedMinor,
          allocationPct,
          notes: input.notes ?? "",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    }

    return saved;
  })();

  recordGoalSnapshot(input.goalId);
  return result;
}

export function getGoalsDashboardData(referenceDate?: string) {
  const refDate = referenceDate || new Date().toISOString().slice(0, 10);
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));

  const goals = db
    .select()
    .from(financialGoals)
    .orderBy(asc(financialGoals.id))
    .all();
  const holdings = db.select().from(investmentHoldings).all();
  const txns = db.select().from(investmentTransactions).all();
  const allocations = db.select().from(goalInvestmentAllocations).all();
  const contributions = db
    .select()
    .from(goalContributions)
    .orderBy(desc(goalContributions.date), desc(goalContributions.id))
    .all();
  const snapshots = db
    .select()
    .from(goalSnapshots)
    .orderBy(asc(goalSnapshots.snapshotDate), asc(goalSnapshots.id))
    .all();

  const txnsByHolding = new Map<number, typeof txns>();
  for (const t of txns) {
    const arr = txnsByHolding.get(t.holdingId) ?? [];
    arr.push(t);
    txnsByHolding.set(t.holdingId, arr);
  }

  const holdingXirrById = new Map<number, number | null>();
  for (const h of holdings) {
    const hCfs = buildHoldingCashflowsNative({
      holding: h,
      transactions: txnsByHolding.get(h.id) ?? [],
    });
    holdingXirrById.set(h.id, calculateXIRR(hCfs));
  }

  const {
    effectiveByAllocationId,
    allocatedMinorByGoalId,
    allocatedMinorByHoldingId,
    availableMinorByHoldingId,
    holdingValueMinorById,
    overAllocatedHoldingIds,
  } = computeEffectiveHoldingAllocations({
    holdings,
    allocations,
    usdInrRate,
  });

  const enrichedGoals = goals.map((g) => {
    const standaloneMinor =
      g.currentMinor || toMinorUnits(g.currentAmount, "INR");
    const allocatedMinor = allocatedMinorByGoalId.get(g.id) ?? 0;
    const standaloneAmount = fromMinorUnits(standaloneMinor, "INR");
    const allocatedAmount = fromMinorUnits(allocatedMinor, "INR");

    const projection = computeGoalProjection({
      targetAmount: g.targetAmount,
      standaloneAmount,
      allocatedAmount,
      targetDate: g.targetDate ?? "",
      createdAt: g.createdAt,
      expectedAnnualReturn: g.expectedAnnualReturn ?? 10,
      inflationRate: g.inflationRate ?? 6,
      monthlyContribution: g.monthlyContribution ?? 0,
      status: g.status ?? "active",
      referenceDate: refDate,
    });

    const goalAllocations = Array.from(effectiveByAllocationId.values())
      .filter((a) => a.goalId === g.id)
      .map((a) => ({
        ...a,
        holdingXirr: holdingXirrById.get(a.holdingId) ?? null,
      }));

    const goalContributionsList = contributions.filter(
      (c) => c.goalId === g.id
    );
    const goalSnapshotsList = snapshots
      .filter((s) => s.goalId === g.id)
      .map((s) => ({
        id: s.id,
        snapshotDate: s.snapshotDate,
        standaloneInr: Math.round(fromMinorUnits(s.standaloneMinor, "INR")),
        allocatedInr: Math.round(fromMinorUnits(s.allocatedMinor, "INR")),
        totalInr: Math.round(fromMinorUnits(s.totalMinor, "INR")),
        targetInr: Math.round(fromMinorUnits(s.targetMinor, "INR")),
      }));

    return {
      ...g,
      standaloneAmount: Math.round(standaloneAmount),
      allocatedAmount: Math.round(allocatedAmount),
      effectiveCurrentAmount: projection.currentAmount,
      projection,
      allocations: goalAllocations,
      contributions: goalContributionsList,
      snapshots: goalSnapshotsList,
    };
  });

  const activeGoals = enrichedGoals.filter(
    (g) => g.status === "active" || g.status === "paused"
  );
  const completedGoals = enrichedGoals.filter(
    (g) => g.projection.health === "completed"
  );
  const onTrackGoals = activeGoals.filter(
    (g) => g.projection.health === "on_track"
  );
  const atRiskGoals = activeGoals.filter(
    (g) => g.projection.health === "at_risk"
  );
  const attentionGoals = activeGoals.filter(
    (g) =>
      g.projection.health === "at_risk" || g.projection.health === "attention"
  );

  // Deduplicated total allocated across portfolio (cannot exceed portfolio value)
  let totalTargetMinor = 0;
  let totalStandaloneMinor = 0;
  let totalAllocatedMinor = 0;
  let totalRequiredMonthly = 0;
  let totalPlannedMonthly = 0;

  for (const g of activeGoals) {
    totalTargetMinor += toMinorUnits(g.targetAmount, "INR");
    totalStandaloneMinor += toMinorUnits(g.standaloneAmount, "INR");
    totalAllocatedMinor += toMinorUnits(g.allocatedAmount, "INR");
    if (g.status === "active" && g.projection.health !== "completed") {
      totalRequiredMonthly += g.projection.requiredMonthlyInflationAdjusted;
      totalPlannedMonthly += g.monthlyContribution;
    }
  }

  const totalTargetAmount = Math.round(fromMinorUnits(totalTargetMinor, "INR"));
  const totalAllocatedAndSavedAmount = Math.round(
    fromMinorUnits(totalStandaloneMinor + totalAllocatedMinor, "INR")
  );
  const overallProgressPct =
    totalTargetAmount > 0
      ? Math.min(1, totalAllocatedAndSavedAmount / totalTargetAmount)
      : 0;

  const holdingsAvailability = holdings
    .filter((h) => h.status !== "closed")
    .map((h) => {
      const capMinor = holdingValueMinorById.get(h.id) ?? 0;
      const usedMinor = allocatedMinorByHoldingId.get(h.id) ?? 0;
      const availMinor = availableMinorByHoldingId.get(h.id) ?? 0;
      return {
        id: h.id,
        name: h.name,
        assetClass: h.assetClass,
        currency: h.currency,
        currentInr: Math.round(fromMinorUnits(capMinor, "INR")),
        allocatedInr: Math.round(fromMinorUnits(usedMinor, "INR")),
        availableInr: Math.round(fromMinorUnits(availMinor, "INR")),
        allocatedPct: capMinor > 0 ? Math.round((usedMinor / capMinor) * 1000) / 10 : 0,
        maturityDate: h.maturityDate ?? "",
        xirr: holdingXirrById.get(h.id) ?? null,
      };
    });

  return {
    usdInrRate,
    summary: {
      totalGoalsCount: enrichedGoals.length,
      activeGoalsCount: activeGoals.filter((g) => g.status === "active").length,
      completedCount: completedGoals.length,
      onTrackCount: onTrackGoals.length,
      atRiskCount: atRiskGoals.length,
      attentionCount: attentionGoals.length,
      totalTargetAmount,
      totalAllocatedAmount: Math.round(fromMinorUnits(totalAllocatedMinor, "INR")),
      totalStandaloneAmount: Math.round(fromMinorUnits(totalStandaloneMinor, "INR")),
      totalCurrentAmount: totalAllocatedAndSavedAmount,
      overallProgressPct,
      monthlyContributionRequired: Math.round(totalRequiredMonthly),
      monthlyContributionPlanned: Math.round(totalPlannedMonthly),
      overAllocatedHoldingCount: overAllocatedHoldingIds.length,
    },
    goals: enrichedGoals,
    goalsRequiringAttention: attentionGoals.map((g) => ({
      id: g.id,
      name: g.name,
      health: g.projection.health,
      completionPct: g.projection.completionPct,
      requiredMonthly: g.projection.requiredMonthlyInflationAdjusted,
      plannedMonthly: g.monthlyContribution,
      targetDate: g.targetDate ?? "",
    })),
    holdingsAvailability,
  };
}

export function getInvestableCorpusDetails(includePrimaryResidence?: boolean) {
  const dash = getDashboardPortfolioData();
  const profile = getOrCreatePlanningProfile();
  const includeRes =
    includePrimaryResidence ?? profile.includePrimaryResidence;

  const assets = db.select().from(assetRegister).all();
  const holdings = db.select().from(investmentHoldings).all();

  let nonPortfolioLiquidInr = 0;
  let excludedAssetsInr = 0;
  for (const a of assets) {
    const valMinor = toMinorUnits(a.currentValue, a.currency);
    const inr = fromMinorUnits(
      convertMinorToInrMinor(valMinor, a.currency, dash.usdInrRate),
      "INR"
    );
    if (a.assetType.startsWith("financial_")) {
      nonPortfolioLiquidInr += inr;
    } else if (includeRes && a.assetType === "physical_property") {
      nonPortfolioLiquidInr += inr;
    } else {
      excludedAssetsInr += inr;
    }
  }

  // Exclude unpriced/locked ESOP if unpriced (currentInr === 0 anyway), keep active portfolio
  const activePortfolioInr = dash.metrics.totalPortfolioInr;
  const retirementHoldingsInr = holdings
    .filter(
      (h) =>
        h.status !== "closed" &&
        (h.assetClass === "ppf" || h.assetClass === "nps")
    )
    .reduce(
      (s, h) => s + holdingInrValues(h, dash.usdInrRate).currentInr,
      0
    );

  return {
    investableCorpusInr: Math.round(activePortfolioInr + nonPortfolioLiquidInr),
    portfolioInr: Math.round(activePortfolioInr),
    nonPortfolioFinancialInr: Math.round(nonPortfolioLiquidInr),
    excludedPhysicalInr: Math.round(excludedAssetsInr),
    retirementHoldingsInr: Math.round(retirementHoldingsInr),
    netWorthInr: Math.round(dash.metrics.netWorthInr),
    monthlyPlannedSipInr: Math.round(dash.metrics.totalPlannedSipInr),
  };
}

export function getFireAndRetirementData(
  overrides?: Partial<{
    currentAge: number | null;
    plannedRetirementAge: number;
    lifeExpectancy: number;
    monthlyExpenses: number;
    expenseInflationPct: number;
    expectedReturnPct: number;
    safeWithdrawalRatePct: number;
    otherRetirementIncome: number;
    taxDragPct: number;
    includePrimaryResidence: boolean;
    monthlyInvestment: number;
    currentCorpusOverride: number;
  }>
) {
  const profile = getOrCreatePlanningProfile();
  const corpusInfo = getInvestableCorpusDetails(
    overrides?.includePrimaryResidence ?? profile.includePrimaryResidence
  );
  const goalsData = getGoalsDashboardData();
  const retirementGoal = goalsData.goals.find(
    (g) => g.category === "retirement" || g.category === "fire"
  );

  const currentAge =
    overrides?.currentAge !== undefined
      ? overrides.currentAge
      : profile.currentAge;
  const plannedRetirementAge =
    overrides?.plannedRetirementAge ?? profile.plannedRetirementAge;
  const lifeExpectancy = overrides?.lifeExpectancy ?? profile.lifeExpectancy;
  const monthlyExpenses =
    overrides?.monthlyExpenses ?? profile.monthlyExpenses;
  const expenseInflationPct =
    overrides?.expenseInflationPct ?? profile.expenseInflationPct;
  const expectedReturnPct =
    overrides?.expectedReturnPct ?? profile.expectedReturnPct;
  const safeWithdrawalRatePct =
    overrides?.safeWithdrawalRatePct ?? profile.safeWithdrawalRatePct;
  const otherRetirementIncome =
    overrides?.otherRetirementIncome ?? profile.otherRetirementIncome;
  const taxDragPct = overrides?.taxDragPct ?? profile.taxDragPct;
  const monthlyInvestment =
    overrides?.monthlyInvestment ?? corpusInfo.monthlyPlannedSipInr;
  const currentInvestableCorpus =
    overrides?.currentCorpusOverride ?? corpusInfo.investableCorpusInr;

  const fire = calculateFireAnalysis({
    currentAge,
    plannedRetirementAge,
    monthlyExpenses,
    annualInflationPct: expenseInflationPct,
    currentInvestableCorpus,
    monthlyInvestment,
    expectedReturnPct,
    withdrawalRatePct: safeWithdrawalRatePct,
    taxDragPct,
    otherRetirementIncomeMonthly: otherRetirementIncome,
  });

  const retirementCorpusFromGoalOrHoldings = retirementGoal
    ? retirementGoal.projection.currentAmount
    : corpusInfo.retirementHoldingsInr > 0
      ? corpusInfo.retirementHoldingsInr
      : currentInvestableCorpus;

  const retirement = calculateRetirementPlan({
    currentAge: currentAge ?? 30,
    retirementAge: plannedRetirementAge,
    lifeExpectancy,
    currentRetirementCorpus: retirementCorpusFromGoalOrHoldings,
    monthlyRetirementInvestment:
      retirementGoal && retirementGoal.monthlyContribution > 0
        ? retirementGoal.monthlyContribution
        : monthlyInvestment,
    expectedReturnPct,
    inflationPct: expenseInflationPct,
    expectedMonthlyExpensesToday: monthlyExpenses,
    otherRetirementIncomeMonthly: otherRetirementIncome,
    withdrawalRatePct: safeWithdrawalRatePct,
  });

  return {
    profile,
    corpusInfo,
    fire,
    retirement,
    linkedRetirementGoal: retirementGoal
      ? {
          id: retirementGoal.id,
          name: retirementGoal.name,
          currentAmount: retirementGoal.projection.currentAmount,
          targetAmount: retirementGoal.targetAmount,
          allocations: retirementGoal.allocations,
        }
      : null,
  };
}

export function getSimulationBaseline(): SimulationBaseline {
  const dash = getDashboardPortfolioData();
  const profile = getOrCreatePlanningProfile();
  const corpusInfo = getInvestableCorpusDetails(profile.includePrimaryResidence);
  const goalsData = getGoalsDashboardData();

  // Derive representative monthly income from latest recorded month (or 0 if none)
  const latestMonth =
    dash.incomeChart.length > 0
      ? dash.incomeChart[dash.incomeChart.length - 1]
      : null;

  const monthlySalary = latestMonth ? latestMonth.salary : 0;
  const monthlyRental =
    latestMonth && latestMonth.rental > 0
      ? latestMonth.rental
      : dash.metrics.expectedMonthlyRent;
  const monthlyDividend = latestMonth ? latestMonth.dividend : 0;
  const monthlyOtherIncome = latestMonth ? latestMonth.other : 0;

  const nonInvestableAssets = Math.max(
    0,
    dash.metrics.totalAssetsInr - corpusInfo.investableCorpusInr
  );

  return {
    monthlySalary: Math.round(monthlySalary),
    monthlyRental: Math.round(monthlyRental),
    monthlyDividend: Math.round(monthlyDividend),
    monthlyOtherIncome: Math.round(monthlyOtherIncome),
    monthlyExpenses: Math.round(profile.monthlyExpenses),
    monthlyInsurance: Math.round(
      dash.metrics.totalAnnualInsurancePremiumInr / 12
    ),
    monthlySip: Math.round(dash.metrics.totalPlannedSipInr),
    investableCorpus: corpusInfo.investableCorpusInr,
    nonInvestableAssets: Math.round(nonInvestableAssets),
    expectedReturnPct: profile.expectedReturnPct,
    inflationPct: profile.expenseInflationPct,
    withdrawalRatePct: profile.safeWithdrawalRatePct,
    taxDragPct: profile.taxDragPct,
    loans: dash.loansList
      .filter((l) => l.status === "active" && l.currentBalance > 0)
      .map((l) => ({
        id: l.id,
        name: l.name,
        currentBalance: l.currentBalance,
        interestRate: l.interestRate,
        emiAmount: l.emiAmount,
      })),
    goals: goalsData.goals
      .filter((g) => g.status === "active")
      .map((g) => ({
        id: g.id,
        name: g.name,
        targetAmount: g.targetAmount,
        currentAmount: g.projection.currentAmount,
        targetDate: g.targetDate ?? "",
        expectedAnnualReturn: g.expectedAnnualReturn ?? 10,
        inflationRate: g.inflationRate ?? 6,
        monthlyContribution: g.monthlyContribution ?? 0,
      })),
  };
}

export function getSimulatorOverview(adjustments?: WhatIfAdjustments) {
  const baseline = getSimulationBaseline();
  const sim = runWhatIfSimulation(
    baseline,
    adjustments ?? DEFAULT_WHAT_IF_ADJUSTMENTS
  );
  const savedScenarios = db
    .select()
    .from(financialScenarios)
    .orderBy(desc(financialScenarios.updatedAt))
    .all()
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      adjustments: (() => {
        try {
          return {
            ...DEFAULT_WHAT_IF_ADJUSTMENTS,
            ...JSON.parse(s.configJson),
          } as WhatIfAdjustments;
        } catch {
          return DEFAULT_WHAT_IF_ADJUSTMENTS;
        }
      })(),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

  return {
    baseline,
    simulation: sim,
    savedScenarios,
  };
}

export function getPortfolioRiskAndLiquidityData() {
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
  const profile = getOrCreatePlanningProfile();
  const holdings = db.select().from(investmentHoldings).all();
  const assets = db.select().from(assetRegister).all();
  const goals = db.select().from(financialGoals).all();
  const allocations = db.select().from(goalInvestmentAllocations).all();
  const dash = getDashboardPortfolioData();

  const risk = analyzePortfolioRiskAndLiquidity({
    holdings,
    assets,
    goals: goals.map((g) => ({
      id: g.id,
      name: g.name,
      category: g.category,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      targetDate: g.targetDate ?? "",
      status: g.status,
    })),
    allocations,
    usdInrRate,
    thresholds: {
      holdingWarnPct: profile.concentrationHoldingWarnPct,
      categoryWarnPct: profile.concentrationCategoryWarnPct,
      currencyWarnPct: profile.concentrationCurrencyWarnPct,
    },
  });

  const emergency = analyzeEmergencyFund({
    holdings,
    assets,
    usdInrRate,
    monthlyExpenses: profile.monthlyExpenses,
    coverageMonthsTarget: profile.emergencyMonthsTarget,
    configuredTargetInr: dash.metrics.emergencyTargetInr,
  });

  return {
    usdInrRate,
    thresholds: {
      holdingWarnPct: profile.concentrationHoldingWarnPct,
      categoryWarnPct: profile.concentrationCategoryWarnPct,
      currencyWarnPct: profile.concentrationCurrencyWarnPct,
    },
    risk,
    upcomingMaturities: dash.upcomingMaturities,
    emergency,
  };
}

export function getMonthlyWealthScorecardData() {
  const dash = getDashboardPortfolioData();
  const usdInrRate = dash.usdInrRate;
  const incomes = db.select().from(incomeEntries).all();
  const rentPays = db.select().from(rentalPayments).all();
  const invTxns = db.select().from(investmentTransactions).all();
  const loanTxns = db.select().from(loanTransactions).all();
  const storedSnapshots = db
    .select()
    .from(monthlyWealthSnapshots)
    .orderBy(asc(monthlyWealthSnapshots.month))
    .all();
  const goalsData = getGoalsDashboardData();

  const storedByMonth = new Map(storedSnapshots.map((s) => [s.month, s]));
  const currentMonth = new Date().toISOString().slice(0, 7);

  const monthSet = new Set<string>([currentMonth]);
  for (const i of incomes) if (i.month) monthSet.add(i.month);
  for (const r of rentPays) if (r.billingMonth) monthSet.add(r.billingMonth);
  for (const t of invTxns) if (t.date) monthSet.add(t.date.slice(0, 7));
  for (const l of loanTxns) if (l.txnDate) monthSet.add(l.txnDate.slice(0, 7));
  for (const s of storedSnapshots) monthSet.add(s.month);

  const monthsSorted = Array.from(monthSet)
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort();

  const monthlyInsuranceObligationMinor = toMinorUnits(
    dash.metrics.totalAnnualInsurancePremiumInr / 12,
    "INR"
  );
  const currentSipCommitmentMinor = toMinorUnits(
    dash.metrics.totalPlannedSipInr,
    "INR"
  );
  const currentAssetsMinor = toMinorUnits(dash.metrics.totalAssetsInr, "INR");
  const currentLiabilitiesMinor = toMinorUnits(
    dash.metrics.totalLiabilitiesInr,
    "INR"
  );
  const currentNetWorthMinor = toMinorUnits(dash.metrics.netWorthInr, "INR");
  const currentPortfolioMinor = toMinorUnits(
    dash.metrics.totalPortfolioInr,
    "INR"
  );

  // Aggregate per month with strict minor-unit precision & no double-counting
  const rows = monthsSorted.map((month) => {
    let salaryMinor = 0;
    let rentalMinor = 0;
    let dividendMinor = 0;
    let otherIncomeMinor = 0;

    for (const inc of incomes) {
      if (inc.month !== month) continue;
      const m = inc.inhandMinor || toMinorUnits(inc.inhandAmount, "INR");
      if (inc.category === "salary") {
        salaryMinor += m;
      } else if (inc.category === "rental") {
        if (inc.rentalPaymentId == null) {
          rentalMinor += m;
        }
      } else if (inc.category === "dividend") {
        dividendMinor += m;
      } else {
        otherIncomeMinor += m;
      }
    }

    for (const rp of rentPays) {
      if (rp.billingMonth !== month) continue;
      rentalMinor += rp.rentMinor || toMinorUnits(rp.rentAmount, "INR");
    }

    const totalIncomeMinor =
      salaryMinor + rentalMinor + dividendMinor + otherIncomeMinor;
    const passiveIncomeMinor = rentalMinor + dividendMinor + otherIncomeMinor;

    let emiPaidMinor = 0;
    for (const lt of loanTxns) {
      if (lt.txnDate.slice(0, 7) !== month) continue;
      if (lt.type === "emi" || lt.type === "prepayment") {
        emiPaidMinor += lt.creditMinor || toMinorUnits(lt.credit, "INR");
      }
    }

    let invContributionsMinor = 0;
    let employerContributionsMinor = 0;
    let redemptionsMinor = 0;
    for (const it of invTxns) {
      if (it.date.slice(0, 7) !== month) continue;
      const fx =
        it.currency.toUpperCase() !== "INR"
          ? it.fxRate > 0
            ? it.fxRate
            : usdInrRate
          : 1;
      const amtMinorInr = convertMinorToInrMinor(
        it.amountMinor || toMinorUnits(it.amount, it.currency),
        it.currency,
        fx
      );
      const empMinorInr = convertMinorToInrMinor(
        it.employerMinor || toMinorUnits(it.employerAmount, it.currency),
        it.currency,
        fx
      );

      const type = it.type.toLowerCase();
      if (type === "sip" || type === "buy" || type === "installment") {
        invContributionsMinor += amtMinorInr;
        employerContributionsMinor += empMinorInr;
      } else if (type === "employer_contribution") {
        employerContributionsMinor += amtMinorInr;
      } else if (
        type === "sell" ||
        type === "redemption" ||
        type === "withdrawal"
      ) {
        redemptionsMinor += amtMinorInr;
      }
    }

    const stored = storedByMonth.get(month);
    const trackedExpensesMinor =
      stored?.trackedExpensesMinor !== undefined &&
      stored?.trackedExpensesMinor !== null
        ? stored.trackedExpensesMinor
        : null;

    const insuranceMinor =
      month === currentMonth || stored
        ? stored?.insuranceMinor ?? monthlyInsuranceObligationMinor
        : monthlyInsuranceObligationMinor;

    const totalExpensesMinor =
      trackedExpensesMinor !== null
        ? trackedExpensesMinor + emiPaidMinor + insuranceMinor
        : null;

    const totalInvestedThisMonthMinor =
      invContributionsMinor + employerContributionsMinor;

    const savingsRatePct =
      totalIncomeMinor > 0 && totalExpensesMinor !== null
        ? Math.round(
            ((totalIncomeMinor - totalExpensesMinor) / totalIncomeMinor) * 1000
          ) / 10
        : null;

    const investmentRatePct =
      totalIncomeMinor > 0
        ? Math.round((totalInvestedThisMonthMinor / totalIncomeMinor) * 1000) /
          10
        : null;

    const passiveIncomeRatioPct =
      totalIncomeMinor > 0
        ? Math.round((passiveIncomeMinor / totalIncomeMinor) * 1000) / 10
        : null;

    const monthlySurplusMinor =
      totalExpensesMinor !== null
        ? totalIncomeMinor - totalExpensesMinor - invContributionsMinor
        : null;

    const isCurrent = month === currentMonth;
    const assetsMinor = isCurrent
      ? currentAssetsMinor
      : stored?.totalAssetsMinor ?? 0;
    const liabilitiesMinor = isCurrent
      ? currentLiabilitiesMinor
      : stored?.totalLiabilitiesMinor ?? 0;
    const netWorthMinor = isCurrent
      ? currentNetWorthMinor
      : stored?.netWorthMinor ?? 0;
    const debtToAssetPct =
      assetsMinor > 0
        ? Math.round((liabilitiesMinor / assetsMinor) * 1000) / 10
        : null;

    return {
      month,
      salary: Math.round(fromMinorUnits(salaryMinor, "INR")),
      rental: Math.round(fromMinorUnits(rentalMinor, "INR")),
      dividend: Math.round(fromMinorUnits(dividendMinor, "INR")),
      otherIncome: Math.round(fromMinorUnits(otherIncomeMinor, "INR")),
      totalIncome: Math.round(fromMinorUnits(totalIncomeMinor, "INR")),
      passiveIncome: Math.round(fromMinorUnits(passiveIncomeMinor, "INR")),
      emiPaid: Math.round(fromMinorUnits(emiPaidMinor, "INR")),
      insuranceObligation: Math.round(fromMinorUnits(insuranceMinor, "INR")),
      trackedExpenses:
        trackedExpensesMinor !== null
          ? Math.round(fromMinorUnits(trackedExpensesMinor, "INR"))
          : null,
      totalExpenses:
        totalExpensesMinor !== null
          ? Math.round(fromMinorUnits(totalExpensesMinor, "INR"))
          : null,
      invContributions: Math.round(
        fromMinorUnits(invContributionsMinor, "INR")
      ),
      employerContributions: Math.round(
        fromMinorUnits(employerContributionsMinor, "INR")
      ),
      redemptions: Math.round(fromMinorUnits(redemptionsMinor, "INR")),
      sipCommitment: isCurrent
        ? Math.round(fromMinorUnits(currentSipCommitmentMinor, "INR"))
        : Math.round(
            fromMinorUnits(
              stored?.sipCommitmentMinor ?? currentSipCommitmentMinor,
              "INR"
            )
          ),
      portfolioValue: isCurrent
        ? Math.round(fromMinorUnits(currentPortfolioMinor, "INR"))
        : Math.round(fromMinorUnits(stored?.portfolioValueMinor ?? 0, "INR")),
      marketGainInr: isCurrent ? Math.round(dash.metrics.totalGainInr) : null,
      netWorth:
        isCurrent || stored ? Math.round(fromMinorUnits(netWorthMinor, "INR")) : null,
      savingsRatePct,
      investmentRatePct,
      debtToAssetPct,
      passiveIncomeRatioPct,
      monthlySurplus:
        monthlySurplusMinor !== null
          ? Math.round(fromMinorUnits(monthlySurplusMinor, "INR"))
          : null,
      notes: stored?.notes ?? "",
    };
  });

  const currentRow =
    rows.find((r) => r.month === currentMonth) ?? rows[rows.length - 1];
  const currentIdx = rows.findIndex((r) => r.month === currentRow.month);
  const prevRow = currentIdx > 0 ? rows[currentIdx - 1] : null;
  const lastSix = rows.slice(Math.max(0, currentIdx - 6), currentIdx);

  const avgSix = (pick: (r: (typeof rows)[number]) => number) => {
    if (lastSix.length === 0) return null;
    return Math.round(
      lastSix.reduce((s, r) => s + pick(r), 0) / lastSix.length
    );
  };

  const currentYear = currentRow.month.slice(0, 4);
  const prevYear = String(Number(currentYear) - 1);
  const ytdRows = rows.filter((r) => r.month.startsWith(currentYear));
  const prevYearRows = rows.filter((r) => r.month.startsWith(prevYear));

  // Net worth change vs latest historical snapshot before current
  const snapshots = dash.snapshots;
  const latestHistSnap =
    snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null;
  const netWorthChangeVsPriorSnapshot =
    latestHistSnap && latestHistSnap.netWorth !== null
      ? Math.round(dash.metrics.netWorthInr - latestHistSnap.netWorth)
      : null;

  return {
    currentMonth: currentRow.month,
    current: currentRow,
    goalContributionProgressPct:
      goalsData.summary.monthlyContributionRequired > 0
        ? Math.min(
            1,
            goalsData.summary.monthlyContributionPlanned /
              goalsData.summary.monthlyContributionRequired
          )
        : null,
    netWorthChangeVsPriorSnapshot,
    comparisons: {
      vsPrevMonth: prevRow
        ? {
            prevMonth: prevRow.month,
            incomeDelta: currentRow.totalIncome - prevRow.totalIncome,
            invContributionsDelta:
              currentRow.invContributions - prevRow.invContributions,
            expensesDelta:
              currentRow.totalExpenses !== null && prevRow.totalExpenses !== null
                ? currentRow.totalExpenses - prevRow.totalExpenses
                : null,
          }
        : null,
      vsSixMonthAvg: {
        monthsCount: lastSix.length,
        avgIncome: avgSix((r) => r.totalIncome),
        avgInvContributions: avgSix((r) => r.invContributions),
        incomeDelta:
          avgSix((r) => r.totalIncome) !== null
            ? currentRow.totalIncome - avgSix((r) => r.totalIncome)!
            : null,
        invContributionsDelta:
          avgSix((r) => r.invContributions) !== null
            ? currentRow.invContributions -
              avgSix((r) => r.invContributions)!
            : null,
      },
      yearComparison: {
        currentYear,
        prevYear,
        currentYearIncome: ytdRows.reduce((s, r) => s + r.totalIncome, 0),
        prevYearIncome: prevYearRows.reduce((s, r) => s + r.totalIncome, 0),
        currentYearInvested: ytdRows.reduce(
          (s, r) => s + r.invContributions + r.employerContributions,
          0
        ),
        prevYearInvested: prevYearRows.reduce(
          (s, r) => s + r.invContributions + r.employerContributions,
          0
        ),
      },
    },
    history: rows,
  };
}

export function getNetWorthMilestoneData() {
  const dash = getDashboardPortfolioData();
  const profile = getOrCreatePlanningProfile();
  const rawMilestones = db
    .select()
    .from(netWorthMilestones)
    .orderBy(asc(netWorthMilestones.targetMinor))
    .all();

  const tracker = analyzeNetWorthMilestones({
    currentNetWorthInr: dash.metrics.netWorthInr,
    monthlyContributionInr: dash.metrics.totalPlannedSipInr,
    expectedAnnualReturnPct: profile.expectedReturnPct,
    milestones: rawMilestones.map((m) => ({
      id: m.id,
      label: m.label,
      targetAmount: m.targetAmount,
      isPreset: m.isPreset,
      achievedDate: m.achievedDate,
      notes: m.notes,
    })),
  });

  return {
    ...tracker,
    breakdown: {
      investmentPortfolioInr: Math.round(dash.metrics.totalPortfolioInr),
      otherFinancialAssetsInr: Math.round(dash.metrics.otherFinancialAssetsInr),
      physicalAssetsInr: Math.round(dash.metrics.physicalAssetsInr),
      totalLiabilitiesInr: Math.round(dash.metrics.totalLiabilitiesInr),
    },
    snapshots: dash.snapshots,
  };
}

export function getDashboardPlanningSummary() {
  const goalsData = getGoalsDashboardData();
  const fireData = getFireAndRetirementData();
  const riskData = getPortfolioRiskAndLiquidityData();
  const scorecard = getMonthlyWealthScorecardData();
  const milestones = getNetWorthMilestoneData();

  return {
    goals: goalsData.summary,
    goalsRequiringAttention: goalsData.goalsRequiringAttention.slice(0, 3),
    milestones: {
      currentNetWorthInr: milestones.currentNetWorthInr,
      previousMilestone: milestones.previousMilestone,
      nextMilestone: milestones.nextMilestone,
      progressToNextPct: milestones.progressToNextPct,
    },
    fire: {
      monthlyExpensesConfigured: fireData.profile.monthlyExpenses > 0,
      currentFireProgressPct: fireData.fire.currentFireProgressPct,
      requiredCorpusToday: fireData.fire.requiredCorpusToday,
      investableCorpusInr: fireData.corpusInfo.investableCorpusInr,
      estimatedFireYear: fireData.fire.estimatedFireYear,
      estimatedFireAge: fireData.fire.estimatedFireAge,
    },
    scorecard: {
      month: scorecard.currentMonth,
      totalIncome: scorecard.current.totalIncome,
      invContributions:
        scorecard.current.invContributions +
        scorecard.current.employerContributions,
      investmentRatePct: scorecard.current.investmentRatePct,
      savingsRatePct: scorecard.current.savingsRatePct,
    },
    emergency: {
      coverageMonths: riskData.emergency.coverageMonths,
      coverageMonthsTarget: riskData.emergency.coverageMonthsTarget,
      actualEmergencyValue: riskData.emergency.actualEmergencyValue,
      recommendedCorpus: riskData.emergency.recommendedCorpus,
      progressPct: riskData.emergency.progressPct,
    },
    topRiskWarning:
      riskData.risk.concentrationAlerts[0]?.message ??
      (riskData.risk.maturityMismatches.length > 0
        ? `${riskData.risk.maturityMismatches.length} goal maturity mismatch(es) detected`
        : null),
    liquidityPct: riskData.risk.liquidAssetsPct,
    goalEnrichedList: goalsData.goals.map((g) => ({
      id: g.id,
      name: g.name,
      category: g.category,
      targetAmount: g.targetAmount,
      currentAmount: g.projection.currentAmount,
      completionPct: g.projection.completionPct,
      health: g.projection.health,
      notes: g.notes ?? "",
    })),
  };
}

export function getHoldingLiquidityMap() {
  const holdings = db.select().from(investmentHoldings).all();
  return holdings.map((h) => ({
    holdingId: h.id,
    ...classifyHoldingLiquidity(h),
  }));
}
