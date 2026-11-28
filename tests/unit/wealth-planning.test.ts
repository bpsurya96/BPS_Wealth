import { describe, expect, it } from "vitest";
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
  futureValueWithSip,
  monthsBetweenDates,
  requiredMonthlySip,
  runWhatIfSimulation,
  SimulationBaseline,
} from "@/lib/wealth-calculations";

describe("Goal Projection & Compounding Accuracy", () => {
  it("computes exact future value with effective monthly compounding", () => {
    // ₹1,00,000 at 12% effective annual return for 12 months with ₹0 SIP = ₹1,12,000
    const fvLump = futureValueWithSip(100000, 0, 12, 12);
    expect(fvLump).toBeCloseTo(112000, 2);

    // ₹0 starting + ₹10,000/mo at 0% for 12 months = ₹1,20,000
    const fvZero = futureValueWithSip(0, 10000, 0, 12);
    expect(fvZero).toBeCloseTo(120000, 2);
  });

  it("computes required monthly SIP matching forward FV formula", () => {
    const req = requiredMonthlySip(100000, 1000000, 12, 60);
    const checkFv = futureValueWithSip(100000, req, 12, 60);
    expect(checkFv).toBeCloseTo(1000000, 0);
  });

  it("calculates goal months, inflation-adjusted target, and three scenarios", () => {
    expect(monthsBetweenDates("2026-01-15", "2028-01-15")).toBe(24);
    expect(monthsBetweenDates("2026-01-15", "2026-01-10")).toBe(0);

    const proj = computeGoalProjection({
      targetAmount: 1000000,
      standaloneAmount: 100000,
      allocatedAmount: 200000,
      targetDate: "2031-01-01",
      createdAt: "2026-01-01T00:00:00Z",
      expectedAnnualReturn: 10,
      inflationRate: 6,
      monthlyContribution: 15000,
      status: "active",
      referenceDate: "2026-01-01",
    });

    expect(proj.currentAmount).toBe(300000);
    expect(proj.monthsRemaining).toBe(60);
    // 10L * (1.06)^5 ≈ 13,38,226
    expect(proj.inflationAdjustedTarget).toBeCloseTo(1338226, -1);
    expect(proj.scenarios.conservative.annualReturnPct).toBe(7);
    expect(proj.scenarios.moderate.annualReturnPct).toBe(10);
    expect(proj.scenarios.optimistic.annualReturnPct).toBe(13);
    expect(proj.scenarios.optimistic.projectedAtTarget).toBeGreaterThan(
      proj.scenarios.moderate.projectedAtTarget
    );
  });
});

describe("Goal Investment Allocation Safety", () => {
  it("supports multiple goals per holding and caps effective allocation when holding value drops", () => {
    const holdings = [
      {
        id: 1,
        name: "Nifty 50 Index",
        assetClass: "mutual_fund",
        currency: "INR",
        investedAmount: 800000,
        currentValue: 1000000, // ₹10L
        units: 10000,
        currentNav: 100,
        plannedSip: 10000,
        status: "active",
      },
    ];
    const allocations = [
      {
        id: 1,
        goalId: 10,
        holdingId: 1,
        allocationType: "amount",
        allocatedAmount: 600000,
        allocatedMinor: 60000000,
        allocationPct: 60,
      },
      {
        id: 2,
        goalId: 20,
        holdingId: 1,
        allocationType: "amount",
        allocatedAmount: 300000,
        allocatedMinor: 30000000,
        allocationPct: 30,
      },
      {
        id: 3,
        goalId: 30,
        holdingId: 1,
        allocationType: "percentage",
        allocatedAmount: 100000,
        allocatedMinor: 10000000,
        allocationPct: 10,
      },
    ];

    const res = computeEffectiveHoldingAllocations({
      holdings,
      allocations,
      usdInrRate: 85,
    });
    expect(res.allocatedMinorByGoalId.get(10)).toBe(60000000);
    expect(res.allocatedMinorByGoalId.get(20)).toBe(30000000);
    expect(res.allocatedMinorByGoalId.get(30)).toBe(10000000);
    expect(res.availableMinorByHoldingId.get(1)).toBe(0);
    expect(res.overAllocatedHoldingIds).toEqual([]);

    // Now simulate holding value dropping to ₹5,00,000: total allocated across all goals must NEVER exceed ₹5,00,000
    const droppedRes = computeEffectiveHoldingAllocations({
      holdings: [{ ...holdings[0], currentValue: 500000, currentNav: 50 }],
      allocations,
      usdInrRate: 85,
    });
    const totalAllocatedMinor =
      (droppedRes.allocatedMinorByGoalId.get(10) ?? 0) +
      (droppedRes.allocatedMinorByGoalId.get(20) ?? 0) +
      (droppedRes.allocatedMinorByGoalId.get(30) ?? 0);
    expect(totalAllocatedMinor).toBeLessThanOrEqual(50000000);
    expect(droppedRes.overAllocatedHoldingIds).toEqual([1]);
  });
});

