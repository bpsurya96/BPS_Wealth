import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentHoldings, investmentTransactions } from "@/db/schema";
import { getSetting, requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import {
  buildHoldingCashflowsNative,
  calculateXIRR,
  holdingInrValues,
} from "@/lib/finance";
import { guessSchemeOrTicker } from "@/lib/market-data";
import { createHoldingSchema, patchHoldingSchema } from "@/lib/validation";

export async function GET() {
  try {
    await requireAdminSession();
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
      const cfs = buildHoldingCashflowsNative({
        holding: h,
        transactions: list,
      });
      const xirr = calculateXIRR(cfs);
      return {
        ...h,
        ...vals,
        xirr,
        txnCount: list.length,
      };
    });

    return NextResponse.json({ usdInrRate, holdings: enriched });
  } catch (err) {
    return handleApiError(err, "investments.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = createHoldingSchema.parse(await req.json());
    const guessed = guessSchemeOrTicker(parsed.name);

    const units = parsed.units;
    const currentNav = parsed.currentNav ?? parsed.avgNav ?? 0;
    const investedAmount = parsed.investedAmount;
    const currentValue =
      units > 0 && currentNav > 0
        ? units * currentNav
        : (parsed.currentValue ?? investedAmount);

    const inserted = db
      .insert(investmentHoldings)
      .values({
        name: parsed.name,
        assetClass: parsed.assetClass,
        currency: parsed.currency,
        schemeCode: parsed.schemeCode || guessed.schemeCode || "",
        ticker: parsed.ticker || guessed.ticker || "",
        platform: parsed.platform,
        plannedSip: parsed.plannedSip,
        targetAmount: parsed.targetAmount,
        investedAmount,
        currentValue,
        plannedSipMinor: toMinorUnits(parsed.plannedSip, parsed.currency),
        targetAmountMinor: toMinorUnits(parsed.targetAmount, parsed.currency),
        investedMinor: toMinorUnits(investedAmount, parsed.currency),
        currentValueMinor: toMinorUnits(currentValue, parsed.currency),
        units,
        avgNav: parsed.avgNav ?? currentNav,
        currentNav,
        interestRate: parsed.interestRate,
        startDate: parsed.startDate,
        maturityDate: parsed.maturityDate,
        tenureMonths: parsed.tenureMonths,
        isEmergencyFund: parsed.isEmergencyFund,
        status: parsed.status,
        notes: parsed.notes,
      })
      .returning()
      .get();

    return NextResponse.json({ holding: inserted }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "investments.POST");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = patchHoldingSchema.parse(await req.json());
    const existing = db
      .select()
      .from(investmentHoldings)
      .where(eq(investmentHoldings.id, parsed.id))
      .get();
    if (!existing) {
      throw new AppError("Holding not found", 404, "NOT_FOUND");
    }

    const nextUnits = parsed.units ?? existing.units;
    const nextNav = parsed.currentNav ?? existing.currentNav;
    const nextCurrent =
      parsed.currentValue !== undefined
        ? parsed.currentValue
        : nextUnits > 0 && nextNav > 0
          ? nextUnits * nextNav
          : existing.currentValue;
    const nextInvested = parsed.investedAmount ?? existing.investedAmount;
    const nextPlannedSip = parsed.plannedSip ?? existing.plannedSip;

    const updated = db
      .update(investmentHoldings)
      .set({
        name: parsed.name ?? existing.name,
        platform: parsed.platform ?? existing.platform,
        schemeCode: parsed.schemeCode ?? existing.schemeCode,
        ticker: parsed.ticker ?? existing.ticker,
        plannedSip: nextPlannedSip,
        investedAmount: nextInvested,
        currentValue: nextCurrent,
        plannedSipMinor: toMinorUnits(nextPlannedSip, existing.currency),
        investedMinor: toMinorUnits(nextInvested, existing.currency),
        currentValueMinor: toMinorUnits(nextCurrent, existing.currency),
        units: nextUnits,
        currentNav: nextNav,
        interestRate: parsed.interestRate ?? existing.interestRate,
        maturityDate: parsed.maturityDate ?? existing.maturityDate,
        tenureMonths: parsed.tenureMonths ?? existing.tenureMonths,
        isEmergencyFund: parsed.isEmergencyFund ?? existing.isEmergencyFund,
        status: parsed.status ?? existing.status,
        notes: parsed.notes ?? existing.notes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(investmentHoldings.id, parsed.id))
      .returning()
      .get();

    return NextResponse.json({ holding: updated });
  } catch (err) {
    return handleApiError(err, "investments.PATCH");
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
    db.delete(investmentHoldings).where(eq(investmentHoldings.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "investments.DELETE");
  }
}
