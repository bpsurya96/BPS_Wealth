import {
  convertMinorToInrMinor,
  fromMinorUnits,
  reduceCostBasisMinor,
  roundNavOrRate,
  toMinorUnits,
} from "./currency";

export interface Cashflow {
  date: string; // YYYY-MM-DD
  amount: number; // Negative for investor outflows, positive for inflows/current value
}

const OUTFLOW_TYPES = new Set([
  "sip",
  "buy",
  "installment",
  "employer_contribution",
]);

const INFLOW_TYPES = new Set([
  "sell",
  "redemption",
  "withdrawal",
  "dividend",
  "interest_payout",
]);

/**
 * Classifies an investment transaction into a signed cashflow for XIRR.
 * Returns 0 for internal non-cash accruals (e.g. "interest" compounded into currentValue)
 * so they are neither counted as investor out-of-pocket contributions nor withdrawals.
 */
export function signedCashflowAmount(
  type: string,
  absAmount: number
): number {
  if (!Number.isFinite(absAmount) || absAmount <= 0) return 0;
  const normalized = type.toLowerCase();
  if (INFLOW_TYPES.has(normalized)) {
    return Math.abs(absAmount);
  }
  if (OUTFLOW_TYPES.has(normalized)) {
    return -Math.abs(absAmount);
  }
  // "interest" accrual does not represent an external cashflow
  return 0;
}

/**
 * Computes XIRR (annualized internal rate of return for irregular cashflows)
 * using Newton-Raphson with adaptive bracketing + bisection fallback.
 * Aggregates same-date cashflows prior to solving for numerical stability.
 */
export function calculateXIRR(cashflows: Cashflow[]): number | null {
  if (cashflows.length < 2) return null;

  const byDate = new Map<number, number>();
  for (const cf of cashflows) {
    if (!cf.date || !/^\d{4}-\d{2}-\d{2}$/.test(cf.date)) continue;
    const t = Date.parse(`${cf.date}T00:00:00Z`);
    if (Number.isNaN(t) || !Number.isFinite(cf.amount) || cf.amount === 0) {
      continue;
    }
    byDate.set(t, (byDate.get(t) ?? 0) + cf.amount);
  }

  const parsed = Array.from(byDate.entries())
    .filter(([, amount]) => Math.abs(amount) > 1e-9)
    .map(([time, amount]) => ({ time, amount }))
    .sort((a, b) => a.time - b.time);

  if (parsed.length < 2) return null;

  const hasPositive = parsed.some((p) => p.amount > 0);
  const hasNegative = parsed.some((p) => p.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const t0 = parsed[0].time;
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  const years = parsed.map((p) => (p.time - t0) / MS_PER_YEAR);

  // Cannot meaningfully annualize cashflows spanning less than 1 day
  if (years[years.length - 1] < 1 / 365.25) return null;

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

  // Try Newton-Raphson from a few sensible guesses
  for (const initialGuess of [0.12, 0.0, 0.5, -0.3]) {
    let rate = initialGuess;
    for (let iter = 0; iter < 60; iter++) {
      if (rate <= -0.9999 || rate > 1000) break;
      const f = npv(rate);
      const df = dNpv(rate);
      if (Math.abs(f) < 1e-6) return rate;
      if (Math.abs(df) < 1e-12) break;
      const next = rate - f / df;
      if (!Number.isFinite(next) || next <= -0.9999 || next > 1000) break;
      if (Math.abs(next - rate) < 1e-8 && Math.abs(npv(next)) < 1e-3) {
        return next;
      }
      rate = next;
    }
  }

  // Bisection fallback across progressive brackets
  const brackets: Array<[number, number]> = [
    [-0.95, 5.0],
    [-0.999, 25.0],
    [-0.9999, 100.0],
  ];

  for (const [initLow, initHigh] of brackets) {
    let low = initLow;
    let high = initHigh;
    let fLow = npv(low);
    const fHigh = npv(high);
    if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) continue;
    if (fLow * fHigh > 0) continue;

    for (let iter = 0; iter < 100; iter++) {
      const mid = (low + high) / 2;
      const fMid = npv(mid);
      if (Math.abs(fMid) < 1e-6 || (high - low) / 2 < 1e-8) {
        return mid;
      }
      if (fLow * fMid <= 0) {
        high = mid;
      } else {
        low = mid;
        fLow = fMid;
      }
    }
  }

  return null;
}

export function holdingCurrentNative(holding: {
  units: number;
  currentNav: number;
  currentValue: number;
  status?: string;
}): number {
  if (holding.status === "closed") return 0;
  if (holding.units > 0 && holding.currentNav > 0) {
    return holding.units * holding.currentNav;
  }
  return Math.max(0, holding.currentValue);
}

