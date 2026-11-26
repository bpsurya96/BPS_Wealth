export interface NavResult {
  price: number;
  date: string;
  source: string;
}

export const KNOWN_AMFI_SCHEMES: Array<{
  match: RegExp;
  schemeCode: string;
  label: string;
}> = [
  {
    match: /quant\s*small\s*cap/i,
    schemeCode: "120828",
    label: "Quant Small Cap Fund - Direct Plan - Growth",
  },
  {
    match: /hdfc\s*mid\s*cap/i,
    schemeCode: "118989",
    label: "HDFC Mid-Cap Opportunities Fund - Direct Plan - Growth",
  },
  {
    match: /uti\s*nifty\s*200\s*momentum|nifty200\s*momentum/i,
    schemeCode: "148706",
    label: "UTI Nifty200 Momentum 30 Index Fund - Direct Plan - Growth",
  },
  {
    match: /kotak\s*arbit/i,
    schemeCode: "119771",
    label: "Kotak Equity Arbitrage Fund - Direct Plan - Growth",
  },
  {
    match: /icici.*nifty\s*next\s*50|nifty\s*next\s*50/i,
    schemeCode: "120684",
    label: "ICICI Prudential Nifty Next 50 Index Fund - Direct Plan - Growth",
  },
  {
    match: /parag\s*parikh|paragh/i,
    schemeCode: "122639",
    label: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
  },
];

export const KNOWN_TICKERS: Array<{ match: RegExp; ticker: string }> = [
  { match: /vanguard\s*s&p\s*500|voo/i, ticker: "VOO" },
  { match: /vanguard\s*ftse\s*developed|vea/i, ticker: "VEA" },
  { match: /invesco\s*qqq|qqq/i, ticker: "QQQ" },
  { match: /gold\s*bees/i, ticker: "GOLDBEES.NS" },
];

export function guessSchemeOrTicker(name: string): {
  schemeCode: string;
  ticker: string;
} {
  const mf = KNOWN_AMFI_SCHEMES.find((s) => s.match.test(name));
  const tk = KNOWN_TICKERS.find((t) => t.match.test(name));
  return {
    schemeCode: mf?.schemeCode ?? "",
    ticker: tk?.ticker ?? "",
  };
}

export async function fetchMutualFundNav(
  schemeCode: string
): Promise<NavResult | null> {
  if (!schemeCode) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}/latest`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const latest = json?.data?.[0];
    if (!latest?.nav) return null;
    const price = Number.parseFloat(latest.nav);
    if (!Number.isFinite(price)) return null;
    return {
      price,
      date: latest.date ?? new Date().toISOString().slice(0, 10),
      source: "MFAPI.in",
    };
  } catch {
    return null;
  }
}

export async function fetchYahooPrice(
  ticker: string
): Promise<NavResult | null> {
  if (!ticker) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?interval=1d&range=5d`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    const ts = meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return {
      price,
      date: ts,
      source: "Yahoo Finance",
    };
  } catch {
    return null;
  }
}

export async function fetchUsdInrRate(): Promise<number | null> {
  const res = await fetchYahooPrice("USDINR=X");
  return res?.price ?? null;
}
