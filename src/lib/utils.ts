import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number, decimals = 0): string {
  if (!Number.isFinite(amount)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatUSD(amount: number, decimals = 2): string {
  if (!Number.isFinite(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatCompactINR(amount: number): string {
  if (!Number.isFinite(amount)) return "₹0";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_00_00_000) {
    return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  }
  if (abs >= 1_00_000) {
    return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  }
  if (abs >= 1_000) {
    return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  }
  return formatINR(amount);
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(decimals)}%`;
}

export const ASSET_CLASS_LABELS: Record<string, string> = {
  mutual_fund: "Mutual Funds",
  etf_us: "US ETFs",
  etf_in: "India ETFs",
  stock: "Stocks",
  esop: "ESOP",
  ppf: "PPF",
  nps: "NPS",
  fd: "Fixed Deposit",
  rd: "Recurring Deposit",
  chit: "Chit Fund",
  gold_silver: "Gold & Silver",
  bond: "Bonds",
};
