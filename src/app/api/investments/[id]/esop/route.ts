import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  esopVestingEntries,
  investmentHoldings,
  investmentTransactions,
} from "@/db/schema";
import { getSetting, requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { fromMinorUnits, toMinorUnits } from "@/lib/currency";
import { AppError, handleApiError } from "@/lib/errors";
import {
  createEsopScheduleSchema,
  patchEsopEntrySchema,
} from "@/lib/validation";

function computeEntryAmounts(
  optionsVested: number,
  exercised: boolean,
  sharePrice: number,
  strikePrice: number,
  currency: string
) {
  const exerciseQuantity = exercised ? optionsVested : 0;
  const sharePriceMinor = toMinorUnits(sharePrice, currency);
  const strikePriceMinor = toMinorUnits(strikePrice, currency);
  const unitTotalMinor = sharePriceMinor + strikePriceMinor;
  const totalPriceMinor = exerciseQuantity * unitTotalMinor;

  return {
    exerciseQuantity,
    sharePrice: fromMinorUnits(sharePriceMinor, currency),
    strikePrice: fromMinorUnits(strikePriceMinor, currency),
    totalPrice: fromMinorUnits(totalPriceMinor, currency),
    sharePriceMinor,
    strikePriceMinor,
    totalPriceMinor,
  };
}

function buildSummary(
  entries: Array<typeof esopVestingEntries.$inferSelect>,
  usdInrRate: number,
  currency: string
) {
  let totalOptions = 0;
  let totalExercisedQty = 0;
  let totalInvestedMinor = 0;

  for (const e of entries) {
    totalOptions += e.optionsVested;
    if (e.exercised) {
      totalExercisedQty += e.exerciseQuantity;
      totalInvestedMinor += e.totalPriceMinor;
    }
  }

  const totalInvested = fromMinorUnits(totalInvestedMinor, currency);
  const fx = currency.toUpperCase() === "USD" ? usdInrRate : 1;

  return {
    totalOptions,
    totalExercisedQty,
    totalInvested,
    totalInvestedInr: totalInvested * fx,
    currentValue: 0,
    currentValueInr: 0,
    profit: 0,
    profitInr: 0,
  };
}

function syncEsopHoldingFromSchedule(
  holdingId: number,
  currency: string,
  usdInrRate: number
) {
  const rows = db
    .select()
    .from(esopVestingEntries)
    .where(eq(esopVestingEntries.holdingId, holdingId))
    .orderBy(
      asc(esopVestingEntries.period),
      asc(esopVestingEntries.vestingDate),
      asc(esopVestingEntries.id)
    )
    .all();

  let runningCumulative = 0;
  let totalExercisedQty = 0;
  let totalInvestedMinor = 0;

  const syncedRows = rows.map((row, idx) => {
    runningCumulative += row.optionsVested;
    const amounts = computeEntryAmounts(
      row.optionsVested,
      row.exercised,
      row.sharePrice,
      row.strikePrice,
      currency
    );

    if (row.exercised) {
      totalExercisedQty += amounts.exerciseQuantity;
      totalInvestedMinor += amounts.totalPriceMinor;
    }

    const nextPeriod = idx + 1;
    if (
      row.period !== nextPeriod ||
      row.cumulativeVested !== runningCumulative ||
      row.exerciseQuantity !== amounts.exerciseQuantity ||
      row.totalPriceMinor !== amounts.totalPriceMinor
    ) {
      return db
        .update(esopVestingEntries)
        .set({
          period: nextPeriod,
          cumulativeVested: runningCumulative,
          exerciseQuantity: amounts.exerciseQuantity,
          sharePrice: amounts.sharePrice,
          strikePrice: amounts.strikePrice,
          totalPrice: amounts.totalPrice,
          sharePriceMinor: amounts.sharePriceMinor,
          strikePriceMinor: amounts.strikePriceMinor,
          totalPriceMinor: amounts.totalPriceMinor,
        })
        .where(eq(esopVestingEntries.id, row.id))
        .returning()
        .get();
    }
    return row;
  });

  db.delete(investmentTransactions)
    .where(eq(investmentTransactions.holdingId, holdingId))
    .run();

  const fxRate = currency.toUpperCase() === "USD" ? usdInrRate : 1;
  for (const row of syncedRows) {
    if (!row.exercised || row.exerciseQuantity <= 0) continue;
    const perUnitCost = fromMinorUnits(
      row.sharePriceMinor + row.strikePriceMinor,
      currency
    );
    db.insert(investmentTransactions)
      .values({
        holdingId,
        date: row.vestingDate,
        type: "buy",
        amount: row.totalPrice,
        amountMinor: row.totalPriceMinor,
        currency,
        fxRate,
        navOrPrice: perUnitCost,
        units: row.exerciseQuantity,
        employerAmount: 0,
        employerMinor: 0,
        remarks: `Period ${row.period} exercised (${row.exerciseQuantity} × ($${row.sharePrice.toFixed(2)} + $${row.strikePrice.toFixed(2)}))`,
      })
      .run();
  }

  const totalInvested = fromMinorUnits(totalInvestedMinor, currency);
  const avgNav = totalExercisedQty > 0 ? totalInvested / totalExercisedQty : 0;

  const updatedHolding = db
    .update(investmentHoldings)
    .set({
      units: totalExercisedQty,
      investedAmount: totalInvested,
      investedMinor: totalInvestedMinor,
      avgNav,
      currentNav: 0,
      currentValue: 0,
      currentValueMinor: 0,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(investmentHoldings.id, holdingId))
    .returning()
    .get();

  return {
    holding: updatedHolding,
    entries: syncedRows,
    summary: buildSummary(syncedRows, usdInrRate, currency),
  };
}

function getEsopHoldingOrThrow(holdingId: number) {
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
  return holding;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const holding = getEsopHoldingOrThrow(Number(id));
    const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
    const entries = db
      .select()
      .from(esopVestingEntries)
      .where(eq(esopVestingEntries.holdingId, holding.id))
      .orderBy(
        asc(esopVestingEntries.period),
        asc(esopVestingEntries.vestingDate),
        asc(esopVestingEntries.id)
      )
      .all();

    return NextResponse.json({
      holding,
      entries,
      summary: buildSummary(entries, usdInrRate, holding.currency),
      usdInrRate,
    });
  } catch (err) {
    return handleApiError(err, "investments.[id].esop.GET");
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
    const holding = getEsopHoldingOrThrow(Number(id));
    const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
    const parsed = createEsopScheduleSchema.parse(await req.json());

    const incoming = "entries" in parsed ? parsed.entries : [parsed];
    const replace = "entries" in parsed ? parsed.replace : false;

    const synced = sqlite.transaction(() => {
      if (replace) {
        db.delete(esopVestingEntries)
          .where(eq(esopVestingEntries.holdingId, holding.id))
          .run();
      }
      const existingCount = replace
        ? 0
        : db
            .select()
            .from(esopVestingEntries)
            .where(eq(esopVestingEntries.holdingId, holding.id))
            .all().length;

      for (let i = 0; i < incoming.length; i++) {
        const item = incoming[i];
        const amounts = computeEntryAmounts(
          item.optionsVested,
          item.exercised,
          item.sharePrice,
          item.strikePrice,
          holding.currency
        );
        db.insert(esopVestingEntries)
          .values({
            holdingId: holding.id,
            period: item.period ?? existingCount + i + 1,
            vestingDate: item.vestingDate,
            optionsVested: item.optionsVested,
            cumulativeVested: 0,
            exercised: item.exercised,
            exerciseQuantity: amounts.exerciseQuantity,
            sharePrice: amounts.sharePrice,
            strikePrice: amounts.strikePrice,
            totalPrice: amounts.totalPrice,
            sharePriceMinor: amounts.sharePriceMinor,
            strikePriceMinor: amounts.strikePriceMinor,
            totalPriceMinor: amounts.totalPriceMinor,
          })
          .run();
      }

      return syncEsopHoldingFromSchedule(
        holding.id,
        holding.currency,
        usdInrRate
      );
    })();

    return NextResponse.json(synced, { status: 201 });
  } catch (err) {
    return handleApiError(err, "investments.[id].esop.POST");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const { id } = await params;
    const holding = getEsopHoldingOrThrow(Number(id));
    const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
    const parsed = patchEsopEntrySchema.parse(await req.json());

    const existing = db
      .select()
      .from(esopVestingEntries)
      .where(
        and(
          eq(esopVestingEntries.id, parsed.entryId),
          eq(esopVestingEntries.holdingId, holding.id)
        )
      )
      .get();
    if (!existing) {
      throw new AppError("ESOP vesting entry not found", 404, "NOT_FOUND");
    }

    const synced = sqlite.transaction(() => {
      const nextVested = parsed.optionsVested ?? existing.optionsVested;
      const nextExercised = parsed.exercised ?? existing.exercised;
      const nextSharePrice = parsed.sharePrice ?? existing.sharePrice;
      const nextStrikePrice = parsed.strikePrice ?? existing.strikePrice;
      const amounts = computeEntryAmounts(
        nextVested,
        nextExercised,
        nextSharePrice,
        nextStrikePrice,
        holding.currency
      );

      db.update(esopVestingEntries)
        .set({
          vestingDate: parsed.vestingDate ?? existing.vestingDate,
          optionsVested: nextVested,
          exercised: nextExercised,
          exerciseQuantity: amounts.exerciseQuantity,
          sharePrice: amounts.sharePrice,
          strikePrice: amounts.strikePrice,
          totalPrice: amounts.totalPrice,
          sharePriceMinor: amounts.sharePriceMinor,
          strikePriceMinor: amounts.strikePriceMinor,
          totalPriceMinor: amounts.totalPriceMinor,
        })
        .where(eq(esopVestingEntries.id, existing.id))
        .run();

      return syncEsopHoldingFromSchedule(
        holding.id,
        holding.currency,
        usdInrRate
      );
    })();

    return NextResponse.json(synced);
  } catch (err) {
    return handleApiError(err, "investments.[id].esop.PATCH");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const { id } = await params;
    const holding = getEsopHoldingOrThrow(Number(id));
    const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
    const entryId = Number(req.nextUrl.searchParams.get("entryId"));
    if (!Number.isInteger(entryId) || entryId <= 0) {
      throw new AppError("Invalid entryId", 400, "INVALID_ID");
    }

    const synced = sqlite.transaction(() => {
      db.delete(esopVestingEntries)
        .where(
          and(
            eq(esopVestingEntries.id, entryId),
            eq(esopVestingEntries.holdingId, holding.id)
          )
        )
        .run();
      return syncEsopHoldingFromSchedule(
        holding.id,
        holding.currency,
        usdInrRate
      );
    })();

    return NextResponse.json(synced);
  } catch (err) {
    return handleApiError(err, "investments.[id].esop.DELETE");
  }
}
