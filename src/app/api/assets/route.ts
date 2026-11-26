import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assetRegister } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { createAssetSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminSession();
    const assets = db
      .select()
      .from(assetRegister)
      .orderBy(desc(assetRegister.id))
      .all();
    return NextResponse.json({ assets });
  } catch (err) {
    return handleApiError(err, "assets.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const body = await req.json();
    const parsed = createAssetSchema.parse(body);

    const inserted = db
      .insert(assetRegister)
      .values({
        name: parsed.name,
        assetType: parsed.assetType,
        currency: parsed.currency,
        currentValue: parsed.currentValue,
        currentValueMinor: toMinorUnits(parsed.currentValue, parsed.currency),
        linkedLoanId: parsed.linkedLoanId ?? null,
        valuationDate: parsed.valuationDate,
        isEstimated: parsed.isEstimated,
        notes: parsed.notes,
      })
      .returning()
      .get();

    return NextResponse.json({ asset: inserted }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "assets.POST");
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
    db.delete(assetRegister).where(eq(assetRegister.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "assets.DELETE");
  }
}
