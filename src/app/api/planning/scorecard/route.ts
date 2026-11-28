import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monthlyWealthSnapshots } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { handleApiError } from "@/lib/errors";
import { upsertScorecardMonthSchema } from "@/lib/validation";
import { getMonthlyWealthScorecardData } from "@/services/wealth-planning";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json(getMonthlyWealthScorecardData());
  } catch (err) {
    return handleApiError(err, "planning.scorecard.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = upsertScorecardMonthSchema.parse(await req.json());

    const scorecard = getMonthlyWealthScorecardData();
    const row = scorecard.history.find((h) => h.month === parsed.month);
    const now = new Date().toISOString();

    const salaryMinor = toMinorUnits(row?.salary ?? 0, "INR");
    const rentalMinor = toMinorUnits(row?.rental ?? 0, "INR");
    const dividendMinor = toMinorUnits(row?.dividend ?? 0, "INR");
    const otherIncomeMinor = toMinorUnits(row?.otherIncome ?? 0, "INR");
    const totalIncomeMinor =
      salaryMinor + rentalMinor + dividendMinor + otherIncomeMinor;
    const emiMinor = toMinorUnits(row?.emiPaid ?? 0, "INR");
    const insuranceMinor = toMinorUnits(row?.insuranceObligation ?? 0, "INR");

    const trackedExpensesMinor =
      parsed.trackedExpenses !== undefined && parsed.trackedExpenses !== null
        ? toMinorUnits(parsed.trackedExpenses, "INR")
        : null;
    const totalExpensesMinor =
      trackedExpensesMinor !== null
        ? trackedExpensesMinor + emiMinor + insuranceMinor
        : null;

    const invContributionsMinor = toMinorUnits(
      row?.invContributions ?? 0,
      "INR"
    );
    const employerContributionsMinor = toMinorUnits(
      row?.employerContributions ?? 0,
      "INR"
    );
    const sipCommitmentMinor = toMinorUnits(row?.sipCommitment ?? 0, "INR");
    const portfolioValueMinor = toMinorUnits(row?.portfolioValue ?? 0, "INR");
    const netWorthMinor = toMinorUnits(row?.netWorth ?? 0, "INR");

    const savingsRatePct =
      totalIncomeMinor > 0 && totalExpensesMinor !== null
        ? Math.round(
            ((totalIncomeMinor - totalExpensesMinor) / totalIncomeMinor) * 1000
          ) / 10
        : null;
    const investmentRatePct =
      totalIncomeMinor > 0
        ? Math.round(
            ((invContributionsMinor + employerContributionsMinor) /
              totalIncomeMinor) *
              1000
          ) / 10
        : null;

    const existing = db
      .select()
      .from(monthlyWealthSnapshots)
      .where(eq(monthlyWealthSnapshots.month, parsed.month))
      .get();

    if (existing) {
      db.update(monthlyWealthSnapshots)
        .set({
          salaryMinor,
          rentalMinor,
          dividendMinor,
          otherIncomeMinor,
          totalIncomeMinor,
          emiMinor,
          insuranceMinor,
          trackedExpensesMinor,
          totalExpensesMinor,
          invContributionsMinor,
          employerContributionsMinor,
          sipCommitmentMinor,
          portfolioValueMinor,
          netWorthMinor,
          savingsRatePct,
          investmentRatePct,
          notes: parsed.notes,
          updatedAt: now,
        })
        .where(eq(monthlyWealthSnapshots.id, existing.id))
        .run();
    } else {
      db.insert(monthlyWealthSnapshots)
        .values({
          month: parsed.month,
          salaryMinor,
          rentalMinor,
          dividendMinor,
          otherIncomeMinor,
          totalIncomeMinor,
          emiMinor,
          insuranceMinor,
          trackedExpensesMinor,
          totalExpensesMinor,
          invContributionsMinor,
          employerContributionsMinor,
          sipCommitmentMinor,
          portfolioValueMinor,
          netWorthMinor,
          savingsRatePct,
          investmentRatePct,
          notes: parsed.notes,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return NextResponse.json(getMonthlyWealthScorecardData());
  } catch (err) {
    return handleApiError(err, "planning.scorecard.POST");
  }
}
