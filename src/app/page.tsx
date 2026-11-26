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

interface DashboardData {
  usdInrRate: number;
  lastNavRefreshAt: string;
  lastBackupAt: string;
  metrics: {
    totalInvestedInr: number;
    totalPortfolioInr: number;
    totalGainInr: number;
    totalGainPct: number;
    portfolioXirr: number | null;
    totalPlannedSipInr: number;
    totalLiabilitiesInr: number;
    netWorthInr: number;
    expectedMonthlyRent: number;
    mainIncomeTotal: number;
    passiveIncomeTotal: number;
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
    coverAmount: string;
    docCount: number;
  }>;
  incomeChart: Array<{
    month: string;
    salary: number;
    rental: number;
    total: number;
  }>;
  snapshots: Array<{ id: number; date: string; netWorth: number }>;
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
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) {
        setData(await res.json());
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
    try {
      const res = await fetch("/api/prices/refresh", { method: "POST" });
      const json = await res.json();
      setToast(
        `Updated ${json.updatedCount ?? 0} live prices${
          json.usdInrRate ? ` (USD/INR: ₹${json.usdInrRate})` : ""
        }`
      );
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function triggerBackup() {
    setBackingUp(true);
    setToast("");
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const json = await res.json();
      if (json.backup?.filename) {
        setToast(`Saved backup: ${json.backup.filename}`);
        await load();
      }
    } finally {
      setBackingUp(false);
    }
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

  return (
    <div className="space-y-6">
      {/* Net Worth Hero Banner */}
      <div className="rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#064E3B] text-white p-6 sm:p-7 shadow-lg border border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <TrendingUp className="h-3.5 w-3.5" />
              Net Worth Overview • USD/INR ₹{data.usdInrRate.toFixed(2)}
            </div>
            <div className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
              {formatINR(m.netWorthInr)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:text-sm text-slate-300 tabular-nums">
              <span>
                Investments:{" "}
                <strong className="text-white">
                  {formatCompactINR(m.totalPortfolioInr)}
                </strong>
              </span>
              <span>
                Gain:{" "}
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
                Loans:{" "}
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

      {/* AI Financial Pulse */}
      <AiInsightBanner scope="overview" onAskAi={() => setAiOpen(true)} />

      {isEmpty && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-indigo-950 text-base">
              Import your existing BPS Excel workbook to populate everything
            </h2>
            <p className="text-sm text-indigo-800 mt-1">
              Upload your current Excel/CSV sheet to populate MF/ETF SIP
              ledgers, Stocks, NPS, PPF, FDs, Shop Passive Income, Loans, and
              Insurance automatically.
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

      {/* Side-by-Side 4 Pillars (Matching Sketch: Investment / Income / Loan / Insurance) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Investments Pillar */}
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                <ArrowUpRight className="h-4 w-4" />
                Investments (Generic)
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

        {/* 2. Income Pillar (Main vs Passive) */}
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
                  Passive Income (Rent & Other)
                </div>
                <div className="text-lg font-bold text-sky-950 tabular-nums">
                  {formatCompactINR(m.passiveIncomeTotal)}
                </div>
                <div className="text-[11px] text-sky-700 mt-0.5 tabular-nums">
                  Run-rate: {formatINR(m.expectedMonthlyRent)}/mo
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

        {/* 3. Loans Pillar (Loan-1, Loan-2...) */}
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

        {/* 4. Insurance Pillar (Term & Health + Documents) */}
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
                        {p.policyType} • {formatINR(p.premiumAmount)}/yr
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
            Monthly Income (Main Salary vs Passive)
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
                    name="Main Income (Salary)"
                    stackId="a"
                    fill="#10b981"
                  />
                  <Bar
                    dataKey="rental"
                    name="Passive Income"
                    stackId="a"
                    fill="#0ea5e9"
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
          <h2 className="font-semibold text-slate-900 mb-4">
            Net Worth Growth Timeline
          </h2>
          {data.snapshots.length === 0 ? (
            <p className="text-sm text-slate-400 py-14 text-center">
              Import historical snapshots to view multi-year net worth growth.
            </p>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.snapshots}>
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
                    dataKey="netWorth"
                    name="Net Worth"
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

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="overview"
      />
    </div>
  );
}
