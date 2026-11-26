import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  incomeEntries,
  investmentHoldings,
  investmentTransactions,
  rentalPayments,
  rentalProperties,
} from "@/db/schema";
import { getSetting, requireUnlocked } from "@/lib/auth";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  const holdings = db
    .select()
    .from(investmentHoldings)
    .all()
    .filter((h) => h.status === "active" && h.plannedSip > 0);
  const rentals = db
    .select()
    .from(rentalProperties)
    .all()
    .filter((r) => r.status === "occupied");
  const recentSalary = db
    .select()
    .from(incomeEntries)
    .all()
    .find((i) => i.category === "salary");

  return NextResponse.json({
    defaultSalary: recentSalary?.inhandAmount ?? 221000,
    sips: holdings,
    rentals,
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  const body = await req.json();
  const date = String(body.date || new Date().toISOString().slice(0, 10));
  const month = String(body.month || date.slice(0, 7));
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));

  const salaryAmount = Number(body.salaryAmount || 0);
  const salaryAccount = String(body.salaryAccount || "ICICI");
  const sipItems: Array<{
    holdingId: number;
    amount: number;
    nav: number;
    employerAmount?: number;
  }> = Array.isArray(body.sips) ? body.sips : [];
  const rentItems: Array<{
    propertyId: number;
    rentAmount: number;
    solarCharge: number;
    paymentMode: string;
  }> = Array.isArray(body.rentals) ? body.rentals : [];

  let loggedCount = 0;

  const runBatch = sqlite.transaction(() => {
    if (salaryAmount > 0) {
      db.insert(incomeEntries)
        .values({
          month,
          date,
          source: "Salary",
          category: "salary",
          grossAmount: salaryAmount,
          inhandAmount: salaryAmount,
          tdsAmount: 0,
          account: salaryAccount,
          notes: "Logged via Monthly Quick-Log",
        })
        .run();
      loggedCount++;
    }

    for (const r of rentItems) {
      if (r.rentAmount <= 0) continue;
      db.insert(rentalPayments)
        .values({
          propertyId: r.propertyId,
          billingMonth: month,
          rentAmount: r.rentAmount,
          solarCharge: r.solarCharge || 0,
          deductions: 0,
          totalAmount: r.rentAmount + (r.solarCharge || 0),
          paidDate: date,
          paymentMode: r.paymentMode || "UPI",
          notes: "Logged via Monthly Quick-Log",
        })
        .run();
      loggedCount++;
    }

    for (const s of sipItems) {
      if (s.amount <= 0) continue;
      const holding = db
        .select()
        .from(investmentHoldings)
        .where(eq(investmentHoldings.id, s.holdingId))
        .get();
      if (!holding) continue;

      const nav = s.nav > 0 ? s.nav : holding.currentNav;
      const units = nav > 0 ? s.amount / nav : 0;
      const fxRate = holding.currency === "USD" ? usdInrRate : 1;

      db.insert(investmentTransactions)
        .values({
          holdingId: holding.id,
          date,
          type:
            holding.assetClass === "mutual_fund" ||
            holding.assetClass === "etf_us"
              ? "sip"
              : "installment",
          amount: s.amount,
          currency: holding.currency,
          fxRate,
          navOrPrice: nav,
          units,
          employerAmount: s.employerAmount ?? 0,
          remarks: `Quick-Log ${month}`,
        })
        .run();

      const newUnits = holding.units + units;
      const newInvested = holding.investedAmount + s.amount;
      const newCurrent =
        newUnits > 0 && nav > 0
          ? newUnits * nav
          : holding.currentValue + s.amount;

      db.update(investmentHoldings)
        .set({
          units: newUnits,
          investedAmount: newInvested,
          avgNav: newUnits > 0 ? newInvested / newUnits : holding.avgNav,
          currentNav: nav > 0 ? nav : holding.currentNav,
          currentValue: newCurrent,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(investmentHoldings.id, holding.id))
        .run();
      loggedCount++;
    }
  });

  runBatch();
  return NextResponse.json({ ok: true, loggedCount });
}
