import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { financialGoals, goalContributions } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { fromMinorUnits, toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { createGoalContributionSchema } from "@/lib/validation";
import { recordGoalSnapshot } from "@/services/wealth-planning";

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = createGoalContributionSchema.parse(await req.json());
    const dateStr = parsed.date || new Date().toISOString().slice(0, 10);

    const contribution = sqlite.transaction(() => {
      const goal = db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, parsed.goalId))
        .get();
      if (!goal) {
        throw new AppError("Goal not found", 404, "GOAL_NOT_FOUND");
      }

      const amountMinor = toMinorUnits(parsed.amount, "INR");
      const inserted = db
        .insert(goalContributions)
        .values({
          goalId: parsed.goalId,
          date: dateStr,
          amount: parsed.amount,
          amountMinor,
          source: parsed.source,
          notes: parsed.notes,
        })
        .returning()
        .get();

      if (parsed.applyToStandaloneSavings) {
        const nextCurrentMinor =
          (goal.currentMinor || toMinorUnits(goal.currentAmount, "INR")) +
          amountMinor;
        db.update(financialGoals)
          .set({
            currentAmount: fromMinorUnits(nextCurrentMinor, "INR"),
            currentMinor: nextCurrentMinor,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(financialGoals.id, parsed.goalId))
          .run();
      }

      return inserted;
    })();

    recordGoalSnapshot(parsed.goalId);
    return NextResponse.json({ contribution }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "goals.contributions.POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid contribution id", 400, "INVALID_ID");
    }
    const existing = db
      .select()
      .from(goalContributions)
      .where(eq(goalContributions.id, id))
      .get();
    if (!existing) {
      throw new AppError("Contribution not found", 404, "NOT_FOUND");
    }
    db.delete(goalContributions).where(eq(goalContributions.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "goals.contributions.DELETE");
  }
}