export function holdingInrValues(
  holding: {
    assetClass?: string;
    currency: string;
    investedAmount: number;
    currentValue: number;
    units: number;
    currentNav: number;
    plannedSip: number;
    status?: string;
  },
  usdInrRate: number
) {
  const fx = holding.currency.toUpperCase() === "USD" ? usdInrRate : 1;
  const computedCurrent = holdingCurrentNative(holding);

  const investedMinor = toMinorUnits(holding.investedAmount, holding.currency);
  const currentMinor = toMinorUnits(computedCurrent, holding.currency);
  const sipMinor = toMinorUnits(holding.plannedSip, holding.currency);

  const investedInrMinor = convertMinorToInrMinor(
    investedMinor,
    holding.currency,
    usdInrRate
  );
  const currentInrMinor = convertMinorToInrMinor(
    currentMinor,
    holding.currency,
    usdInrRate
  );
  const plannedSipInrMinor = convertMinorToInrMinor(
    sipMinor,
    holding.currency,
    usdInrRate
  );

  const investedInr = fromMinorUnits(investedInrMinor, "INR");
  const currentInr = fromMinorUnits(currentInrMinor, "INR");
  // Unpriced ESOPs keep current value and profit at 0 while showing total invested.
  const isUnpricedEsop = holding.assetClass === "esop" && currentInrMinor === 0;
  const gainInr = isUnpricedEsop
    ? 0
    : fromMinorUnits(currentInrMinor - investedInrMinor, "INR");
  const gainPct = isUnpricedEsop || investedInr <= 0 ? 0 : gainInr / investedInr;

  return {
    fx: roundNavOrRate(fx, 4),
    investedInr,
    currentInr,
    gainInr,
    gainPct,
    plannedSipInr: fromMinorUnits(plannedSipInrMinor, "INR"),
    investedInrMinor,
    currentInrMinor,
    plannedSipInrMinor,
  };
}

/**
 * Builds cashflows in INR for a set of holdings and transactions.
 * Historical foreign-currency transactions use their recorded fxRate (falling back
 * to currentUsdInrRate only if historical fxRate is missing/zero).
 * Current terminal valuation uses today's currentUsdInrRate.
 */
export function buildPortfolioCashflowsInr(params: {
  holdings: Array<{
    id: number;
    currency: string;
    units: number;
    currentNav: number;
    currentValue: number;
    status: string;
  }>;
  transactions: Array<{
    holdingId: number;
    date: string;
    type: string;
    amount: number;
    currency: string;
    fxRate: number;
  }>;
  currentUsdInrRate: number;
  asOfDate?: string;
}): Cashflow[] {
  const { holdings, transactions, currentUsdInrRate } = params;
  const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);
  const cashflows: Cashflow[] = [];

  for (const t of transactions) {
    const signedNative = signedCashflowAmount(t.type, Math.abs(t.amount));
    if (signedNative === 0) continue;
    const isForeign = t.currency.toUpperCase() !== "INR";
    const txFx =
      isForeign ? (t.fxRate > 0 ? t.fxRate : currentUsdInrRate) : 1;
    cashflows.push({
      date: t.date,
      amount: signedNative * txFx,
    });
  }

  let totalActiveCurrentInr = 0;
  for (const h of holdings) {
    if (h.status === "closed") continue;
    const nativeVal = holdingCurrentNative(h);
    if (nativeVal <= 0) continue;
    const fx = h.currency.toUpperCase() === "USD" ? currentUsdInrRate : 1;
    totalActiveCurrentInr += nativeVal * fx;
  }

  if (totalActiveCurrentInr > 0 && cashflows.length > 0) {
    cashflows.push({
      date: asOfDate,
      amount: totalActiveCurrentInr,
    });
  }

  return cashflows;
}

/**
 * Builds native-currency cashflows for a single holding.
 */
export function buildHoldingCashflowsNative(params: {
  holding: {
    units: number;
    currentNav: number;
    currentValue: number;
    status: string;
  };
  transactions: Array<{
    date: string;
    type: string;
    amount: number;
  }>;
  asOfDate?: string;
}): Cashflow[] {
  const { holding, transactions } = params;
  const asOfDate = params.asOfDate || new Date().toISOString().slice(0, 10);
  const cfs: Cashflow[] = [];

  for (const t of transactions) {
    const signed = signedCashflowAmount(t.type, Math.abs(t.amount));
    if (signed !== 0) {
      cfs.push({ date: t.date, amount: signed });
    }
  }

  const currentNative = holdingCurrentNative(holding);
  if (holding.status !== "closed" && currentNative > 0 && cfs.length > 0) {
    cfs.push({
      date: asOfDate,
      amount: currentNative,
    });
  }

  return cfs;
}

export function normalizeAnnualInsurancePremium(
  premiumAmount: number,
  frequency: string
): number {
  if (!Number.isFinite(premiumAmount) || premiumAmount < 0) return 0;
  return frequency.toLowerCase() === "monthly"
    ? premiumAmount * 12
    : premiumAmount;
}

