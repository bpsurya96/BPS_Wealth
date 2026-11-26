import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { insurancePolicies } from "@/db/schema";
import { requireUnlocked } from "@/lib/auth";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const policies = db.select().from(insurancePolicies).all();
  return NextResponse.json({ policies });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  const inserted = db
    .insert(insurancePolicies)
    .values({
      name: String(body.name || "Policy"),
      policyType: String(body.policyType || "term"),
      provider: String(body.provider || ""),
      premiumAmount: Number(body.premiumAmount || 0),
      premiumFrequency: String(body.premiumFrequency || "annual"),
      coverAmount: String(body.coverAmount || ""),
      startDate: String(body.startDate || ""),
      expiryDate: String(body.expiryDate || ""),
      maturityDate: String(body.maturityDate || ""),
      status: String(body.status || "active"),
      notes: String(body.notes || ""),
    })
    .returning()
    .get();
  return NextResponse.json({ policy: inserted }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  db.delete(insurancePolicies).where(eq(insurancePolicies.id, id)).run();
  return NextResponse.json({ ok: true });
}
