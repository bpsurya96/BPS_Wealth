import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { loans, loanTransactions } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { createLoanSchema, createLoanTxnSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminSession();
    const allLoans = db.select().from(loans).all();
    const txns = db
      .select()
      .from(loanTransactions)
      .orderBy(desc(loanTransactions.txnDate), desc(loanTransactions.id))
      .all();
    return NextResponse.json({ loans: allLoans, transactions: txns });
  } catch (err) {
    return handleApiError(err, "loans.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const body = await req.json();

    if (body?.kind === "transaction") {
      const parsed = createLoanTxnSchema.parse(body);
      const loan = db
        .select()
        .from(loans)
        .where(eq(loans.id, parsed.loanId))
        .get();
      if (!loan) {
        throw new AppError("Loan not found", 404, "LOAN_NOT_FOUND");
      }

      const txn = sqlite.transaction(() => {
        const inserted = db
          .insert(loanTransactions)
          .values({
            loanId: parsed.loanId,
            txnDate: parsed.txnDate,
            description: parsed.description,
            type: parsed.type,
            debit: parsed.debit,
            credit: parsed.credit,
            balanceAfter: parsed.balanceAfter,
            debitMinor: toMinorUnits(parsed.debit),
            creditMinor: toMinorUnits(parsed.credit),
            balanceAfterMinor: toMinorUnits(parsed.balanceAfter),
          })
          .returning()
          .get();

        db.update(loans)
          .set({
            currentBalance: parsed.balanceAfter,
            currentBalanceMinor: toMinorUnits(parsed.balanceAfter),
            status: parsed.balanceAfter === 0 ? "closed" : loan.status,
            closedDate:
              parsed.balanceAfter === 0 ? parsed.txnDate : loan.closedDate,
          })
          .where(eq(loans.id, parsed.loanId))
          .run();

        return inserted;
      })();

      return NextResponse.json({ transaction: txn }, { status: 201 });
    }

    const parsed = createLoanSchema.parse(body);
    const inserted = db
      .insert(loans)
      .values({
        name: parsed.name,
        lender: parsed.lender,
        principalSanctioned: parsed.principalSanctioned,
        currentBalance: parsed.currentBalance,
        principalSanctionedMinor: toMinorUnits(parsed.principalSanctioned),
        currentBalanceMinor: toMinorUnits(parsed.currentBalance),
        interestRate: parsed.interestRate,
        emiAmount: parsed.emiAmount,
        emiMinor: toMinorUnits(parsed.emiAmount),
        tenureMonths: parsed.tenureMonths,
        startDate: parsed.startDate,
        closedDate: parsed.closedDate,
        status: parsed.status,
        notes: parsed.notes,
      })
      .returning()
      .get();
    return NextResponse.json({ loan: inserted }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "loans.POST");
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
    db.delete(loans).where(eq(loans.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "loans.DELETE");
  }
}
