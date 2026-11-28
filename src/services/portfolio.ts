import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  assetRegister,
  documents,
  financialGoals,
  incomeEntries,
  insurancePolicies,
  investmentCategories,
  investmentHoldings,
  investmentTransactions,
  loans,
  netWorthSnapshots,
  rentalPayments,
  rentalProperties,
} from "@/db/schema";
import { getSetting } from "@/lib/auth";
import { convertMinorToInrMinor, fromMinorUnits, toMinorUnits } from "@/lib/currency";
import {
  buildHoldingCashflowsNative,
  buildPortfolioCashflowsInr,
  calculateXIRR,
  computeUpcomingMaturities,
  holdingInrValues,
  normalizeAnnualInsurancePremium,
} from "@/lib/finance";
import { ASSET_CLASS_LABELS } from "@/lib/utils";

export function getDashboardPortfolioData() {
  const usdInrRate = Number.parseFloat(getSetting("usd_inr_rate", "84.5"));
  const emergencyTarget = Number.parseFloat(
    getSetting("emergency_fund_target", "600000")
  );

  const holdings = db.select().from(investmentHoldings).all();
  const txns = db.select().from(investmentTransactions).all();
  const incomes = db
    .select()
    .from(incomeEntries)
    .orderBy(desc(incomeEntries.date))
    .all();
  const allLoans = db.select().from(loans).all();
  const policies = db.select().from(insurancePolicies).all();
  const assets = db.select().from(assetRegister).all();
  const snapshots = db
    .select()
    .from(netWorthSnapshots)
    .orderBy(asc(netWorthSnapshots.date))
    .all();
  const goals = db.select().from(financialGoals).all();
  const rentals = db.select().from(rentalProperties).all();
  const rentPays = db
    .select()
    .from(rentalPayments)
    .orderBy(desc(rentalPayments.billingMonth))
    .all();
  const categories = db.select().from(investmentCategories).all();
  const docs = db.select().from(documents).all();

  const categoryLabelMap = new Map(categories.map((c) => [c.slug, c.label]));
  const categoryColorMap = new Map(categories.map((c) => [c.slug, c.color]));

  let totalInvestedInrMinor = 0;
  let totalPortfolioInrMinor = 0;
  let totalGainInrMinor = 0;
  let totalPlannedSipInrMinor = 0;
  let emergencyInvestedInrMinor = 0;

  const allocationMap = new Map<string, number>();

  for (const h of holdings) {
    if (h.status === "closed") continue;
    const vals = holdingInrValues(h, usdInrRate);
    totalInvestedInrMinor += vals.investedInrMinor;
    totalPortfolioInrMinor += vals.currentInrMinor;
    totalGainInrMinor += toMinorUnits(vals.gainInr, "INR");
    totalPlannedSipInrMinor += vals.plannedSipInrMinor;

    if (h.isEmergencyFund || h.assetClass === "fd" || h.assetClass === "rd") {
      emergencyInvestedInrMinor += vals.currentInrMinor;
    }

    const label =
      categoryLabelMap.get(h.assetClass) ??
      ASSET_CLASS_LABELS[h.assetClass] ??
      h.assetClass;
    allocationMap.set(label, (allocationMap.get(label) ?? 0) + vals.currentInr);
  }

  const totalInvestedInr = fromMinorUnits(totalInvestedInrMinor, "INR");
  const totalPortfolioInr = fromMinorUnits(totalPortfolioInrMinor, "INR");
  const totalGainInr = fromMinorUnits(totalGainInrMinor, "INR");
  const totalPlannedSipInr = fromMinorUnits(totalPlannedSipInrMinor, "INR");
  const emergencyInvestedInr = fromMinorUnits(emergencyInvestedInrMinor, "INR");

  const allCashflows = buildPortfolioCashflowsInr({
    holdings,
    transactions: txns,
    currentUsdInrRate: usdInrRate,
  });
  const portfolioXirr = calculateXIRR(allCashflows);

  // Asset Register breakdown (separate from investment portfolio to prevent double-counting)
  let otherFinancialAssetsInrMinor = 0;
  let physicalAssetsInrMinor = 0;
  const enrichedAssets = assets.map((a) => {
    const valMinor = toMinorUnits(a.currentValue, a.currency);
    const inrMinor = convertMinorToInrMinor(valMinor, a.currency, usdInrRate);
    if (a.assetType.startsWith("financial_")) {
      otherFinancialAssetsInrMinor += inrMinor;
    } else {
      physicalAssetsInrMinor += inrMinor;
    }
    return {
      ...a,
      valueInr: fromMinorUnits(inrMinor, "INR"),
    };
  });

  const otherFinancialAssetsInr = fromMinorUnits(
    otherFinancialAssetsInrMinor,
    "INR"
  );
  const physicalAssetsInr = fromMinorUnits(physicalAssetsInrMinor, "INR");
  const totalAssetsInrMinor =
    totalPortfolioInrMinor + otherFinancialAssetsInrMinor + physicalAssetsInrMinor;
  const totalAssetsInr = fromMinorUnits(totalAssetsInrMinor, "INR");

  const totalLiabilitiesInrMinor = allLoans
    .filter((l) => l.status === "active")
    .reduce((sum, l) => sum + toMinorUnits(l.currentBalance, "INR"), 0);
  const totalLiabilitiesInr = fromMinorUnits(totalLiabilitiesInrMinor, "INR");
  const netWorthInr = fromMinorUnits(
    totalAssetsInrMinor - totalLiabilitiesInrMinor,
    "INR"
  );

  // Monthly income aggregation: strictly separate salary, rental, dividend, other.
  // Prevent double-counting: rental_payments is authoritative; income_entries with
  // category='rental' and rentalPaymentId != null are excluded.
  const monthlyIncomeMap = new Map<
    string,
    {
      month: string;
      salary: number;
      rental: number;
      dividend: number;
      other: number;
      total: number;
    }
  >();

  const ensureMonthEntry = (month: string) => {
    let entry = monthlyIncomeMap.get(month);
    if (!entry) {
      entry = {
        month,
        salary: 0,
        rental: 0,
        dividend: 0,
        other: 0,
        total: 0,
      };
      monthlyIncomeMap.set(month, entry);
    }
    return entry;
  };

  let salaryTotalMinor = 0;
  let dividendTotalMinor = 0;
  let otherIncomeTotalMinor = 0;
  let unlinkedRentalIncomeMinor = 0;

  for (const inc of incomes) {
    const entry = ensureMonthEntry(inc.month);
    const amtMinor = toMinorUnits(inc.inhandAmount, "INR");
    if (inc.category === "salary") {
      entry.salary += inc.inhandAmount;
      salaryTotalMinor += amtMinor;
    } else if (inc.category === "rental") {
      if (inc.rentalPaymentId == null) {
        entry.rental += inc.inhandAmount;
        unlinkedRentalIncomeMinor += amtMinor;
      }
    } else if (inc.category === "dividend") {
      entry.dividend += inc.inhandAmount;
      dividendTotalMinor += amtMinor;
    } else {
      entry.other += inc.inhandAmount;
      otherIncomeTotalMinor += amtMinor;
    }
    entry.total = entry.salary + entry.rental + entry.dividend + entry.other;
  }

  let rentalPaymentsTotalMinor = 0;
  for (const rp of rentPays) {
    const entry = ensureMonthEntry(rp.billingMonth);
    entry.rental += rp.rentAmount;
    entry.total = entry.salary + entry.rental + entry.dividend + entry.other;
    rentalPaymentsTotalMinor += toMinorUnits(rp.rentAmount, "INR");
  }

  const incomeChart = Array.from(monthlyIncomeMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  const allocationChart = Array.from(allocationMap.entries())
    .map(([name, value]) => ({
      name,
      value: Math.round(value),
      pct: totalPortfolioInr > 0 ? value / totalPortfolioInr : 0,
    }))
    .sort((a, b) => b.value - a.value);

  const expectedMonthlyRent = rentals
    .filter((r) => r.status === "occupied")
    .reduce((sum, r) => sum + r.monthlyRent, 0);

  const mainIncomeTotal = fromMinorUnits(salaryTotalMinor, "INR");
  const rentalIncomeTotal = fromMinorUnits(
    rentalPaymentsTotalMinor + unlinkedRentalIncomeMinor,
    "INR"
  );
  const dividendIncomeTotal = fromMinorUnits(dividendTotalMinor, "INR");
  const otherIncomeTotal = fromMinorUnits(otherIncomeTotalMinor, "INR");
  const passiveIncomeTotal =
    rentalIncomeTotal + dividendIncomeTotal + otherIncomeTotal;

  const policiesWithDocs = policies.map((p) => {
    const annualizedPremium = normalizeAnnualInsurancePremium(
      p.premiumAmount,
      p.premiumFrequency
    );
    return {
      ...p,
      annualizedPremium,
      docCount: docs.filter(
        (d) => d.entityType === "insurance" && d.entityId === p.id
      ).length,
    };
  });

  const totalAnnualInsurancePremiumInr = policiesWithDocs
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + p.annualizedPremium, 0);

  const categoryCards = categories
    .map((c) => {
      const catHoldings = holdings.filter(
        (h) => h.status !== "closed" && h.assetClass === c.slug
      );
      const total = catHoldings.reduce(
        (s, h) => s + holdingInrValues(h, usdInrRate).currentInr,
        0
      );
      return {
        slug: c.slug,
        label: c.label,
        color: categoryColorMap.get(c.slug) ?? c.color,
        count: catHoldings.length,
        totalInr: Math.round(total),
      };
    })
    .filter((c) => c.count > 0);

  // Per-holding summary for AI & analytics
  const txnsByHolding = new Map<number, typeof txns>();
  for (const t of txns) {
    const arr = txnsByHolding.get(t.holdingId) ?? [];
    arr.push(t);
    txnsByHolding.set(t.holdingId, arr);
  }
  const holdingsSummary = holdings
    .filter((h) => h.status !== "closed")
    .map((h) => {
      const vals = holdingInrValues(h, usdInrRate);
      const hTxns = txnsByHolding.get(h.id) ?? [];
      const hCfs = buildHoldingCashflowsNative({
        holding: h,
        transactions: hTxns,
      });
      return {
        name: h.name,
        assetClass: h.assetClass,
        investedInr: Math.round(vals.investedInr),
        currentInr: Math.round(vals.currentInr),
        plannedSipInr: Math.round(vals.plannedSipInr),
        xirr: calculateXIRR(hCfs),
      };
    });

  const { upcomingMaturities, nextFdMaturity } = computeUpcomingMaturities({
    holdings,
    usdInrRate,
  });

  return {
    usdInrRate,
    lastNavRefreshAt: getSetting("last_nav_refresh_at", ""),
    lastBackupAt: getSetting("last_backup_at", ""),
    nextFdMaturity,
    upcomingMaturities,
    metrics: {
      totalInvestedInr,
      totalPortfolioInr,
      otherFinancialAssetsInr,
      physicalAssetsInr,
      totalAssetsInr,
      totalGainInr,
      totalGainPct:
        totalInvestedInr > 0 ? totalGainInr / totalInvestedInr : 0,
      portfolioXirr,
      totalPlannedSipInr,
      totalLiabilitiesInr,
      netWorthInr,
      expectedMonthlyRent,
      mainIncomeTotal,
      rentalIncomeTotal,
      dividendIncomeTotal,
      otherIncomeTotal,
      passiveIncomeTotal,
      totalAnnualInsurancePremiumInr,
      emergencyInvestedInr,
      emergencyTargetInr: emergencyTarget,
      holdingsCount: holdings.length,
      activeLoansCount: allLoans.filter((l) => l.status === "active").length,
      policiesCount: policies.length,
    },
    allocationChart,
    categoryCards,
    holdingsSummary,
    assetsList: enrichedAssets,
    loansList: allLoans,
    policiesList: policiesWithDocs,
    incomeChart,
    snapshots,
    goals,
    recentIncomes: incomes.slice(0, 6),
  };
}
