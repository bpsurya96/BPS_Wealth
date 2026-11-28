import fs from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postPin } from "@/app/api/auth/pin/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { POST as postInvestment, PATCH as patchInvestment } from "@/app/api/investments/route";
import { POST as postInvTxn } from "@/app/api/investments/[id]/transactions/route";
import { POST as postIncome } from "@/app/api/income/route";
import { POST as postRental } from "@/app/api/rentals/route";
import {
  DELETE as deleteGoal,
  GET as getGoals,
  PATCH as patchGoal,
  POST as postGoal,
} from "@/app/api/goals/route";
import {
  DELETE as deleteAllocation,
  POST as postAllocation,
} from "@/app/api/goals/allocations/route";
import { POST as postGoalContribution } from "@/app/api/goals/contributions/route";
import { PATCH as patchProfile } from "@/app/api/planning/profile/route";
import {
  GET as getSimulator,
  POST as postSimulator,
} from "@/app/api/planning/simulator/route";
import { GET as getRisk } from "@/app/api/planning/risk/route";
import {
  GET as getScorecard,
  POST as postScorecard,
} from "@/app/api/planning/scorecard/route";
import {
  GET as getMilestones,
  POST as postMilestone,
} from "@/app/api/planning/milestones/route";
import { POST as postBackup } from "@/app/api/backup/route";
import { POST as postAi } from "@/app/api/ai/route";
import {
  createIsolatedTestEnv,
  makeJsonRequest,
  TestContext,
} from "../helpers/test-env";

