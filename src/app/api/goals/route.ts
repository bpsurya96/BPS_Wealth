import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { financialGoals } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { createGoalSchema, patchGoalSchema } from "@/lib/validation";
import { GOAL_TEMPLATES } from "@/lib/wealth-calculations";
import {
  getGoalsDashboardData,
  recordGoalSnapshot,
} from "@/services/wealth-planning";

export async function GET() {
  try {
    await requireAdminSession();
    const data = getGoalsDashboardData();
    return NextResponse.json({
      ...data,
      templates: GOAL_TEMPLATES,
    });
  } catch (err) {
    return handleApiError(err, "goals.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = createGoalSchema.parse(await req.json());
    const now = new Date().toISOString();

    const created = db
      .insert(financialGoals)
      .values({
        name: parsed.name,
        category: parsed.category,
        description: parsed.description,
        targetAmount: parsed.targetAmount,
        currentAmount: parsed.currentAmount,
        targetMinor: toMinorUnits(parsed.targetAmount, "INR"),
        currentMinor: toMinorUnits(parsed.currentAmount, "INR"),
        targetDate: parsed.targetDate,
        priority: parsed.priority,
        expectedAnnualReturn: parsed.expectedAnnualReturn,
        inflationRate: parsed.inflationRate,
        monthlyContribution: parsed.monthlyContribution,
        monthlyContributionMinor: toMinorUnits(parsed.monthlyContribution, "INR"),
        status: parsed.status,
        notes: parsed.notes,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    recordGoalSnapshot(created.id);
    return NextResponse.json({ goal: created }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "goals.POST");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = patchGoalSchema.parse(await req.json());
    const existing = db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.id, parsed.id))
      .get();
    if (!existing) {
      throw new AppError("Goal not found", 404, "GOAL_NOT_FOUND");
    }

    const nextTarget = parsed.targetAmount ?? existing.targetAmount;
    const nextCurrent = parsed.currentAmount ?? existing.currentAmount;
    const nextMonthly =
      parsed.monthlyContribution ?? existing.monthlyContribution;

    const updated = db
      .update(financialGoals)
      .set({
        name: parsed.name ?? existing.name,
        category: parsed.category ?? existing.category,
        description: parsed.description ?? existing.description,
        targetAmount: nextTarget,
        currentAmount: nextCurrent,
        targetMinor: toMinorUnits(nextTarget, "INR"),
        currentMinor: toMinorUnits(nextCurrent, "INR"),
        targetDate:
          parsed.targetDate !== undefined
            ? parsed.targetDate
            : existing.targetDate,
        priority: parsed.priority ?? existing.priority,
        expectedAnnualReturn:
          parsed.expectedAnnualReturn ?? existing.expectedAnnualReturn,
        inflationRate: parsed.inflationRate ?? existing.inflationRate,
        monthlyContribution: nextMonthly,
        monthlyContributionMinor: toMinorUnits(nextMonthly, "INR"),
        status: parsed.status ?? existing.status,
        notes: parsed.notes !== undefined ? parsed.notes : existing.notes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(financialGoals.id, parsed.id))
      .returning()
      .get();

    recordGoalSnapshot(updated.id);
    return NextResponse.json({ goal: updated });
  } catch (err) {
    return handleApiError(err, "goals.PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid goal id", 400, "INVALID_ID");
    }
    const existing = db
      .select()
      .from(financialGoals)
      .where(eq(financialGoals.id, id))
      .get();
    if (!existing) {
      throw new AppError("Goal not found", 404, "GOAL_NOT_FOUND");
    }
    sqlite.transaction(() => {
      db.delete(financialGoals).where(eq(financialGoals.id, id)).run();
    })();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "goals.DELETE");
  }
}
