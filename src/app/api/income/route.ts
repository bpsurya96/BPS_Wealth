import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { incomeEntries } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { createIncomeSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminSession();
    const rows = db
      .select()
      .from(incomeEntries)
      .orderBy(desc(incomeEntries.date), desc(incomeEntries.id))
      .all();
    return NextResponse.json({ items: rows });
  } catch (err) {
    return handleApiError(err, "income.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = createIncomeSchema.parse(await req.json());
    const date = parsed.date || new Date().toISOString().slice(0, 10);
    const month = parsed.month || date.slice(0, 7);
    const grossAmount = parsed.grossAmount ?? parsed.inhandAmount;

    const inserted = db
      .insert(incomeEntries)
      .values({
        month,
        date,
        source: parsed.source,
        category: parsed.category,
        grossAmount,
        inhandAmount: parsed.inhandAmount,
        tdsAmount: parsed.tdsAmount,
        grossMinor: toMinorUnits(grossAmount),
        inhandMinor: toMinorUnits(parsed.inhandAmount),
        tdsMinor: toMinorUnits(parsed.tdsAmount),
        rentalPaymentId: parsed.rentalPaymentId ?? null,
        account: parsed.account,
        notes: parsed.notes,
      })
      .returning()
      .get();
    return NextResponse.json({ item: inserted }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "income.POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid id", 400, "INVALID_ID");
    }
    db.delete(incomeEntries).where(eq(incomeEntries.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "income.DELETE");
  }
}
