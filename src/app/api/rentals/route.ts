import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalPayments, rentalProperties } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import {
  createRentalPaymentSchema,
  createRentalPropertySchema,
} from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminSession();
    const properties = db.select().from(rentalProperties).all();
    const payments = db
      .select()
      .from(rentalPayments)
      .orderBy(desc(rentalPayments.billingMonth), desc(rentalPayments.id))
      .all();
    return NextResponse.json({ properties, payments });
  } catch (err) {
    return handleApiError(err, "rentals.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const body = await req.json();

    if (body?.kind === "payment") {
      const parsed = createRentalPaymentSchema.parse(body);
      const property = db
        .select()
        .from(rentalProperties)
        .where(eq(rentalProperties.id, parsed.propertyId))
        .get();
      if (!property) {
        throw new AppError("Rental property not found", 404, "PROPERTY_NOT_FOUND");
      }

      const totalAmount =
        parsed.totalAmount ??
        Math.max(0, parsed.rentAmount + parsed.solarCharge - parsed.deductions);

      const inserted = db
        .insert(rentalPayments)
        .values({
          propertyId: parsed.propertyId,
          billingMonth:
            parsed.billingMonth || new Date().toISOString().slice(0, 7),
          rentAmount: parsed.rentAmount,
          solarCharge: parsed.solarCharge,
          deductions: parsed.deductions,
          totalAmount,
          rentMinor: toMinorUnits(parsed.rentAmount),
          solarMinor: toMinorUnits(parsed.solarCharge),
          deductionsMinor: toMinorUnits(parsed.deductions),
          totalMinor: toMinorUnits(totalAmount),
          paidDate: parsed.paidDate || new Date().toISOString().slice(0, 10),
          paymentMode: parsed.paymentMode,
          notes: parsed.notes,
        })
        .returning()
        .get();
      return NextResponse.json({ payment: inserted }, { status: 201 });
    }

    const parsed = createRentalPropertySchema.parse(body);
    const inserted = db
      .insert(rentalProperties)
      .values({
        name: parsed.name,
        tenantName: parsed.tenantName,
        advancePaid: parsed.advancePaid,
        advancePending: parsed.advancePending,
        monthlyRent: parsed.monthlyRent,
        advancePaidMinor: toMinorUnits(parsed.advancePaid),
        advancePendingMinor: toMinorUnits(parsed.advancePending),
        monthlyRentMinor: toMinorUnits(parsed.monthlyRent),
        status: parsed.status,
        notes: parsed.notes,
      })
      .returning()
      .get();
    return NextResponse.json({ property: inserted }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "rentals.POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const kind = req.nextUrl.searchParams.get("kind") || "payment";
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid id", 400, "INVALID_ID");
    }
    if (kind === "property") {
      db.delete(rentalProperties).where(eq(rentalProperties.id, id)).run();
    } else {
      db.delete(rentalPayments).where(eq(rentalPayments.id, id)).run();
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "rentals.DELETE");
  }
}
