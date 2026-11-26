export interface Cashflow {
  date: string; // YYYY-MM-DD
  amount: number; // Negative for investments/outflows, positive for current value/inflows
}

/**
 * Computes XIRR (annualized internal rate of return for irregular cashflows)
 * using Newton-Raphson with a bisection fallback for stability.
 */
export function calculateXIRR(cashflows: Cashflow[]): number | null {
  if (cashflows.length < 2) return null;

  const parsed = cashflows
    .map((cf) => ({
      time: new Date(cf.date).getTime(),
      amount: cf.amount,
    }))
    .filter((cf) => !Number.isNaN(cf.time) && Number.isFinite(cf.amount))
    .sort((a, b) => a.time - b.time);

  if (parsed.length < 2) return null;

  const hasPositive = parsed.some((p) => p.amount > 0);
  const hasNegative = parsed.some((p) => p.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const t0 = parsed[0].time;
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const years = parsed.map((p) => (p.time - t0) / MS_PER_YEAR);

  if (years[years.length - 1] < 1 / 365) return null;

  const npv = (rate: number): number => {
    let sum = 0;
    for (let i = 0; i < parsed.length; i++) {
      sum += parsed[i].amount / Math.pow(1 + rate, years[i]);
    }
    return sum;
  };

  const dNpv = (rate: number): number => {
    let sum = 0;
    for (let i = 0; i < parsed.length; i++) {
      if (years[i] === 0) continue;
      sum -=
        (years[i] * parsed[i].amount) / Math.pow(1 + rate, years[i] + 1);
    }
    return sum;
  };

  // Newton-Raphson
  let rate = 0.12;
  for (let iter = 0; iter < 50; iter++) {
    if (rate <= -0.999) break;
    const f = npv(rate);
    const df = dNpv(rate);
    if (Math.abs(f) < 1e-6) return rate;
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (!Number.isFinite(next) || next <= -0.999 || next > 100) break;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
  }

  // Bisection fallback
  let low = -0.95;
  let high = 5.0;
  let fLow = npv(low);
  let fHigh = npv(high);
  if (fLow * fHigh > 0) return null;

  for (let iter = 0; iter < 80; iter++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6 || (high - low) / 2 < 1e-7) {
      return mid;
    }
    if (fLow * fMid <= 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return null;
}

export function holdingInrValues(
  holding: {
    currency: string;
    investedAmount: number;
    currentValue: number;
    units: number;
    currentNav: number;
    plannedSip: number;
  },
  usdInrRate: number
) {
  const fx = holding.currency === "USD" ? usdInrRate : 1;
  const computedCurrent =
    holding.units > 0 && holding.currentNav > 0
      ? holding.units * holding.currentNav
      : holding.currentValue;
  const investedInr = holding.investedAmount * fx;
  const currentInr = computedCurrent * fx;
  const gainInr = currentInr - investedInr;
  const gainPct = investedInr > 0 ? gainInr / investedInr : 0;
  return {
    fx,
    investedInr,
    currentInr,
    gainInr,
    gainPct,
    plannedSipInr: holding.plannedSip * fx,
  };
}
