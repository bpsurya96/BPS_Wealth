import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { netWorthMilestones } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { createMilestoneSchema } from "@/lib/validation";
import { getNetWorthMilestoneData } from "@/services/wealth-planning";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json(getNetWorthMilestoneData());
  } catch (err) {
    return handleApiError(err, "planning.milestones.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = createMilestoneSchema.parse(await req.json());
    const milestone = db
      .insert(netWorthMilestones)
      .values({
        label: parsed.label,
        targetAmount: parsed.targetAmount,
        targetMinor: toMinorUnits(parsed.targetAmount, "INR"),
        isPreset: false,
        achievedDate: "",
        notes: parsed.notes,
      })
      .returning()
      .get();
    return NextResponse.json({ milestone }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "planning.milestones.POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid milestone id", 400, "INVALID_ID");
    }
    db.delete(netWorthMilestones).where(eq(netWorthMilestones.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "planning.milestones.DELETE");
  }
}
