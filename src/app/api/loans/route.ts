import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { loans, loanTransactions } from "@/db/schema";
import { requireUnlocked } from "@/lib/auth";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const allLoans = db.select().from(loans).all();
  const txns = db
    .select()
    .from(loanTransactions)
    .orderBy(desc(loanTransactions.txnDate))
    .all();
  return NextResponse.json({ loans: allLoans, transactions: txns });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  const inserted = db
    .insert(loans)
    .values({
      name: String(body.name || "Loan"),
      lender: String(body.lender || ""),
      principalSanctioned: Number(body.principalSanctioned || 0),
      currentBalance: Number(body.currentBalance || 0),
      interestRate: Number(body.interestRate || 0),
      emiAmount: Number(body.emiAmount || 0),
      tenureMonths: Number(body.tenureMonths || 0),
      startDate: String(body.startDate || ""),
      closedDate: String(body.closedDate || ""),
      status: String(body.status || "active"),
      notes: String(body.notes || ""),
    })
    .returning()
    .get();
  return NextResponse.json({ loan: inserted }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  db.delete(loans).where(eq(loans.id, id)).run();
  return NextResponse.json({ ok: true });
}
