import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentHoldings, investmentTransactions } from "@/db/schema";
import { getSetting, requireUnlocked } from "@/lib/auth";
import { calculateXIRR } from "@/lib/finance";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const { id } = await params;
  const holdingId = Number(id);
  const holding = db
    .select()
    .from(investmentHoldings)
    .where(eq(investmentHoldings.id, holdingId))
    .get();
  if (!holding) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  const transactions = db
    .select()
    .from(investmentTransactions)
    .where(eq(investmentTransactions.holdingId, holdingId))
    .orderBy(desc(investmentTransactions.date), desc(investmentTransactions.id))
    .all();

  const cfs = transactions.map((t) => ({
    date: t.date,
    amount:
      t.type === "sell" || t.type === "dividend"
        ? Math.abs(t.amount)
        : -Math.abs(t.amount),
  }));
  const currentNative =
    holding.units > 0 && holding.currentNav > 0
      ? holding.units * holding.currentNav
      : holding.currentValue;
  if (currentNative > 0 && cfs.length > 0) {
    cfs.push({
      date: new Date().toISOString().slice(0, 10),
      amount: currentNative,
    });
  }

  const monthlyMap = new Map<
    string,
    { month: string; invested: number; units: number; txCount: number }
  >();
  for (const t of transactions) {
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
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const { id } = await params;
  const holdingId = Number(id);
  const holding = db
    .select()
    .from(investmentHoldings)
    .where(eq(investmentHoldings.id, holdingId))
    .get();
  if (!holding) {
    return NextResponse.json({ error: "Holding not found" }, { status: 404 });
  }

  const body = await req.json();
  const amount = Number(body.amount || 0);
  const navOrPrice = Number(body.navOrPrice || holding.currentNav || 0);
  const units =
    body.units !== undefined && Number(body.units) > 0
      ? Number(body.units)
      : navOrPrice > 0
      ? amount / navOrPrice
      : 0;
  const type = String(body.type || "sip");
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));

  const inserted = db
    .insert(investmentTransactions)
    .values({
      holdingId,
      date: String(body.date || new Date().toISOString().slice(0, 10)),
      type,
      amount,
      currency: holding.currency,
      fxRate: holding.currency === "USD" ? usdInrRate : 1,
      navOrPrice,
      units,
      employerAmount: Number(body.employerAmount || 0),
      remarks: String(body.remarks || ""),
    })
    .returning()
    .get();

  // Recalculate holding totals
  const isOutflow = type === "sell";
  const sign = isOutflow ? -1 : 1;
  const newUnits = Math.max(0, holding.units + sign * units);
  const newInvested = Math.max(0, holding.investedAmount + sign * amount);
  const newAvgNav = newUnits > 0 ? newInvested / newUnits : holding.avgNav;
  const refNav = navOrPrice > 0 ? navOrPrice : holding.currentNav;
  const newCurrent =
    newUnits > 0 && refNav > 0
      ? newUnits * refNav
      : Math.max(0, holding.currentValue + sign * amount);

  db.update(investmentHoldings)
    .set({
      units: newUnits,
      investedAmount: newInvested,
      avgNav: newAvgNav,
      currentNav: refNav,
      currentValue: newCurrent,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(investmentHoldings.id, holdingId))
    .run();

  return NextResponse.json({ transaction: inserted }, { status: 201 });
}
