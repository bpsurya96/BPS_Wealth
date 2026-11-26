import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentHoldings, investmentTransactions } from "@/db/schema";
import { getSetting, requireUnlocked } from "@/lib/auth";
import { calculateXIRR, holdingInrValues } from "@/lib/finance";
import { guessSchemeOrTicker } from "@/lib/market-data";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
  const holdings = db
    .select()
    .from(investmentHoldings)
    .orderBy(desc(investmentHoldings.currentValue))
    .all();
  const txns = db.select().from(investmentTransactions).all();

  const txnsByHolding = new Map<number, typeof txns>();
  for (const t of txns) {
    const arr = txnsByHolding.get(t.holdingId) ?? [];
    arr.push(t);
    txnsByHolding.set(t.holdingId, arr);
  }

  const enriched = holdings.map((h) => {
    const vals = holdingInrValues(h, usdInrRate);
    const list = txnsByHolding.get(h.id) ?? [];
    const cfs = list.map((t) => ({
      date: t.date,
      amount:
        t.type === "sell" || t.type === "dividend"
          ? Math.abs(t.amount)
          : -Math.abs(t.amount),
    }));
    const currentNative =
      h.units > 0 && h.currentNav > 0 ? h.units * h.currentNav : h.currentValue;
    if (currentNative > 0 && cfs.length > 0) {
      cfs.push({
        date: new Date().toISOString().slice(0, 10),
        amount: currentNative,
      });
    }
    const xirr = calculateXIRR(cfs);
    return {
      ...h,
      ...vals,
      xirr,
      txnCount: list.length,
    };
  });

  return NextResponse.json({ usdInrRate, holdings: enriched });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const guessed = guessSchemeOrTicker(name);
  const units = Number(body.units || 0);
  const currentNav = Number(body.currentNav || body.avgNav || 0);
  const investedAmount = Number(body.investedAmount || 0);
  const currentValue =
    units > 0 && currentNav > 0
      ? units * currentNav
      : Number(body.currentValue || investedAmount);

  const inserted = db
    .insert(investmentHoldings)
    .values({
      name,
      assetClass: String(body.assetClass || "mutual_fund"),
      currency: String(body.currency || "INR"),
      schemeCode: String(body.schemeCode || guessed.schemeCode || ""),
      ticker: String(body.ticker || guessed.ticker || ""),
      platform: String(body.platform || ""),
      plannedSip: Number(body.plannedSip || 0),
      targetAmount: Number(body.targetAmount || 0),
      investedAmount,
      currentValue,
      units,
      avgNav: Number(body.avgNav || currentNav || 0),
      currentNav,
      interestRate: Number(body.interestRate || 0),
      startDate: String(body.startDate || ""),
      maturityDate: String(body.maturityDate || ""),
      tenureMonths: Number(body.tenureMonths || 0),
      isEmergencyFund: Boolean(body.isEmergencyFund),
      status: String(body.status || "active"),
      notes: String(body.notes || ""),
    })
    .returning()
    .get();

  return NextResponse.json({ holding: inserted }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const existing = db
    .select()
    .from(investmentHoldings)
    .where(eq(investmentHoldings.id, id))
    .get();
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextUnits =
    body.units !== undefined ? Number(body.units) : existing.units;
  const nextNav =
    body.currentNav !== undefined
      ? Number(body.currentNav)
      : existing.currentNav;
  const nextCurrent =
    body.currentValue !== undefined
      ? Number(body.currentValue)
      : nextUnits > 0 && nextNav > 0
      ? nextUnits * nextNav
      : existing.currentValue;

  const updated = db
    .update(investmentHoldings)
    .set({
      name: body.name !== undefined ? String(body.name) : existing.name,
      schemeCode:
        body.schemeCode !== undefined
          ? String(body.schemeCode)
          : existing.schemeCode,
      ticker:
        body.ticker !== undefined ? String(body.ticker) : existing.ticker,
      plannedSip:
        body.plannedSip !== undefined
          ? Number(body.plannedSip)
          : existing.plannedSip,
      investedAmount:
        body.investedAmount !== undefined
          ? Number(body.investedAmount)
          : existing.investedAmount,
      currentValue: nextCurrent,
      units: nextUnits,
      currentNav: nextNav,
      status: body.status !== undefined ? String(body.status) : existing.status,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(investmentHoldings.id, id))
    .returning()
    .get();

  return NextResponse.json({ holding: updated });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  db.delete(investmentHoldings).where(eq(investmentHoldings.id, id)).run();
  return NextResponse.json({ ok: true });
}