describe("Wealth Planning APIs, Allocation Safety, Scorecard & Backup Integration", () => {
  let ctx: TestContext;
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    ctx = createIsolatedTestEnv();
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", {
        action: "setup",
        pin: "4567",
        setupToken: process.env.BPS_OWNER_SETUP_TOKEN,
      })
    );
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
    ctx.cleanup();
  });

  it("enforces goal allocation safety, prevents double-counting, tracks scorecard, and backs up & restores all planning tables", async () => {
    // 1. Create a Mutual Fund holding worth ₹10,00,000
    const invRes = await postInvestment(
      makeJsonRequest("http://localhost/api/investments", "POST", {
        name: "Core Equity Fund",
        assetClass: "mutual_fund",
        currency: "INR",
        plannedSip: 25000,
        investedAmount: 800000,
        currentValue: 1000000,
      })
    );
    expect(invRes.status).toBe(201);
    const { holding } = await invRes.json();

    // 2. Create two goals
    const g1Res = await postGoal(
      makeJsonRequest("http://localhost/api/goals", "POST", {
        name: "House Purchase",
        category: "house",
        targetAmount: 8000000,
        currentAmount: 100000,
        targetDate: "2035-01-01",
        expectedAnnualReturn: 11,
        inflationRate: 6,
        monthlyContribution: 30000,
      })
    );
    expect(g1Res.status).toBe(201);
    const { goal: g1 } = await g1Res.json();

    const g2Res = await postGoal(
      makeJsonRequest("http://localhost/api/goals", "POST", {
        name: "Car Fund",
        category: "car",
        targetAmount: 1500000,
        currentAmount: 0,
        targetDate: "2029-01-01",
      })
    );
    expect(g2Res.status).toBe(201);
    const { goal: g2 } = await g2Res.json();

    // 3. Allocate ₹6,00,000 to House and ₹4,00,000 (40%) to Car => total ₹10,00,000 (100%)
    const a1 = await postAllocation(
      makeJsonRequest("http://localhost/api/goals/allocations", "POST", {
        goalId: g1.id,
        holdingId: holding.id,
        allocationType: "amount",
        allocatedAmount: 600000,
      })
    );
    expect(a1.status).toBe(201);

    const a2 = await postAllocation(
      makeJsonRequest("http://localhost/api/goals/allocations", "POST", {
        goalId: g2.id,
        holdingId: holding.id,
        allocationType: "percentage",
        allocationPct: 40,
      })
    );
    expect(a2.status).toBe(201);

    // 4. Attempting to allocate even ₹1 more to g2 (or editing g1 to ₹7,00,000) MUST fail with 400
    const overAlloc = await postAllocation(
      makeJsonRequest("http://localhost/api/goals/allocations", "POST", {
        goalId: g1.id,
        holdingId: holding.id,
        allocationType: "amount",
        allocatedAmount: 700000,
      })
    );
    expect(overAlloc.status).toBe(400);
    const overErr = await overAlloc.json();
    expect(overErr.code).toBe("ALLOCATION_LIMIT_EXCEEDED");

    // 5. Dashboard portfolio total must remain ₹10,00,000 (never ₹20,00,000!)
    const dashRes = await getDashboard();
    expect(dashRes.status).toBe(200);
    const dashJson = await dashRes.json();
    expect(dashJson.metrics.totalPortfolioInr).toBe(1000000);
    expect(dashJson.planning.goals.totalAllocatedAmount).toBe(1000000);

    // 6. Holding valuation update automatically refreshes goal allocated value
    await patchInvestment(
      makeJsonRequest("http://localhost/api/investments", "PATCH", {
        id: holding.id,
        currentValue: 1200000,
      })
    );
    const goalsAfterGain = await (await getGoals()).json();
    const g2Updated = goalsAfterGain.goals.find((g: { id: number }) => g.id === g2.id);
    // 40% of 12,00,000 = 4,80,000
    expect(g2Updated.allocatedAmount).toBe(480000);

    // 7. Log direct contribution to House goal
    const contribRes = await postGoalContribution(
      makeJsonRequest("http://localhost/api/goals/contributions", "POST", {
        goalId: g1.id,
        date: "2026-11-01",
        amount: 50000,
        source: "manual",
      })
    );
    expect(contribRes.status).toBe(201);

    // 8. Pause & resume goal
    const pauseRes = await patchGoal(
      makeJsonRequest("http://localhost/api/goals", "PATCH", {
        id: g2.id,
        status: "paused",
      })
    );
    expect(pauseRes.status).toBe(200);

    // 9. Planning profile / FIRE update
    const profRes = await patchProfile(
      makeJsonRequest("http://localhost/api/planning/profile", "PATCH", {
        currentAge: 30,
        plannedRetirementAge: 48,
        monthlyExpenses: 80000,
        emergencyMonthsTarget: 6,
      })
    );
    expect(profRes.status).toBe(200);
    const profJson = await profRes.json();
    expect(profJson.fire.requiredCorpusToday).toBeGreaterThan(0);

    // 10. What-If Simulator isolation + save scenario
    const simPost = await postSimulator(
      makeJsonRequest("http://localhost/api/planning/simulator", "POST", {
        action: "save",
        name: "Aggressive SIP +10K",
        adjustments: {
          sipDeltaMonthly: 10000,
          salaryChangePct: 10,
        },
      })
    );
    expect(simPost.status).toBe(201);
    const simGet = await (await getSimulator()).json();
    expect(simGet.savedScenarios.length).toBe(1);
    // Real portfolio must be unchanged
    expect((await (await getDashboard()).json()).metrics.totalPortfolioInr).toBe(
      1200000
    );

    // 11. Monthly Wealth Scorecard: missing expenses -> savingsRatePct === null; rental deduplication
    const month = new Date().toISOString().slice(0, 7);
    await postIncome(
      makeJsonRequest("http://localhost/api/income", "POST", {
        date: `${month}-05`,
        month,
        source: "Salary",
        category: "salary",
        inhandAmount: 150000,
      })
    );
    const propRes = await postRental(
      makeJsonRequest("http://localhost/api/rentals", "POST", {
        name: "Shop 1",
        monthlyRent: 20000,
      })
    );
    const { property } = await propRes.json();
    const rentPayRes = await postRental(
      makeJsonRequest("http://localhost/api/rentals", "POST", {
        kind: "payment",
        propertyId: property.id,
        billingMonth: month,
        rentAmount: 20000,
      })
    );
    const { payment } = await rentPayRes.json();
    // Linked rental entry in income_entries should NOT double-count
    await postIncome(
      makeJsonRequest("http://localhost/api/income", "POST", {
        date: `${month}-06`,
        month,
        source: "Shop 1 Rent",
        category: "rental",
        inhandAmount: 20000,
        rentalPaymentId: payment.id,
      })
    );
    await postInvTxn(
      makeJsonRequest(
        `http://localhost/api/investments/${holding.id}/transactions`,
        "POST",
        { date: `${month}-10`, type: "sip", amount: 25000 }
      ),
      { params: Promise.resolve({ id: String(holding.id) }) }
    );

    const scBeforeExpenses = await (await getScorecard()).json();
    expect(scBeforeExpenses.current.totalIncome).toBe(170000);
    expect(scBeforeExpenses.current.invContributions).toBe(25000);
    expect(scBeforeExpenses.current.savingsRatePct).toBeNull(); // Missing expense guard!

    const scAfterExpenses = await (
      await postScorecard(
        makeJsonRequest("http://localhost/api/planning/scorecard", "POST", {
          month,
          trackedExpenses: 60000,
          notes: "Recorded living expenses",
        })
      )
    ).json();
    expect(scAfterExpenses.current.savingsRatePct).not.toBeNull();

    // 12. Risk & Milestones
    const riskJson = await (await getRisk()).json();
    expect(riskJson.risk.totalPortfolioInr).toBeGreaterThan(0);

    const msPost = await postMilestone(
      makeJsonRequest("http://localhost/api/planning/milestones", "POST", {
        label: "₹3 Crore Target",
        targetAmount: 30000000,
      })
    );
    expect(msPost.status).toBe(201);
    const msGet = await (await getMilestones()).json();
    expect(msGet.milestones.some((m: { label: string }) => m.label === "₹3 Crore Target")).toBe(
      true
    );

    // 13. AI Assistant financial planning query uses real data & deterministic calculation
    const aiGoalRes = await postAi(
      makeJsonRequest("http://localhost/api/ai", "POST", {
        prompt: "What happens if I increase my SIP by 5000?",
        context: "simulator",
        mode: "planning",
      })
    );
    expect(aiGoalRes.status).toBe(200);
    const aiGoalJson = await aiGoalRes.json();
    expect(aiGoalJson.reply).toContain("What-If Simulation");

    // 14. Full Backup & Restore preserves all new tables
    const bakRes = await postBackup(
      makeJsonRequest("http://localhost/api/backup", "POST", {
        action: "create",
      })
    );
    expect(bakRes.status).toBe(200);
    const { backup } = await bakRes.json();
    expect(backup.recordCounts.goal_investment_allocations).toBe(2);
    expect(backup.recordCounts.financial_scenarios).toBe(1);
    expect(backup.recordCounts.monthly_wealth_snapshots).toBe(1);

    // Mutate: unlink an allocation and delete a goal
    const { allocation: a1Obj } = await a1.json();
    await deleteAllocation(
      makeJsonRequest(
        `http://localhost/api/goals/allocations?id=${a1Obj.id}`,
        "DELETE"
      )
    );
    await deleteGoal(
      makeJsonRequest(`http://localhost/api/goals?id=${g2.id}`, "DELETE")
    );
    expect((await (await getGoals()).json()).goals.length).toBe(1);

    // Restore from backup -> both goals & allocations return!
    const restoreRes = await postBackup(
      makeJsonRequest("http://localhost/api/backup", "POST", {
        action: "restore",
        filename: backup.filename,
      })
    );
    expect(restoreRes.status).toBe(200);
    const restoredGoals = await (await getGoals()).json();
    expect(restoredGoals.goals.length).toBe(2);
    expect(restoredGoals.summary.totalGoalsCount).toBe(2);
    expect(fs.existsSync(ctx.rootDir)).toBe(true);
  });
});
