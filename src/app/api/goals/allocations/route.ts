import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { goalInvestmentAllocations } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import { upsertGoalAllocationSchema } from "@/lib/validation";
import {
  recordGoalSnapshot,
  upsertGoalAllocation,
} from "@/services/wealth-planning";

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = upsertGoalAllocationSchema.parse(await req.json());
    const allocation = upsertGoalAllocation(parsed);
    return NextResponse.json({ allocation }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "goals.allocations.POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const idParam = req.nextUrl.searchParams.get("id");
    const goalIdParam = req.nextUrl.searchParams.get("goalId");
    const holdingIdParam = req.nextUrl.searchParams.get("holdingId");

    if (idParam) {
      const id = Number(idParam);
      if (!Number.isInteger(id) || id <= 0) {
        throw new AppError("Invalid allocation id", 400, "INVALID_ID");
      }
      const existing = db
        .select()
        .from(goalInvestmentAllocations)
        .where(eq(goalInvestmentAllocations.id, id))
        .get();
      if (!existing) {
        throw new AppError("Allocation not found", 404, "NOT_FOUND");
      }
      db.delete(goalInvestmentAllocations)
        .where(eq(goalInvestmentAllocations.id, id))
        .run();
      recordGoalSnapshot(existing.goalId);
      return NextResponse.json({ ok: true });
    }

    if (goalIdParam && holdingIdParam) {
      const goalId = Number(goalIdParam);
      const holdingId = Number(holdingIdParam);
      if (
        !Number.isInteger(goalId) ||
        goalId <= 0 ||
        !Number.isInteger(holdingId) ||
        holdingId <= 0
      ) {
        throw new AppError("Invalid goalId or holdingId", 400, "INVALID_ID");
      }
      db.delete(goalInvestmentAllocations)
        .where(
          and(
            eq(goalInvestmentAllocations.goalId, goalId),
            eq(goalInvestmentAllocations.holdingId, holdingId)
          )
        )
        .run();
      recordGoalSnapshot(goalId);
      return NextResponse.json({ ok: true });
    }

    throw new AppError("Provide id or goalId & holdingId", 400, "INVALID_PARAMS");
  } catch (err) {
    return handleApiError(err, "goals.allocations.DELETE");
  }
}
