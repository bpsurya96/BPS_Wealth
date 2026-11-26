import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { investmentHoldings, investmentTransactions } from "@/db/schema";
import { getSetting, requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import {
  fromMinorUnits,
  reduceCostBasisMinor,
  toMinorUnits,
} from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import { buildHoldingCashflowsNative, calculateXIRR } from "@/lib/finance";
import { createInvestmentTxnSchema } from "@/lib/validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const holdingId = Number(id);
    if (!Number.isInteger(holdingId) || holdingId <= 0) {
      throw new AppError("Invalid holding id", 400, "INVALID_ID");
    }

    const holding = db
      .select()
      .from(investmentHoldings)
      .where(eq(investmentHoldings.id, holdingId))
      .get();
    if (!holding) {
      throw new AppError("Holding not found", 404, "NOT_FOUND");
    }

    const transactions = db
      .select()
      .from(investmentTransactions)
      .where(eq(investmentTransactions.holdingId, holdingId))
      .orderBy(desc(investmentTransactions.date), desc(investmentTransactions.id))
      .all();

    const cfs = buildHoldingCashflowsNative({ holding, transactions });

    const monthlyMap = new Map<
      string,
      { month: string; invested: number; units: number; txCount: number }
    >();
    for (const t of transactions) {
      if (t.type === "dividend" || t.type === "interest_payout") continue;
      const m = t.date.slice(0, 7);
      const cur = monthlyMap.get(m) ?? {
        month: m,
        invested: 0,
        units: 0,
        txCount: 0,
      };
      const sign = t.type === "sell" ? -1 : 1;
      cur.invested += sign * t.amount;
      cur.units += sign * t.units;
      cur.txCount += 1;
      monthlyMap.set(m, cur);
    }
    const monthlySummary = Array.from(monthlyMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    return NextResponse.json({
      holding,
      transactions,
      monthlySummary,
      usdInrRate: Number.parseFloat(getSetting("usd_inr_rate", "84.5")),
      xirr: calculateXIRR(cfs),
    });
  } catch (err) {
    return handleApiError(err, "investments.[id].transactions.GET");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const { id } = await params;
    const holdingId = Number(id);
    if (!Number.isInteger(holdingId) || holdingId <= 0) {
      throw new AppError("Invalid holding id", 400, "INVALID_ID");
    }

    const holding = db
      .select()
      .from(investmentHoldings)
      .where(eq(investmentHoldings.id, holdingId))
      .get();
    if (!holding) {
      throw new AppError("Holding not found", 404, "NOT_FOUND");
    }

    const parsed = createInvestmentTxnSchema.parse(await req.json());
    const txDate = parsed.date || new Date().toISOString().slice(0, 10);
    const navOrPrice = parsed.navOrPrice ?? holding.currentNav ?? 0;
    const units =
      parsed.units !== undefined && parsed.units > 0
        ? parsed.units
        : navOrPrice > 0 && parsed.type !== "dividend" && parsed.type !== "interest_payout"
          ? parsed.amount / navOrPrice
          : 0;

    const currentUsdInr = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
    const fxRate =
      holding.currency.toUpperCase() === "USD"
        ? parsed.fxRate ?? currentUsdInr
        : 1;

    const result = sqlite.transaction(() => {
      const inserted = db
        .insert(investmentTransactions)
        .values({
          holdingId,
          date: txDate,
          type: parsed.type,
          amount: parsed.amount,
          amountMinor: toMinorUnits(parsed.amount, holding.currency),
          currency: holding.currency,
          fxRate,
          navOrPrice,
          units,
          employerAmount: parsed.employerAmount,
          employerMinor: toMinorUnits(parsed.employerAmount, holding.currency),
          remarks: parsed.remarks,
        })
        .returning()
        .get();

      const oldInvestedMinor = toMinorUnits(
        holding.investedAmount,
        holding.currency
      );
      const oldCurrentMinor = toMinorUnits(
        holding.currentValue,
        holding.currency
      );
      const txAmountMinor = toMinorUnits(parsed.amount, holding.currency);

      let newUnits = holding.units;
      let newInvestedMinor = oldInvestedMinor;
      let newCurrentMinor = oldCurrentMinor;
      let newStatus = holding.status;
      const refNav = navOrPrice > 0 ? navOrPrice : holding.currentNav;

      if (parsed.type === "sell") {
        newUnits = Math.max(0, holding.units - units);
        if (holding.units > 0 && units > 0) {
          newInvestedMinor = reduceCostBasisMinor(
            oldInvestedMinor,
            holding.units,
            units
          );
        } else {
          newInvestedMinor = Math.max(0, oldInvestedMinor - txAmountMinor);
        }
        newCurrentMinor =
          newUnits > 0 && refNav > 0
            ? toMinorUnits(newUnits * refNav, holding.currency)
            : Math.max(0, oldCurrentMinor - txAmountMinor);
        if (
          (holding.units > 0 && newUnits <= 1e-6) ||
          (holding.units === 0 && newCurrentMinor === 0)
        ) {
          newStatus = "closed";
        }
      } else if (parsed.type === "interest") {
        // Compounded interest increases current value without increasing contributed cost basis
        newCurrentMinor = oldCurrentMinor + txAmountMinor;
      } else if (
        parsed.type === "dividend" ||
        parsed.type === "interest_payout"
      ) {
        // Cash payouts do not change invested cost basis or units
      } else {
        // sip | buy | installment | employer_contribution
        newUnits = holding.units + units;
        newInvestedMinor = oldInvestedMinor + txAmountMinor;
        newCurrentMinor =
          newUnits > 0 && refNav > 0
            ? toMinorUnits(newUnits * refNav, holding.currency)
            : oldCurrentMinor + txAmountMinor;
      }

      const newInvested = fromMinorUnits(newInvestedMinor, holding.currency);
      const newCurrent = fromMinorUnits(newCurrentMinor, holding.currency);
      const newAvgNav = newUnits > 0 ? newInvested / newUnits : holding.avgNav;

      db.update(investmentHoldings)
        .set({
          units: newUnits,
          investedAmount: newInvested,
          investedMinor: newInvestedMinor,
          avgNav: newAvgNav,
          currentNav: refNav,
          currentValue: newCurrent,
          currentValueMinor: newCurrentMinor,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(investmentHoldings.id, holdingId))
        .run();

      return inserted;
    })();

    return NextResponse.json({ transaction: result }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "investments.[id].transactions.POST");
  }
}