export function computeHoldingSummaryFromTransactions(params: {
  currency: string;
  existingCurrentNav?: number;
  transactions: Array<{
    id?: number;
    date: string;
    type: string;
    amount: number;
    navOrPrice: number;
    units: number;
  }>;
}) {
  const sorted = [...params.transactions].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  let units = 0;
  let investedMinor = 0;
  let interestMinor = 0;
  let latestNav = 0;

  for (const t of sorted) {
    const type = t.type.toLowerCase();
    const amtMinor = toMinorUnits(Math.abs(t.amount), params.currency);
    const txUnits =
      t.units > 0
        ? t.units
        : t.navOrPrice > 0 && type !== "dividend" && type !== "interest_payout"
          ? Math.abs(t.amount) / t.navOrPrice
          : 0;

    if (t.navOrPrice > 0) {
      latestNav = t.navOrPrice;
    }

    if (type === "sell" || type === "redemption" || type === "withdrawal") {
      if (units > 0 && txUnits > 0) {
        investedMinor = reduceCostBasisMinor(investedMinor, units, txUnits);
      } else {
        investedMinor = Math.max(0, investedMinor - amtMinor);
      }
      units = Math.max(0, units - txUnits);
    } else if (type === "interest") {
      interestMinor += amtMinor;
    } else if (type === "dividend" || type === "interest_payout") {
      // Cash payout: does not alter units or contributed cost basis
    } else {
      // sip | buy | installment | employer_contribution
      units += txUnits;
      investedMinor += amtMinor;
    }
  }

  const investedAmount = fromMinorUnits(investedMinor, params.currency);
  const avgNav = units > 0 ? investedAmount / units : 0;
  const currentNav =
    params.existingCurrentNav && params.existingCurrentNav > 0
      ? params.existingCurrentNav
      : latestNav;
  const currentValue =
    units > 0 && currentNav > 0
      ? units * currentNav
      : fromMinorUnits(investedMinor + interestMinor, params.currency);
  const currentValueMinor = toMinorUnits(currentValue, params.currency);

  return {
    units,
    investedAmount,
    investedMinor,
    avgNav,
    currentNav,
    currentValue,
    currentValueMinor,
  };
}

export interface UpcomingMaturityItem {
  id: number;
  name: string;
  assetClass: string;
  platform: string;
  maturityDate: string;
  interestRate: number;
  investedInr: number;
  currentInr: number;
  isEmergencyFund: boolean;
  daysRemaining: number;
}

function parseIsoDayUtcMs(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Returns active holdings with valid ISO maturity dates ordered chronologically,
 * along with the first upcoming FD maturity (`nextFdMaturity`).
 */
export function computeUpcomingMaturities(params: {
  holdings: Array<{
    id: number;
    name: string;
    assetClass: string;
    platform?: string | null;
    maturityDate?: string | null;
    interestRate?: number | null;
    currency: string;
    investedAmount: number;
    currentValue: number;
    investedMinor?: number | null;
    currentValueMinor?: number | null;
    units: number;
    currentNav: number;
    plannedSip?: number | null;
    isEmergencyFund?: boolean | null;
    status: string;
  }>;
  usdInrRate: number;
  referenceDate?: string; // YYYY-MM-DD, defaults to today UTC
}): {
  upcomingMaturities: UpcomingMaturityItem[];
  nextFdMaturity: UpcomingMaturityItem | null;
} {
  const todayStr = params.referenceDate || new Date().toISOString().slice(0, 10);
  const todayMs = parseIsoDayUtcMs(todayStr) ?? Date.now();
  const MS_PER_DAY = 86_400_000;

  const items: UpcomingMaturityItem[] = [];
  for (const h of params.holdings) {
    if (h.status !== "active") continue;
    const matDate = (h.maturityDate ?? "").trim();
    const matMs = parseIsoDayUtcMs(matDate);
    if (matMs === null) continue;

    const daysRemaining = Math.round((matMs - todayMs) / MS_PER_DAY);
    const vals = holdingInrValues(
      { ...h, plannedSip: h.plannedSip ?? 0 },
      params.usdInrRate
    );
    items.push({
      id: h.id,
      name: h.name,
      assetClass: h.assetClass,
      platform: h.platform ?? "",
      maturityDate: matDate,
      interestRate: h.interestRate ?? 0,
      investedInr: Math.round(vals.investedInr),
      currentInr: Math.round(vals.currentInr),
      isEmergencyFund: Boolean(h.isEmergencyFund),
      daysRemaining,
    });
  }

  items.sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  const fdItems = items.filter((i) => i.assetClass === "fd");
  const nextFdMaturity =
    fdItems.find((i) => i.daysRemaining >= 0) ?? fdItems[0] ?? null;

  return {
    upcomingMaturities: items,
    nextFdMaturity,
  };
}
