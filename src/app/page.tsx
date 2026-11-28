"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  DatabaseBackup,
  TrendingUp,
  Wallet,
  Target,
  FileSpreadsheet,
  Zap,
  Landmark,
  Shield,
  ArrowUpRight,
  FileCheck2,
  Plus,
  Trash2,
  X,
  BellRing,
  CalendarClock,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactINR, formatINR, formatPercent } from "@/lib/utils";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface MaturityItem {
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

interface DashboardData {
  usdInrRate: number;
  lastNavRefreshAt: string;
  lastBackupAt: string;
  nextFdMaturity: MaturityItem | null;
  upcomingMaturities: MaturityItem[];
  metrics: {
    totalInvestedInr: number;
    totalPortfolioInr: number;
    otherFinancialAssetsInr: number;
    physicalAssetsInr: number;
    totalAssetsInr: number;
    totalGainInr: number;
    totalGainPct: number;
    portfolioXirr: number | null;
    totalPlannedSipInr: number;
    totalLiabilitiesInr: number;
    netWorthInr: number;
    expectedMonthlyRent: number;
    mainIncomeTotal: number;
    rentalIncomeTotal: number;
    dividendIncomeTotal: number;
    otherIncomeTotal: number;
    passiveIncomeTotal: number;
    totalAnnualInsurancePremiumInr: number;
    emergencyInvestedInr: number;
    emergencyTargetInr: number;
    holdingsCount: number;
    activeLoansCount: number;
    policiesCount: number;
  };
  allocationChart: Array<{ name: string; value: number; pct: number }>;
  categoryCards: Array<{
    slug: string;
    label: string;
    color: string;
    count: number;
    totalInr: number;
  }>;
  assetsList: Array<{
    id: number;
    name: string;
    assetType: string;
    currency: string;
    currentValue: number;
    valueInr: number;
    isEstimated: boolean;
  }>;
  loansList: Array<{
    id: number;
    name: string;
    lender: string;
    currentBalance: number;
    emiAmount: number;
    status: string;
  }>;
  policiesList: Array<{
    id: number;
    name: string;
    policyType: string;
    premiumAmount: number;
    premiumFrequency: string;
    annualizedPremium: number;
    coverAmount: string;
    docCount: number;
  }>;
  incomeChart: Array<{
    month: string;
    salary: number;
    rental: number;
    dividend: number;
    other: number;
    total: number;
  }>;
  snapshots: Array<{
    id: number;
    date: string;
    totalAssets: number;
    totalLiabilities: number | null;
    liabilitiesKnown: boolean;
    netWorth: number | null;
  }>;
  goals: Array<{
    id: number;
    name: string;
    category: string;
    targetAmount: number;
    currentAmount: number;
    notes: string;
  }>;
}

const COLORS = [
  "#6366f1",
  "#10b981",
  "#0ea5e9",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#8b5cf6",
  "#64748b",
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [toast, setToast] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<number | null>(null);
  const [assetForm, setAssetForm] = useState({
    name: "",
    assetType: "financial_cash",
    currency: "INR",
    currentValue: "",
    isEstimated: false,
    notes: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) {
        setData(await res.json());
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || "Failed to load dashboard");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshPrices() {
    setRefreshing(true);
    setToast("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/prices/refresh", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Price refresh failed");
      } else {
        setToast(
          `Updated ${json.updatedCount ?? 0} live prices${
            json.usdInrRate ? ` (USD/INR: ₹${json.usdInrRate})` : ""
          }`
        );
        await load();
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function triggerBackup() {
    setBackingUp(true);
    setToast("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Backup failed");
      } else if (json.backup?.filename) {
        setToast(`Saved & verified backup: ${json.backup.filename}`);
        await load();
      }
    } finally {
      setBackingUp(false);
    }
  }

  async function createAsset(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...assetForm,
        currentValue: Number(assetForm.currentValue || 0),
      }),
    });
    if (res.ok) {
      setShowAssetModal(false);
      setAssetForm({
        name: "",
        assetType: "financial_cash",
        currency: "INR",
        currentValue: "",
        isEstimated: false,
        notes: "",
      });
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Failed to save asset");
    }
  }

  async function deleteAsset(id: number) {
    await fetch(`/api/assets?id=${id}`, { method: "DELETE" });
    setAssetToDelete(null);
    await load();
  }

  if (loading || !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-36 bg-slate-200 rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 bg-white rounded-2xl border border-slate-200"
            />
          ))}
        </div>
      </div>
    );
  }

  const m = data.metrics;
  const emergencyPct =
    m.emergencyTargetInr > 0
      ? Math.min(1, m.emergencyInvestedInr / m.emergencyTargetInr)
      : 0;
  const isEmpty = m.holdingsCount === 0 && data.incomeChart.length === 0;
  const timelineChartData = data.snapshots.map((s) => ({
    ...s,
    displayValue: s.netWorth !== null ? s.netWorth : s.totalAssets,
  }));

  return (
    <div className="space-y-6">
      {/* Net Worth Hero Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#064E3B] text-white p-6 sm:p-7 shadow-lg border border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <TrendingUp className="h-3.5 w-3.5" />
              Personal Net Worth Overview • USD/INR ₹{data.usdInrRate.toFixed(2)}
            </div>
            <div className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
              {formatINR(m.netWorthInr)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm text-slate-300 tabular-nums">
              <span>
                Investment Portfolio:{" "}
                <strong className="text-white">
                  {formatCompactINR(m.totalPortfolioInr)}
                </strong>
              </span>
              {(m.otherFinancialAssetsInr > 0 || m.physicalAssetsInr > 0) && (
                <span>
                  Other/Physical Assets:{" "}
                  <strong className="text-white">
                    {formatCompactINR(
                      m.otherFinancialAssetsInr + m.physicalAssetsInr
                    )}
                  </strong>
                </span>
              )}
              <span>
                Portfolio Gain:{" "}
                <strong
                  className={
                    m.totalGainInr >= 0 ? "text-emerald-300" : "text-rose-300"
                  }
                >
                  {m.totalGainInr >= 0 ? "+" : ""}
                  {formatCompactINR(m.totalGainInr)} (
                  {formatPercent(m.totalGainPct)})
                </strong>
              </span>
              {m.portfolioXirr !== null && (
                <span>
                  Portfolio XIRR:{" "}
                  <strong className="text-cyan-300">
                    {formatPercent(m.portfolioXirr)}
                  </strong>
                </span>
              )}
              <span>
                Liabilities:{" "}
                <strong className="text-rose-300">
                  {formatCompactINR(m.totalLiabilitiesInr)}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/quick-log"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2.5 text-sm transition shadow-sm"
            >
              <Zap className="h-4 w-4" />
              Quick-Log Month
            </Link>
            <button
              type="button"
              onClick={() => setShowAssetModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white px-3.5 py-2.5 text-sm font-medium transition"
            >
              <Plus className="h-4 w-4" />
              Add Asset
            </button>
            <button
              type="button"
              onClick={refreshPrices}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white px-3.5 py-2.5 text-sm font-medium transition disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Refreshing..." : "Live NAVs"}
            </button>
            <button
              type="button"
              onClick={triggerBackup}
              disabled={backingUp}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white px-3.5 py-2.5 text-sm font-medium transition disabled:opacity-50"
            >
              <DatabaseBackup className="h-4 w-4" />
              Backup
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      <AiInsightBanner scope="overview" onAskAi={() => setAiOpen(true)} />

      {data.nextFdMaturity && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs ${
            data.nextFdMaturity.daysRemaining <= 30
              ? "border-amber-300 bg-amber-50/90 text-amber-950"
              : "border-sky-200 bg-sky-50/80 text-slate-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`rounded-xl p-2.5 shrink-0 ${
                data.nextFdMaturity.daysRemaining <= 30
                  ? "bg-amber-500 text-white"
                  : "bg-sky-600 text-white"
              }`}
            >
              <BellRing className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Next Fixed Deposit Maturity
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    data.nextFdMaturity.daysRemaining < 0
                      ? "bg-rose-600 text-white"
                      : data.nextFdMaturity.daysRemaining <= 14
                        ? "bg-amber-600 text-white"
                        : data.nextFdMaturity.daysRemaining <= 30
                          ? "bg-amber-200 text-amber-950"
                          : "bg-sky-200 text-sky-900"
                  }`}
                >
                  <CalendarClock className="h-3 w-3" />
                  {data.nextFdMaturity.daysRemaining === 0
                    ? "Matures today"
                    : data.nextFdMaturity.daysRemaining > 0
                      ? `In ${data.nextFdMaturity.daysRemaining} day${
                          data.nextFdMaturity.daysRemaining === 1 ? "" : "s"
                        }`
                      : `Matured ${Math.abs(data.nextFdMaturity.daysRemaining)}d ago`}
                </span>
              </div>
              <div className="text-sm sm:text-base font-semibold">
                {data.nextFdMaturity.name} •{" "}
                <span className="tabular-nums">
                  {formatINR(data.nextFdMaturity.currentInr)}
                </span>{" "}
                <span className="font-normal text-xs sm:text-sm opacity-80">
                  matures on{" "}
                  <strong>
                    {new Date(
                      `${data.nextFdMaturity.maturityDate}T00:00:00`
                    ).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </strong>
                  {data.nextFdMaturity.interestRate > 0
                    ? ` @ ${data.nextFdMaturity.interestRate}%`
                    : ""}
                </span>
              </div>
              {data.upcomingMaturities.filter(
                (item) =>
                  item.assetClass === "fd" &&
                  item.id !== data.nextFdMaturity?.id
              ).length > 0 && (
                <div className="text-xs opacity-80 flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-medium">Following FDs:</span>
                  {data.upcomingMaturities
                    .filter(
                      (item) =>
                        item.assetClass === "fd" &&
                        item.id !== data.nextFdMaturity?.id
                    )
                    .slice(0, 3)
                    .map((item) => (
                      <span key={item.id} className="tabular-nums">
                        {item.name.split(" (")[0]} ({item.maturityDate} •{" "}
                        {formatCompactINR(item.currentInr)})
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
          <Link
            href={`/investments/${data.nextFdMaturity.id}`}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-xs font-semibold transition"
          >
            Review FD →
          </Link>
        </div>
      )}

      {isEmpty && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-indigo-950 text-base">
              Import your existing workbook to populate your portfolio
            </h2>
            <p className="text-sm text-indigo-800 mt-1">
              Upload your Excel (.xlsx) or CSV sheet to populate MF/ETF SIP
              ledgers, Stocks, NPS, PPF, FDs, Rentals, Loans, and Insurance.
            </p>
          </div>
          <Link
            href="/import"
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 text-sm font-medium transition"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel / CSV
          </Link>
        </div>
      )}

      {/* 4 Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Investments Pillar */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                <ArrowUpRight className="h-4 w-4" />
                Investments
              </div>
              <Link
                href="/investments"
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Deep Dive →
              </Link>
            </div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {formatINR(m.totalPortfolioInr)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Monthly SIPs: {formatINR(m.totalPlannedSipInr)}
            </div>
            <div className="mt-3 space-y-1.5">
              {data.categoryCards.slice(0, 5).map((cat) => (
                <div
                  key={cat.slug}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.label}
                  </span>
                  <span className="tabular-nums font-medium text-slate-900">
                    {formatCompactINR(cat.totalInr)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Link
            href="/investments"
            className="mt-4 inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold py-2 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Any Category / SIP
          </Link>
        </div>

        {/* 2. Income Pillar */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                <Wallet className="h-4 w-4" />
                Income Streams
              </div>
              <Link
                href="/income"
                className="text-xs font-medium text-emerald-600 hover:underline"
              >
                Manage →
              </Link>
            </div>
            <div className="space-y-2.5 mt-2">
              <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 p-3">
                <div className="text-[11px] font-medium text-emerald-700 uppercase">
                  Main Income (Salary)
                </div>
                <div className="text-lg font-bold text-emerald-950 tabular-nums">
                  {formatCompactINR(m.mainIncomeTotal)}
                </div>
              </div>
              <div className="rounded-xl bg-sky-50/80 border border-sky-100 p-3">
                <div className="text-[11px] font-medium text-sky-700 uppercase">
                  Passive (Rent + Div + Other)
                </div>
                <div className="text-lg font-bold text-sky-950 tabular-nums">
                  {formatCompactINR(m.passiveIncomeTotal)}
                </div>
                <div className="text-[11px] text-sky-700 mt-0.5 tabular-nums">
                  Rent Run-rate: {formatINR(m.expectedMonthlyRent)}/mo
                </div>
              </div>
            </div>
          </div>
          <Link
            href="/income"
            className="mt-4 inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold py-2 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Salary / Passive Source
          </Link>
        </div>

        {/* 3. Loans Pillar */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-700">
                <Landmark className="h-4 w-4" />
                Loans
              </div>
              <Link
                href="/loans"
                className="text-xs font-medium text-rose-600 hover:underline"
              >
                Ledgers →
              </Link>
            </div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {formatINR(m.totalLiabilitiesInr)}
            </div>
            <div className="mt-3 space-y-2">
              {data.loansList.length === 0 ? (
                <p className="text-xs text-slate-400">No loans added yet.</p>
              ) : (
                data.loansList.slice(0, 3).map((l) => (
                  <div
                    key={l.id}
                    className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 truncate">
                        {l.name}
                      </div>
                      <div className="text-[11px] text-slate-400 uppercase">
                        {l.status}
                      </div>
                    </div>
                    <div className="font-semibold text-slate-900 tabular-nums ml-2">
                      {formatCompactINR(l.currentBalance)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <Link
            href="/loans"
            className="mt-4 inline-flex items-center justify-center gap-1 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold py-2 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Loan
          </Link>
        </div>

        {/* 4. Insurance Pillar */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
                <Shield className="h-4 w-4" />
                Insurance & Docs
              </div>
              <Link
                href="/loans"
                className="text-xs font-medium text-teal-600 hover:underline"
              >
                Upload Docs →
              </Link>
            </div>
            <div className="text-xs text-slate-500 mb-2 tabular-nums">
              Annualized Total:{" "}
              <strong className="text-slate-900">
                {formatINR(m.totalAnnualInsurancePremiumInr)}/yr
              </strong>
            </div>
            <div className="space-y-2">
              {data.policiesList.length === 0 ? (
                <p className="text-xs text-slate-400">No policies added yet.</p>
              ) : (
                data.policiesList.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-xl bg-teal-50/60 border border-teal-100 p-2.5 flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-teal-700 uppercase">
                        {p.policyType} • {formatINR(p.premiumAmount)}/
                        {p.premiumFrequency === "monthly" ? "mo" : "yr"}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                        p.docCount > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      <FileCheck2 className="h-3 w-3" />
                      {p.docCount} doc
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
              <span>Emergency Fund (FD/RD)</span>
              <span className="tabular-nums font-medium">
                {Math.round(emergencyPct * 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-500 h-1.5 rounded-full"
                style={{ width: `${Math.round(emergencyPct * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Asset Register Summary (if any assets exist) */}
      {data.assetsList.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              Non-Portfolio Asset Register ({data.assetsList.length})
            </h2>
            <button
              type="button"
              onClick={() => setShowAssetModal(true)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              + Add Asset
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.assetsList.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-800">{a.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {a.assetType.replace("_", " ")}{" "}
                    {a.isEstimated ? "• Estimated" : "• Actual"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">
                    {formatCompactINR(a.valueInr)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAssetToDelete(a.id)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                    aria-label={`Delete ${a.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs">
          <h2 className="font-semibold text-slate-900 mb-4">
            Asset Allocation
          </h2>
          {data.allocationChart.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">
              No holdings recorded yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.allocationChart}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={84}
                      paddingAngle={2}
                    >
                      {data.allocationChart.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatINR(Number(value ?? 0))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {data.allocationChart.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: COLORS[idx % COLORS.length],
                        }}
                      />
                      <span className="truncate text-slate-700 font-medium">
                        {item.name}
                      </span>
                    </div>
                    <div className="tabular-nums text-slate-600 shrink-0 ml-2">
                      {formatCompactINR(item.value)} ({formatPercent(item.pct)})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs">
          <h2 className="font-semibold text-slate-900 mb-4">
            Monthly Income (Salary, Rental, Dividends, Other)
          </h2>
          {data.incomeChart.length === 0 ? (
            <p className="text-sm text-slate-400 py-16 text-center">
              No income records yet.
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.incomeChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                  />
                  <Tooltip
                    formatter={(value) => formatINR(Number(value ?? 0))}
                  />
                  <Bar
                    dataKey="salary"
                    name="Salary"
                    stackId="a"
                    fill="#10b981"
                  />
                  <Bar
                    dataKey="rental"
                    name="Rental"
                    stackId="a"
                    fill="#0ea5e9"
                  />
                  <Bar
                    dataKey="dividend"
                    name="Dividends"
                    stackId="a"
                    fill="#8b5cf6"
                  />
                  <Bar
                    dataKey="other"
                    name="Other"
                    stackId="a"
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Net Worth Timeline & Financial Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">
              Historical Wealth Timeline
            </h2>
            {data.snapshots.some((s) => !s.liabilitiesKnown) && (
              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
                Some milestones show gross assets (historical liabilities unknown)
              </span>
            )}
          </div>
          {timelineChartData.length === 0 ? (
            <p className="text-sm text-slate-400 py-14 text-center">
              Import historical snapshots to view multi-year net worth growth.
            </p>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                  />
                  <Tooltip
                    formatter={(value) => formatINR(Number(value ?? 0))}
                  />
                  <Area
                    type="monotone"
                    dataKey="displayValue"
                    name="Net Worth / Gross Assets"
                    stroke="#6366f1"
                    fill="#6366f122"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Goals</h2>
          </div>
          {data.goals.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center">
              No goals added yet.
            </p>
          ) : (
            <div className="space-y-3">
              {data.goals.map((g) => {
                const pct =
                  g.targetAmount > 0
                    ? Math.min(1, g.currentAmount / g.targetAmount)
                    : 0;
                return (
                  <div
                    key={g.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 p-3"
                  >
                    <div className="flex items-center justify-between text-sm font-medium text-slate-800">
                      <span>{g.name}</span>
                      <span className="tabular-nums text-xs text-indigo-700 font-semibold">
                        {formatCompactINR(g.targetAmount)}
                      </span>
                    </div>
                    <div className="mt-1.5 w-full bg-slate-200 rounded-full h-1.5">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-1.5 rounded-full"
                        style={{ width: `${Math.round(pct * 100)}%` }}
                      />
                    </div>
                    {g.notes && (
                      <p className="text-xs text-slate-500 mt-1.5">{g.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Asset Modal */}
      {showAssetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">
                Add Non-Portfolio Asset
              </h2>
              <button
                type="button"
                onClick={() => setShowAssetModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createAsset} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Asset Name *
                </label>
                <input
                  required
                  value={assetForm.name}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, name: e.target.value })
                  }
                  placeholder="e.g. Savings Bank Balance, Property, Vehicle"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Type
                  </label>
                  <select
                    value={assetForm.assetType}
                    onChange={(e) =>
                      setAssetForm({ ...assetForm, assetType: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <option value="financial_cash">Cash / Bank</option>
                    <option value="financial_other">Other Financial</option>
                    <option value="physical_property">Real Estate / Property</option>
                    <option value="physical_vehicle">Vehicle</option>
                    <option value="physical_other">Other Physical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Current Value (INR)
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={assetForm.currentValue}
                    onChange={(e) =>
                      setAssetForm({ ...assetForm, currentValue: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={assetForm.isEstimated}
                  onChange={(e) =>
                    setAssetForm({ ...assetForm, isEstimated: e.target.checked })
                  }
                />
                Valuation is an estimate
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssetModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium"
                >
                  Save Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={assetToDelete !== null}
        title="Delete Asset"
        message="Remove this asset from the Net Worth register? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => assetToDelete !== null && deleteAsset(assetToDelete)}
        onCancel={() => setAssetToDelete(null)}
      />

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="overview"
      />
    </div>
  );
}
