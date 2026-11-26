/**
 * Centralized money and currency utilities.
 * All monetary amounts in INR / USD are persisted and aggregated in integer minor units
 * (paise for INR, cents for USD) to avoid IEEE-754 floating-point drift.
 */

export type SupportedCurrency = "INR" | "USD" | "EUR" | "GBP" | "JPY";

const CURRENCY_DECIMALS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

export function getCurrencyDecimals(currency: string): number {
  return CURRENCY_DECIMALS[currency.toUpperCase()] ?? 2;
}

export function getCurrencyScale(currency: string): number {
  return 10 ** getCurrencyDecimals(currency);
}

/**
 * Converts a major-unit decimal (e.g. 1234.56) into integer minor units (123456)
 * using half-away-from-zero rounding to eliminate float representation noise.
 */
export function toMinorUnits(majorAmount: number, currency = "INR"): number {
  if (!Number.isFinite(majorAmount)) return 0;
  const scale = getCurrencyScale(currency);
  const sign = majorAmount < 0 ? -1 : 1;
  // Adding Number.EPSILON * abs fixes edge cases like 1.005 * 100 = 100.49999999999999
  const scaled = Math.abs(majorAmount) * scale + 1e-9;
  return sign * Math.round(scaled);
}

/**
 * Converts integer minor units back to major decimal amount.
 */
export function fromMinorUnits(minorUnits: number, currency = "INR"): number {
  if (!Number.isFinite(minorUnits)) return 0;
  const scale = getCurrencyScale(currency);
  return minorUnits / scale;
}

/**
 * Sums an array of minor-unit integers without floating-point drift.
 */
export function sumMinorUnits(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (Number.isFinite(v)) {
      total += Math.trunc(v);
    }
  }
  return total;
}

/**
 * Converts minor units from source currency to INR minor units using fxRate
 * (INR per 1 unit of source currency).
 */
export function convertMinorToInrMinor(
  minorAmount: number,
  currency: string,
  fxRate: number
): number {
  if (!Number.isFinite(minorAmount)) return 0;
  const upper = currency.toUpperCase();
  if (upper === "INR") return Math.round(minorAmount);
  if (!Number.isFinite(fxRate) || fxRate <= 0) return 0;
  const sourceScale = getCurrencyScale(upper);
  const inrScale = getCurrencyScale("INR");
  const major = minorAmount / sourceScale;
  return toMinorUnits(major * fxRate, "INR") * (inrScale / 100);
}

/**
 * Computes proportional cost basis reduction in minor units when selling units.
 * If all units (or more) are sold, remaining cost basis is 0.
 */
export function reduceCostBasisMinor(
  currentInvestedMinor: number,
  totalUnitsBefore: number,
  soldUnits: number
): number {
  if (currentInvestedMinor <= 0 || totalUnitsBefore <= 0 || soldUnits <= 0) {
    return Math.max(0, currentInvestedMinor);
  }
  if (soldUnits >= totalUnitsBefore - 1e-9) {
    return 0;
  }
  const remainingFraction = (totalUnitsBefore - soldUnits) / totalUnitsBefore;
  return Math.max(0, Math.round(currentInvestedMinor * remainingFraction));
}

export function roundNavOrRate(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + 1e-12) * factor) / factor;
}
