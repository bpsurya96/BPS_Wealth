import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { insurancePolicies } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { normalizeAnnualInsurancePremium } from "@/lib/finance";
import { createInsuranceSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminSession();
    const policies = db
      .select()
      .from(insurancePolicies)
      .all()
      .map((p) => ({
        ...p,
        annualizedPremium: normalizeAnnualInsurancePremium(
          p.premiumAmount,
          p.premiumFrequency
        ),
      }));
    return NextResponse.json({ policies });
  } catch (err) {
    return handleApiError(err, "insurance.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = createInsuranceSchema.parse(await req.json());

    const inserted = db
      .insert(insurancePolicies)
      .values({
        name: parsed.name,
        policyType: parsed.policyType,
        provider: parsed.provider,
        premiumAmount: parsed.premiumAmount,
        premiumMinor: toMinorUnits(parsed.premiumAmount),
        premiumFrequency: parsed.premiumFrequency,
        coverAmount: parsed.coverAmount,
        startDate: parsed.startDate,
        expiryDate: parsed.expiryDate,
        maturityDate: parsed.maturityDate,
        status: parsed.status,
        notes: parsed.notes,
      })
      .returning()
      .get();
    return NextResponse.json({ policy: inserted }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "insurance.POST");
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
    db.delete(insurancePolicies).where(eq(insurancePolicies.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "insurance.DELETE");
  }
}
