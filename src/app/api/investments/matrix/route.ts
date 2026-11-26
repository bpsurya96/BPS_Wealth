import { NextResponse } from "next/server";
import { db } from "@/db";
import { investmentHoldings, investmentTransactions } from "@/db/schema";
import { getSetting, requireAdminSession } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    await requireAdminSession();
    const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
    const holdings = db.select().from(investmentHoldings).all();
    const txns = db.select().from(investmentTransactions).all();

    const monthSet = new Set<string>();
    const cellMap = new Map<
      string,
      { amountInr: number; units: number; count: number }
    >();

    for (const t of txns) {
      if (
        t.type === "sell" ||
        t.type === "dividend" ||
        t.type === "interest_payout"
      ) {
        continue;
      }
      const month = t.date.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) continue;
      monthSet.add(month);

      const isForeign = t.currency.toUpperCase() !== "INR";
      const fx = isForeign ? (t.fxRate > 0 ? t.fxRate : usdInrRate) : 1;
      const key = `${t.holdingId}:${month}`;
      const existing = cellMap.get(key) ?? { amountInr: 0, units: 0, count: 0 };
      existing.amountInr += t.amount * fx;
      existing.units += t.units;
      existing.count += 1;
      cellMap.set(key, existing);
    }

    const months = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

    const rows = holdings
      .filter((h) => h.status !== "closed")
      .map((h) => {
        const monthly: Record<
          string,
          { amountInr: number; units: number; count: number }
        > = {};
        let rowTotalInr = 0;
        for (const m of months) {
          const cell = cellMap.get(`${h.id}:${m}`);
          if (cell) {
            monthly[m] = cell;
            rowTotalInr += cell.amountInr;
          }
        }
        return {
          holdingId: h.id,
          name: h.name,
          assetClass: h.assetClass,
          currency: h.currency,
          plannedSip: h.plannedSip,
          rowTotalInr,
          monthly,
        };
      })
      .filter((r) => r.rowTotalInr > 0 || r.plannedSip > 0);

    const monthTotals: Record<string, number> = {};
    for (const m of months) {
      monthTotals[m] = rows.reduce(
        (sum, r) => sum + (r.monthly[m]?.amountInr ?? 0),
        0
      );
    }

    return NextResponse.json({ months, rows, monthTotals, usdInrRate });
  } catch (err) {
    return handleApiError(err, "investments.matrix.GET");
  }
}
