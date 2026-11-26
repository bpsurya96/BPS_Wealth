import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sqlite } from "@/db";
import {
  incomeEntries,
  investmentHoldings,
  investmentTransactions,
  rentalPayments,
  rentalProperties,
} from "@/db/schema";
import { getSetting, requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { fromMinorUnits, toMinorUnits } from "@/lib/currency";
import { handleApiError } from "@/lib/errors";

const quickLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  salaryAmount: z.coerce.number().finite().min(0).default(0),
  salaryAccount: z.string().trim().max(80).default("Bank"),
  sips: z
    .array(
      z.object({
        holdingId: z.coerce.number().int().positive(),
        amount: z.coerce.number().finite().min(0),
        nav: z.coerce.number().finite().min(0).default(0),
        employerAmount: z.coerce.number().finite().min(0).default(0),
      })
    )
    .default([]),
  rentals: z
    .array(
      z.object({
        propertyId: z.coerce.number().int().positive(),
        rentAmount: z.coerce.number().finite().min(0),
        solarCharge: z.coerce.number().finite().min(0).default(0),
        paymentMode: z.string().trim().max(40).default("UPI"),
      })
    )
    .default([]),
});

export async function GET() {
  try {
    await requireAdminSession();

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
      .orderBy(desc(incomeEntries.date), desc(incomeEntries.id))
      .all()
      .find((i) => i.category === "salary");

    return NextResponse.json({
      defaultSalary: recentSalary?.inhandAmount ?? 0,
      defaultAccount: recentSalary?.account ?? "Bank",
      sips: holdings,
      rentals,
    });
  } catch (err) {
    return handleApiError(err, "quick-log.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const parsed = quickLogSchema.parse(await req.json());
    const date = parsed.date || new Date().toISOString().slice(0, 10);
    const month = parsed.month || date.slice(0, 7);
    const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));

    let loggedCount = 0;

    const runBatch = sqlite.transaction(() => {
      if (parsed.salaryAmount > 0) {
        db.insert(incomeEntries)
          .values({
            month,
            date,
            source: "Salary",
            category: "salary",
            grossAmount: parsed.salaryAmount,
            inhandAmount: parsed.salaryAmount,
            tdsAmount: 0,
            grossMinor: toMinorUnits(parsed.salaryAmount),
            inhandMinor: toMinorUnits(parsed.salaryAmount),
            tdsMinor: 0,
            account: parsed.salaryAccount,
            notes: "Logged via Monthly Quick-Log",
          })
          .run();
        loggedCount++;
      }

      for (const r of parsed.rentals) {
        if (r.rentAmount <= 0) continue;
        const prop = db
          .select()
          .from(rentalProperties)
          .where(eq(rentalProperties.id, r.propertyId))
          .get();
        if (!prop) continue;

        const total = r.rentAmount + r.solarCharge;
        db.insert(rentalPayments)
          .values({
            propertyId: r.propertyId,
            billingMonth: month,
            rentAmount: r.rentAmount,
            solarCharge: r.solarCharge,
            deductions: 0,
            totalAmount: total,
            rentMinor: toMinorUnits(r.rentAmount),
            solarMinor: toMinorUnits(r.solarCharge),
            deductionsMinor: 0,
            totalMinor: toMinorUnits(total),
            paidDate: date,
            paymentMode: r.paymentMode,
            notes: "Logged via Monthly Quick-Log",
          })
          .run();
        loggedCount++;
      }

      for (const s of parsed.sips) {
        if (s.amount <= 0) continue;
        const holding = db
          .select()
          .from(investmentHoldings)
          .where(eq(investmentHoldings.id, s.holdingId))
          .get();
        if (!holding) continue;

        const nav = s.nav > 0 ? s.nav : holding.currentNav;
        const units = nav > 0 ? s.amount / nav : 0;
        const fxRate =
          holding.currency.toUpperCase() === "USD" ? usdInrRate : 1;

        db.insert(investmentTransactions)
          .values({
            holdingId: holding.id,
            date,
            type:
              holding.assetClass === "mutual_fund" ||
                holding.assetClass === "etf_us" ||
                holding.assetClass === "etf_in"
                ? "sip"
                : "installment",
            amount: s.amount,
            amountMinor: toMinorUnits(s.amount, holding.currency),
            currency: holding.currency,
            fxRate,
            navOrPrice: nav,
            units,
            employerAmount: s.employerAmount,
            employerMinor: toMinorUnits(s.employerAmount, holding.currency),
            remarks: `Quick-Log ${month}`,
          })
          .run();

        const oldInvestedMinor = toMinorUnits(
          holding.investedAmount,
          holding.currency
        );
        const addMinor = toMinorUnits(s.amount, holding.currency);
        const newUnits = holding.units + units;
        const newInvestedMinor = oldInvestedMinor + addMinor;
        const newCurrentMinor =
          newUnits > 0 && nav > 0
            ? toMinorUnits(newUnits * nav, holding.currency)
            : toMinorUnits(holding.currentValue, holding.currency) + addMinor;

        const newInvested = fromMinorUnits(newInvestedMinor, holding.currency);
        const newCurrent = fromMinorUnits(newCurrentMinor, holding.currency);

        db.update(investmentHoldings)
          .set({
            units: newUnits,
            investedAmount: newInvested,
            investedMinor: newInvestedMinor,
            avgNav: newUnits > 0 ? newInvested / newUnits : holding.avgNav,
            currentNav: nav > 0 ? nav : holding.currentNav,
            currentValue: newCurrent,
            currentValueMinor: newCurrentMinor,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(investmentHoldings.id, holding.id))
          .run();
        loggedCount++;
      }
    });

    runBatch();
    return NextResponse.json({ ok: true, loggedCount });
  } catch (err) {
    return handleApiError(err, "quick-log.POST");
  }
}
