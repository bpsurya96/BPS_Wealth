import { describe, expect, it } from "vitest";
import {
  convertMinorToInrMinor,
  fromMinorUnits,
  reduceCostBasisMinor,
  sumMinorUnits,
  toMinorUnits,
} from "@/lib/currency";
import {
  buildHoldingCashflowsNative,
  buildPortfolioCashflowsInr,
  calculateXIRR,
  holdingInrValues,
  normalizeAnnualInsurancePremium,
} from "@/lib/finance";

describe("Currency & Monetary Precision", () => {
  it("converts major decimals to exact minor units without float drift", () => {
    expect(toMinorUnits(1.005, "INR")).toBe(101);
    expect(toMinorUnits(1234.56, "INR")).toBe(123456);
    expect(toMinorUnits(-99.99, "USD")).toBe(-9999);
    expect(fromMinorUnits(123456, "INR")).toBe(1234.56);
  });

  it("sums minor units accurately without 0.1 + 0.2 float drift", () => {
    const sum = sumMinorUnits([toMinorUnits(0.1), toMinorUnits(0.2)]);
    expect(sum).toBe(30);
    expect(fromMinorUnits(sum)).toBe(0.3);
  });

  it("converts foreign currency minor units to INR minor units", () => {
    // $100.00 at 85.00 INR/USD = ₹8,500.00 (850000 paise)
    expect(convertMinorToInrMinor(10000, "USD", 85)).toBe(850000);
    expect(convertMinorToInrMinor(5000, "INR", 85)).toBe(5000);
  });

  it("reduces cost basis proportionally on partial and full sell", () => {
    // Invested ₹10,000 for 100 units; sell 25 units => ₹7,500 remaining basis
    expect(reduceCostBasisMinor(1000000, 100, 25)).toBe(750000);
    // Sell all 100 units => ₹0 remaining basis
    expect(reduceCostBasisMinor(1000000, 100, 100)).toBe(0);
  });
});

describe("XIRR Financial Calculations", () => {
  it("computes accurate XIRR for one-time investment", () => {
    const rate = calculateXIRR([
      { date: "2023-01-01", amount: -10000 },
      { date: "2024-01-01", amount: 11200 },
    ]);
    expect(rate).not.toBeNull();
    expect(Math.abs((rate ?? 0) - 0.12)).toBeLessThan(0.002);
  });

  it("computes accurate XIRR for monthly SIPs", () => {
    // 12 monthly SIPs of 1000 in 2024, valued at 13000 on 2025-01-01
    const cfs = [
      "2024-01-01",
      "2024-02-01",
      "2024-03-01",
      "2024-04-01",
      "2024-05-01",
      "2024-06-01",
      "2024-07-01",
      "2024-08-01",
      "2024-09-01",
      "2024-10-01",
      "2024-11-01",
      "2024-12-01",
    ].map((d) => ({ date: d, amount: -1000 }));
    cfs.push({ date: "2025-01-01", amount: 13000 });

    const rate = calculateXIRR(cfs);
    expect(rate).not.toBeNull();
    // Independently verified XIRR for 12 monthly 1000 outflows -> 13000 is ~15.8%
    expect(rate!).toBeGreaterThan(0.15);
    expect(rate!).toBeLessThan(0.17);
  });

  it("aggregates multiple contributions on the same date", () => {
    const rate = calculateXIRR([
      { date: "2023-01-01", amount: -5000 },
      { date: "2023-01-01", amount: -5000 },
      { date: "2024-01-01", amount: 11000 },
    ]);
    expect(rate).not.toBeNull();
    expect(Math.abs((rate ?? 0) - 0.1)).toBeLessThan(0.002);
  });

  it("handles partial redemption and dividend inflows", () => {
    const rate = calculateXIRR([
      { date: "2023-01-01", amount: -10000 },
      { date: "2023-07-01", amount: 2000 }, // partial sell or dividend
      { date: "2024-01-01", amount: 9500 }, // remaining value
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0.14);
  });

  it("handles complete redemption on closed holding without currentValue", () => {
    const cfs = buildHoldingCashflowsNative({
      holding: { units: 0, currentNav: 0, currentValue: 0, status: "closed" },
      transactions: [
        { date: "2023-01-01", type: "buy", amount: 10000 },
        { date: "2024-01-01", type: "sell", amount: 12500 },
      ],
    });
    const rate = calculateXIRR(cfs);
    expect(rate).not.toBeNull();
    expect(Math.abs((rate ?? 0) - 0.25)).toBeLessThan(0.002);
  });

  it("handles negative returns", () => {
    const rate = calculateXIRR([
      { date: "2023-01-01", amount: -10000 },
      { date: "2024-01-01", amount: 8000 },
    ]);
    expect(rate).not.toBeNull();
    expect(Math.abs((rate ?? 0) - -0.2)).toBeLessThan(0.002);
  });

  it("returns null for zero investment, one-sided, or missing valuation cashflows", () => {
    expect(calculateXIRR([])).toBeNull();
    expect(calculateXIRR([{ date: "2024-01-01", amount: -1000 }])).toBeNull();
    expect(
      calculateXIRR([
        { date: "2024-01-01", amount: -1000 },
        { date: "2024-06-01", amount: -1000 },
      ])
    ).toBeNull();
    expect(
      calculateXIRR([
        { date: "2024-01-01", amount: 0 },
        { date: "2025-01-01", amount: 0 },
      ])
    ).toBeNull();
  });

  it("uses historical transaction fxRate for past cashflows and current rate for valuation", () => {
    // Invested $1000 when USD/INR was 80 (₹80,000), valued 1 year later at $1000 when USD/INR is 88 (₹88,000) => +10% INR XIRR
    const cfs = buildPortfolioCashflowsInr({
      holdings: [
        {
          id: 1,
          currency: "USD",
          units: 10,
          currentNav: 100,
          currentValue: 1000,
          status: "active",
        },
      ],
      transactions: [
        {
          holdingId: 1,
          date: "2024-01-01",
          type: "buy",
          amount: 1000,
          currency: "USD",
          fxRate: 80,
        },
      ],
      currentUsdInrRate: 88,
      asOfDate: "2025-01-01",
    });

    const rate = calculateXIRR(cfs);
    expect(rate).not.toBeNull();
    expect(Math.abs((rate ?? 0) - 0.1)).toBeLessThan(0.002);
  });

  it("computes holding INR valuations correctly", () => {
    const vals = holdingInrValues(
      {
        currency: "USD",
        investedAmount: 1000,
        currentValue: 1200,
        units: 10,
        currentNav: 120,
        plannedSip: 100,
        status: "active",
      },
      85
    );
    expect(vals.investedInr).toBe(85000);
    expect(vals.currentInr).toBe(102000);
    expect(vals.gainInr).toBe(17000);
    expect(vals.plannedSipInr).toBe(8500);
  });
});

describe("Insurance Premium Normalization", () => {
  it("normalizes monthly and annual premiums to annual totals", () => {
    expect(normalizeAnnualInsurancePremium(2000, "monthly")).toBe(24000);
    expect(normalizeAnnualInsurancePremium(25000, "annual")).toBe(25000);
  });
});
