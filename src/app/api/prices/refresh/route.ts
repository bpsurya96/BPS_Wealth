import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentHoldings } from "@/db/schema";
import { requireAdminSession, setSetting } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { toMinorUnits } from "@/lib/currency";
import { handleApiError } from "@/lib/errors";
import {
  fetchMutualFundNav,
  fetchUsdInrRate,
  fetchYahooPrice,
} from "@/lib/market-data";

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const holdings = db.select().from(investmentHoldings).all();
    let updatedCount = 0;
    const errors: string[] = [];

    const fx = await fetchUsdInrRate();
    if (fx && fx > 0) {
      setSetting("usd_inr_rate", fx.toFixed(2));
    }

    await Promise.all(
      holdings.map(async (h) => {
        if (h.status !== "active") return;
        let res = null;
        if (h.schemeCode) {
          res = await fetchMutualFundNav(h.schemeCode);
        } else if (h.ticker) {
          res = await fetchYahooPrice(h.ticker);
        }
        if (!res) {
          if (h.schemeCode || h.ticker) errors.push(h.name);
          return;
        }

        const newCurrent =
          h.units > 0 ? h.units * res.price : h.currentValue;
        db.update(investmentHoldings)
          .set({
            currentNav: res.price,
            currentValue: newCurrent,
            currentValueMinor: toMinorUnits(newCurrent, h.currency),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(investmentHoldings.id, h.id))
          .run();
        updatedCount++;
      })
    );

    const now = new Date().toISOString();
    setSetting("last_nav_refresh_at", now);

    return NextResponse.json({
      updatedCount,
      usdInrRate: fx,
      errors,
      refreshedAt: now,
    });
  } catch (err) {
    return handleApiError(err, "prices.refresh.POST");
  }
}
