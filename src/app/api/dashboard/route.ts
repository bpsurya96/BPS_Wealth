import { NextResponse } from "next/server";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import {
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
import { getSetting, requireUnlocked } from "@/lib/auth";
import { calculateXIRR, holdingInrValues } from "@/lib/finance";
import { ASSET_CLASS_LABELS } from "@/lib/utils";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

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
  const activeLoans = db.select().from(loans).all();
  const policies = db.select().from(insurancePolicies).all();
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

  let totalInvestedInr = 0;
  let totalPortfolioInr = 0;
  let totalPlannedSipInr = 0;
  let emergencyInvestedInr = 0;

  const allocationMap = new Map<string, number>();
  const allCashflows: Array<{ date: string; amount: number }> = [];

  for (const h of holdings) {
    if (h.status === "closed") continue;
    const vals = holdingInrValues(h, usdInrRate);
    totalInvestedInr += vals.investedInr;
    totalPortfolioInr += vals.currentInr;
    totalPlannedSipInr += vals.plannedSipInr;

    if (h.isEmergencyFund || h.assetClass === "fd" || h.assetClass === "rd") {
      emergencyInvestedInr += vals.currentInr;
    }

    const label =
      categoryLabelMap.get(h.assetClass) ??
      ASSET_CLASS_LABELS[h.assetClass] ??
      h.assetClass;
    allocationMap.set(label, (allocationMap.get(label) ?? 0) + vals.currentInr);
  }

  for (const t of txns) {
    const fx = t.currency === "USD" ? usdInrRate : 1;
    if (t.type === "sell" || t.type === "dividend") {
      allCashflows.push({ date: t.date, amount: Math.abs(t.amount) * fx });
    } else {
      allCashflows.push({ date: t.date, amount: -Math.abs(t.amount) * fx });
    }
  }
  if (totalPortfolioInr > 0 && allCashflows.length > 0) {
    allCashflows.push({
      date: new Date().toISOString().slice(0, 10),
      amount: totalPortfolioInr,
    });
  }

  const portfolioXirr = calculateXIRR(allCashflows);
  const totalLiabilitiesInr = activeLoans
    .filter((l) => l.status === "active")
    .reduce((sum, l) => sum + l.currentBalance, 0);
  const netWorthInr = totalPortfolioInr - totalLiabilitiesInr;

  // Monthly income aggregation (Salary + Rental)
  const monthlyIncomeMap = new Map<
    string,
    { month: string; salary: number; rental: number; total: number }
  >();
  for (const inc of incomes) {
    const entry = monthlyIncomeMap.get(inc.month) ?? {
      month: inc.month,
      salary: 0,
      rental: 0,
      total: 0,
    };
    if (inc.category === "rental") entry.rental += inc.inhandAmount;
    else entry.salary += inc.inhandAmount;
    entry.total = entry.salary + entry.rental;
    monthlyIncomeMap.set(inc.month, entry);
  }
  for (const rp of rentPays) {
    const entry = monthlyIncomeMap.get(rp.billingMonth) ?? {
      month: rp.billingMonth,
      salary: 0,
      rental: 0,
      total: 0,
    };
    entry.rental += rp.rentAmount;
    entry.total = entry.salary + entry.rental;
    monthlyIncomeMap.set(rp.billingMonth, entry);
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

  const mainIncomeTotal = incomes
    .filter((i) => i.category === "salary")
    .reduce((sum, i) => sum + i.inhandAmount, 0);
  const passiveIncomeTotal =
    incomes
      .filter((i) => i.category !== "salary")
      .reduce((sum, i) => sum + i.inhandAmount, 0) +
    rentPays.reduce((sum, rp) => sum + rp.rentAmount, 0);

  const policiesWithDocs = policies.map((p) => ({
    ...p,
    docCount: docs.filter(
      (d) => d.entityType === "insurance" && d.entityId === p.id
    ).length,
  }));

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

  return NextResponse.json({
    usdInrRate,
    lastNavRefreshAt: getSetting("last_nav_refresh_at", ""),
    lastBackupAt: getSetting("last_backup_at", ""),
    metrics: {
      totalInvestedInr,
      totalPortfolioInr,
      totalGainInr: totalPortfolioInr - totalInvestedInr,
      totalGainPct:
        totalInvestedInr > 0
          ? (totalPortfolioInr - totalInvestedInr) / totalInvestedInr
          : 0,
      portfolioXirr,
      totalPlannedSipInr,
      totalLiabilitiesInr,
      netWorthInr,
      expectedMonthlyRent,
      mainIncomeTotal,
      passiveIncomeTotal,
      emergencyInvestedInr,
      emergencyTargetInr: emergencyTarget,
      holdingsCount: holdings.length,
      activeLoansCount: activeLoans.filter((l) => l.status === "active").length,
      policiesCount: policies.length,
    },
    allocationChart,
    categoryCards,
    loansList: activeLoans,
    policiesList: policiesWithDocs,
    incomeChart,
    snapshots,
    goals,
    recentIncomes: incomes.slice(0, 6),
  });
}