describe("Financial Independence (FIRE) & Retirement Calculations", () => {
  it("computes FIRE corpus requirement with inflation, withdrawal rate, and tax drag", () => {
    const fire = calculateFireAnalysis({
      currentAge: 30,
      plannedRetirementAge: 45,
      monthlyExpenses: 100000, // ₹12L/yr
      annualInflationPct: 6,
      currentInvestableCorpus: 5000000, // ₹50L
      monthlyInvestment: 100000,
      expectedReturnPct: 12,
      withdrawalRatePct: 4,
      taxDragPct: 0,
      otherRetirementIncomeMonthly: 0,
      currentYear: 2026,
    });

    // Required corpus today at 4% SWR and 0% tax drag = 12,00,000 / 0.04 = ₹3,00,00,000
    expect(fire.requiredCorpusToday).toBe(30000000);
    expect(fire.currentFireProgressPct).toBeCloseTo(5000000 / 30000000, 4);
    expect(fire.horizonYears).toBe(15);
    expect(fire.estimatedFireYear).not.toBeNull();
    expect(fire.estimatedFireAge).not.toBeNull();
    expect(fire.scenarios.optimistic.fireYears!).toBeLessThanOrEqual(
      fire.scenarios.conservative.fireYears ?? 99
    );
  });

  it("handles zero and missing inputs safely without NaN or Infinity", () => {
    const fire = calculateFireAnalysis({
      currentAge: null,
      plannedRetirementAge: 50,
      monthlyExpenses: 0,
      annualInflationPct: 6,
      currentInvestableCorpus: 0,
      monthlyInvestment: 0,
      expectedReturnPct: 10,
      withdrawalRatePct: 3.5,
      taxDragPct: 10,
      otherRetirementIncomeMonthly: 0,
    });
    expect(fire.requiredCorpusToday).toBe(0);
    expect(fire.currentFireProgressPct).toBe(0);
    expect(fire.monthlyInvestmentRequired).toBe(0);

    const ret = calculateRetirementPlan({
      currentAge: 35,
      retirementAge: 60,
      lifeExpectancy: 85,
      currentRetirementCorpus: 1000000,
      monthlyRetirementInvestment: 20000,
      expectedReturnPct: 10,
      inflationPct: 6,
      expectedMonthlyExpensesToday: 50000,
      otherRetirementIncomeMonthly: 0,
      withdrawalRatePct: 3.5,
    });
    expect(ret.yearsRemaining).toBe(25);
    expect(ret.requiredRetirementCorpus).toBeGreaterThan(0);
    expect(ret.projectedCorpus).toBeGreaterThan(1000000);
  });
});

describe("What-If Financial Simulator", () => {
  const baseline: SimulationBaseline = {
    monthlySalary: 150000,
    monthlyRental: 20000,
    monthlyDividend: 0,
    monthlyOtherIncome: 0,
    monthlyExpenses: 60000,
    monthlyInsurance: 2000,
    monthlySip: 40000,
    investableCorpus: 2000000,
    nonInvestableAssets: 5000000,
    expectedReturnPct: 11,
    inflationPct: 6,
    withdrawalRatePct: 3.5,
    taxDragPct: 10,
    loans: [
      {
        id: 1,
        name: "Home Loan",
        currentBalance: 1500000,
        interestRate: 8.5,
        emiAmount: 25000,
      },
    ],
    goals: [
      {
        id: 1,
        name: "House Upgrade",
        targetAmount: 5000000,
        currentAmount: 500000,
        targetDate: "2034-01-01",
        expectedAnnualReturn: 10,
        inflationRate: 6,
        monthlyContribution: 20000,
      },
    ],
  };

  it("simulates salary increase, SIP boost, expense shock, loan prepayment, and market decline without mutating baseline", () => {
    const snapBefore = JSON.stringify(baseline);

    const sipBoost = runWhatIfSimulation(baseline, {
      ...DEFAULT_WHAT_IF_ADJUSTMENTS,
      salaryChangePct: 10,
      sipDeltaMonthly: 5000,
      loanPrepaymentAmount: 500000,
    });
    expect(sipBoost.scenario.monthlyIncome).toBe(185000);
    expect(sipBoost.scenario.startingDebt).toBe(1000000);
    expect(sipBoost.deltas.y10NetWorthDelta).toBeGreaterThan(0);
    expect(sipBoost.scenario.debtFreeMonths).toBeLessThan(
      sipBoost.baseline.debtFreeMonths
    );

    const marketCrash = runWhatIfSimulation(baseline, {
      ...DEFAULT_WHAT_IF_ADJUSTMENTS,
      marketShockPct: -25,
      newMonthlyExpenseDelta: 15000,
    });
    expect(marketCrash.scenario.startingCorpus).toBe(1500000);
    expect(marketCrash.deltas.y10NetWorthDelta).toBeLessThan(0);
    expect(marketCrash.deltas.monthlySurplusDelta).toBe(-15000);

    // Baseline object must remain completely untouched
    expect(JSON.stringify(baseline)).toBe(snapBefore);
  });
});

