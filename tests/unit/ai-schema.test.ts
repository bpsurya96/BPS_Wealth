import { describe, expect, it } from "vitest";
import {
  aiExtractedIncomeSchema,
  aiExtractedInsuranceSchema,
  aiExtractedInvestmentSchema,
  aiExtractedLoanSchema,
} from "@/lib/validation";

describe("AI Extraction Schema Normalization", () => {
  it("normalizes formatted numbers, enum aliases, and nullish strings for investments", () => {
    const parsed = aiExtractedInvestmentSchema.parse({
      name: "Alpha Fund",
      assetClass: "Mutual Fund",
      date: "2025-01-15",
      amount: "₹12,500.50",
      navOrPrice: "125.40",
      units: "N/A",
      remarks: ["SIP", "Direct"],
    });
    expect(parsed.assetClass).toBe("mutual_fund");
    expect(parsed.amount).toBe(12500.5);
    expect(parsed.navOrPrice).toBe(125.4);
    expect(parsed.units).toBeNull();
    expect(parsed.remarks).toBe("SIP; Direct");
  });

  it("normalizes insurance frequency aliases and numeric coverAmount", () => {
    const parsed = aiExtractedInsuranceSchema.parse({
      name: "Shield Plan",
      policyType: "Term Insurance",
      premiumAmount: "Rs 15,000",
      premiumFrequency: "Yearly",
      coverAmount: 10000000,
    });
    expect(parsed.policyType).toBe("term");
    expect(parsed.premiumAmount).toBe(15000);
    expect(parsed.premiumFrequency).toBe("annual");
    expect(parsed.coverAmount).toBe("10000000");
  });

  it("normalizes income categories and loan percentages", () => {
    const inc = aiExtractedIncomeSchema.parse({
      source: "Unit Rent",
      category: "Rent",
      inhandAmount: "18,000",
    });
    expect(inc.category).toBe("rental");
    expect(inc.inhandAmount).toBe(18000);

    const loan = aiExtractedLoanSchema.parse({
      name: "Home Loan",
      interestRate: "8.75%",
      currentBalance: "5,00,000",
    });
    expect(loan.interestRate).toBe(8.75);
    expect(loan.currentBalance).toBe(500000);
  });
});
