import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rentalPayments, rentalProperties } from "@/db/schema";
import { requireUnlocked } from "@/lib/auth";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const properties = db.select().from(rentalProperties).all();
  const payments = db
    .select()
    .from(rentalPayments)
    .orderBy(desc(rentalPayments.billingMonth), desc(rentalPayments.id))
    .all();
  return NextResponse.json({ properties, payments });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();

  if (body.kind === "payment") {
    const rentAmount = Number(body.rentAmount || 0);
    const solarCharge = Number(body.solarCharge || 0);
    const deductions = Number(body.deductions || 0);
    const totalAmount =
      body.totalAmount !== undefined
        ? Number(body.totalAmount)
        : rentAmount + solarCharge - deductions;

    const inserted = db
      .insert(rentalPayments)
      .values({
        propertyId: Number(body.propertyId),
        billingMonth: String(
          body.billingMonth || new Date().toISOString().slice(0, 7)
        ),
        rentAmount,
        solarCharge,
        deductions,
        totalAmount,
        paidDate: String(body.paidDate || new Date().toISOString().slice(0, 10)),
        paymentMode: String(body.paymentMode || "UPI"),
        notes: String(body.notes || ""),
      })
      .returning()
      .get();
    return NextResponse.json({ payment: inserted }, { status: 201 });
  }

  const inserted = db
    .insert(rentalProperties)
    .values({
      name: String(body.name || "Shop"),
      tenantName: String(body.tenantName || ""),
      advancePaid: Number(body.advancePaid || 0),
      advancePending: Number(body.advancePending || 0),
      monthlyRent: Number(body.monthlyRent || 0),
      status: String(body.status || "occupied"),
      notes: String(body.notes || ""),
    })
    .returning()
    .get();
  return NextResponse.json({ property: inserted }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const kind = req.nextUrl.searchParams.get("kind") || "payment";
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (kind === "property") {
    db.delete(rentalProperties).where(eq(rentalProperties.id, id)).run();
  } else {
    db.delete(rentalPayments).where(eq(rentalPayments.id, id)).run();
  }
  return NextResponse.json({ ok: true });
}