describe("Portfolio Risk, Liquidity & Emergency Fund", () => {
  it("classifies PPF, NPS, ESOP as restricted/locked and detects goal maturity mismatches", () => {
    expect(
      classifyHoldingLiquidity(
        { assetClass: "ppf", status: "active", maturityDate: "2038-03-31" },
        "2026-11-28"
      ).bucket
    ).toBe("restricted_locked");

    expect(
      classifyHoldingLiquidity(
        { assetClass: "nps", status: "active" },
        "2026-11-28"
      ).bucket
    ).toBe("restricted_locked");

    expect(
      classifyHoldingLiquidity(
        { assetClass: "fd", status: "active", maturityDate: "2029-05-01" },
        "2026-11-28"
      ).bucket
    ).toBe("maturity_based");

    const risk = analyzePortfolioRiskAndLiquidity({
      holdings: [
        {
          id: 1,
          name: "Concentrated Tech Stock",
          assetClass: "stock",
          currency: "USD",
          investedAmount: 5000,
          currentValue: 10000,
          units: 10,
          currentNav: 1000,
          plannedSip: 0,
          status: "active",
        },
        {
          id: 2,
          name: "Long FD",
          assetClass: "fd",
          currency: "INR",
          investedAmount: 100000,
          currentValue: 100000,
          units: 0,
          currentNav: 0,
          plannedSip: 0,
          maturityDate: "2032-01-01",
          status: "active",
        },
      ],
      assets: [],
      goals: [
        {
          id: 1,
          name: "Car in 2028",
          category: "car",
          targetAmount: 500000,
          currentAmount: 0,
          targetDate: "2028-06-01",
          status: "active",
        },
      ],
      allocations: [
        {
          id: 1,
          goalId: 1,
          holdingId: 2,
          allocationType: "amount",
          allocatedAmount: 100000,
          allocatedMinor: 10000000,
          allocationPct: 100,
        },
      ],
      usdInrRate: 85,
      thresholds: {
        holdingWarnPct: 25,
        categoryWarnPct: 45,
        currencyWarnPct: 35,
      },
      referenceDate: "2026-11-28",
    });

    expect(risk.concentrationAlerts.length).toBeGreaterThanOrEqual(3); // holding, category, USD currency
    expect(risk.maturityMismatches.length).toBe(1);
    expect(risk.goalRisks[0].liquiditySuitability).toBe("mismatch");
  });

  it("excludes locked retirement holdings from emergency fund even if tagged", () => {
    const emergency = analyzeEmergencyFund({
      holdings: [
        {
          id: 1,
          name: "PPF Mistakenly Tagged",
          assetClass: "ppf",
          currency: "INR",
          investedAmount: 500000,
          currentValue: 600000,
          units: 0,
          currentNav: 0,
          plannedSip: 0,
          isEmergencyFund: true,
          status: "active",
        },
        {
          id: 2,
          name: "Emergency FD",
          assetClass: "fd",
          currency: "INR",
          investedAmount: 300000,
          currentValue: 320000,
          units: 0,
          currentNav: 0,
          plannedSip: 0,
          isEmergencyFund: true,
          status: "active",
        },
      ],
      assets: [
        {
          id: 1,
          name: "Savings Bank",
          assetType: "financial_cash",
          currency: "INR",
          currentValue: 80000,
        },
      ],
      usdInrRate: 85,
      monthlyExpenses: 50000,
      coverageMonthsTarget: 6,
      configuredTargetInr: 300000,
      referenceDate: "2026-11-28",
    });

    expect(emergency.recommendedCorpus).toBe(300000);
    expect(emergency.actualEmergencyValue).toBe(400000); // 3.2L FD + 80K Cash; 6L PPF excluded!
    expect(emergency.coverageMonths).toBe(8);
    expect(emergency.excludedHoldings.length).toBe(1);
    expect(emergency.excludedHoldings[0].name).toBe("PPF Mistakenly Tagged");
  });
});

describe("Net Worth Milestones Tracker", () => {
  it("tracks previous, next milestone, and progress accurately", () => {
    const res = analyzeNetWorthMilestones({
      currentNetWorthInr: 3500000, // ₹35L
      monthlyContributionInr: 50000,
      expectedAnnualReturnPct: 10,
      milestones: [
        { id: 1, label: "₹10L", targetAmount: 1000000, isPreset: true, achievedDate: "", notes: "" },
        { id: 2, label: "₹25L", targetAmount: 2500000, isPreset: true, achievedDate: "", notes: "" },
        { id: 3, label: "₹50L", targetAmount: 5000000, isPreset: true, achievedDate: "", notes: "" },
      ],
      referenceDate: "2026-11-28",
    });

    expect(res.previousMilestone?.label).toBe("₹25L");
    expect(res.nextMilestone?.label).toBe("₹50L");
    // (35L - 25L) / (50L - 25L) = 0.4
    expect(res.progressToNextPct).toBeCloseTo(0.4, 4);
    expect(res.milestones[2].estimatedMonths).toBeGreaterThan(0);
  });
});
