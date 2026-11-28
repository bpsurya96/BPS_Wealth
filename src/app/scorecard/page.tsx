"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Save, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { formatCompactINR, formatINR, formatPercent } from "@/lib/utils";

interface ScorecardRow {
  month: string;
  salary: number;
  rental: number;
  dividend: number;
  otherIncome: number;
  totalIncome: number;
  passiveIncome: number;
  emiPaid: number;
  insuranceObligation: number;
  trackedExpenses: number | null;
  totalExpenses: number | null;
  invContributions: number;
  employerContributions: number;
  redemptions: number;
  sipCommitment: number;
  portfolioValue: number;
  marketGainInr: number | null;
  netWorth: number | null;
  savingsRatePct: number | null;
  investmentRatePct: number | null;
  debtToAssetPct: number | null;
  passiveIncomeRatioPct: number | null;
  monthlySurplus: number | null;
  notes: string;
}

interface ScorecardResponse {
  currentMonth: string;
  current: ScorecardRow;
  goalContributionProgressPct: number | null;
  netWorthChangeVsPriorSnapshot: number | null;
  comparisons: {
    vsPrevMonth: {
      prevMonth: string;
      incomeDelta: number;
      invContributionsDelta: number;
      expensesDelta: number | null;
    } | null;
    vsSixMonthAvg: {
      monthsCount: number;
      avgIncome: number | null;
      avgInvContributions: number | null;
      incomeDelta: number | null;
      invContributionsDelta: number | null;
    };
    yearComparison: {
      currentYear: string;
      prevYear: string;
      currentYearIncome: number;
      prevYearIncome: number;
      currentYearInvested: number;
      prevYearInvested: number;
    };
  };
  history: ScorecardRow[];
}

export default function WealthScorecardPage() {
  const [data, setData] = useState<ScorecardResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [trackedExpensesInput, setTrackedExpensesInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/planning/scorecard", { cache: "no-store" });
      if (res.ok) {
        const json: ScorecardResponse = await res.json();
        setData(json);
        setSelectedMonth((prev) => prev || json.currentMonth);
        const row =
          json.history.find((h) => h.month === (selectedMonth || json.currentMonth)) ??
          json.current;
        setTrackedExpensesInput(
          row.trackedExpenses !== null ? String(row.trackedExpenses) : ""
        );
        setNotesInput(row.notes || "");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSelectMonth(month: string) {
    setSelectedMonth(month);
    const row = data?.history.find((h) => h.month === month);
    setTrackedExpensesInput(
      row && row.trackedExpenses !== null ? String(row.trackedExpenses) : ""
    );
    setNotesInput(row?.notes || "");
  }

  async function saveMonthlyExpenses(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMonth) return;
    setSaving(true);
    setToast("");
    try {
      const res = await fetch("/api/planning/scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          trackedExpenses:
            trackedExpensesInput.trim() === ""
              ? null
              : Number(trackedExpensesInput),
          notes: notesInput,
        }),
      });
      if (res.ok) {
        const json: ScorecardResponse = await res.json();
        setData(json);
        setToast(`Saved monthly scorecard record for ${selectedMonth}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-slate-200 rounded-3xl" />
        <div className="h-72 bg-white rounded-2xl border border-slate-200" />
      </div>
    );
  }

  const activeRow =
    data.history.find((h) => h.month === selectedMonth) ?? data.current;
  const cmp = data.comparisons;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Monthly Wealth Creation Scorecard
          </h1>
          <p className="text-sm text-slate-500">
            Separates actual contributions from market appreciation, tracks
            income & debt ratios, and only computes savings rate when expenses
            are recorded.
          </p>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => handleSelectMonth(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium shadow-xs"
        >
          {[...data.history].reverse().map((h) => (
            <option key={h.month} value={h.month}>
              {h.month}
            </option>
          ))}
        </select>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <AiInsightBanner scope="scorecard" onAskAi={() => setAiOpen(true)} />

      {/* 4 Pillars: Income, Expenses, Investment Activity, Financial Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Income */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Income ({activeRow.month})
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatINR(activeRow.totalIncome)}
          </div>
          <div className="space-y-1 text-xs text-slate-600 tabular-nums pt-1 border-t border-slate-100">
            <div className="flex justify-between">
              <span>Salary</span>
              <span className="font-medium">{formatINR(activeRow.salary)}</span>
            </div>
            <div className="flex justify-between">
              <span>Rental</span>
              <span className="font-medium">{formatINR(activeRow.rental)}</span>
            </div>
            <div className="flex justify-between">
              <span>Dividends</span>
              <span className="font-medium">
                {formatINR(activeRow.dividend)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Other</span>
              <span className="font-medium">
                {formatINR(activeRow.otherIncome)}
              </span>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-rose-700">
            Expenses & Obligations
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {activeRow.totalExpenses !== null
              ? formatINR(activeRow.totalExpenses)
              : "Not enough data"}
          </div>
          <div className="space-y-1 text-xs text-slate-600 tabular-nums pt-1 border-t border-slate-100">
            <div className="flex justify-between">
              <span>Loan EMIs Paid</span>
              <span className="font-medium">
                {formatINR(activeRow.emiPaid)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Insurance (Monthly Eq.)</span>
              <span className="font-medium">
                {formatINR(activeRow.insuranceObligation)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Other Recorded Expenses</span>
              <span className="font-medium">
                {activeRow.trackedExpenses !== null
                  ? formatINR(activeRow.trackedExpenses)
                  : "Not recorded"}
              </span>
            </div>
          </div>
        </div>

        {/* Investment Activity */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Investment Activity
          </div>
          <div className="text-2xl font-bold text-indigo-700 tabular-nums">
            {formatINR(
              activeRow.invContributions + activeRow.employerContributions
            )}
          </div>
          <div className="space-y-1 text-xs text-slate-600 tabular-nums pt-1 border-t border-slate-100">
            <div className="flex justify-between">
              <span>Contributions (SIP/Buy)</span>
              <span className="font-medium">
                {formatINR(activeRow.invContributions)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Employer Contributions</span>
              <span className="font-medium">
                {formatINR(activeRow.employerContributions)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>SIP Commitment</span>
              <span className="font-medium">
                {formatINR(activeRow.sipCommitment)}
              </span>
            </div>
            {activeRow.marketGainInr !== null && (
              <div className="flex justify-between">
                <span>Unrealized Market Gain</span>
                <span className="font-medium text-emerald-700">
                  {formatCompactINR(activeRow.marketGainInr)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Financial Health */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-700">
            Financial Health Ratios
          </div>
          <div className="space-y-1.5 text-xs text-slate-700 tabular-nums">
            <div className="flex justify-between">
              <span>Savings Rate</span>
              <strong className="text-slate-900">
                {activeRow.savingsRatePct !== null
                  ? `${activeRow.savingsRatePct}%`
                  : "Not enough data"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Investment Rate</span>
              <strong className="text-indigo-700">
                {activeRow.investmentRatePct !== null
                  ? `${activeRow.investmentRatePct}%`
                  : "Not enough data"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Debt-to-Asset Ratio</span>
              <strong>
                {activeRow.debtToAssetPct !== null
                  ? `${activeRow.debtToAssetPct}%`
                  : "Not enough data"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Passive Income Ratio</span>
              <strong>
                {activeRow.passiveIncomeRatioPct !== null
                  ? `${activeRow.passiveIncomeRatioPct}%`
                  : "Not enough data"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Monthly Surplus</span>
              <strong>
                {activeRow.monthlySurplus !== null
                  ? formatINR(activeRow.monthlySurplus)
                  : "Not enough data"}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Goal SIP Coverage</span>
              <strong>
                {data.goalContributionProgressPct !== null
                  ? formatPercent(data.goalContributionProgressPct)
                  : "Not enough data"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Record Tracked Expenses Form + Comparisons */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={saveMonthlyExpenses}
          className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3 text-xs"
        >
          <h2 className="font-semibold text-sm text-slate-900">
            Record Other Monthly Expenses ({selectedMonth})
          </h2>
          <p className="text-slate-500">
            BPS Wealth never invents living expenses. Enter your actual
            non-EMI/non-insurance household expenses for {selectedMonth} to
            unlock exact Savings Rate & Monthly Surplus.
          </p>
          <div>
            <label className="block text-slate-600 mb-1">
              Other Recorded Expenses (INR)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Leave blank if unknown"
              value={trackedExpensesInput}
              onChange={(e) => setTrackedExpensesInput(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-slate-600 mb-1">Notes</label>
            <input
              value={notesInput}
              onChange={(e) => setNotesInput(e.target.value)}
              placeholder="Optional scorecard reflection"
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 font-semibold"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Month Scorecard"}
          </button>
        </form>

        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
          <h2 className="font-semibold text-sm text-slate-900">
            Period Comparisons & Explanations
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 space-y-1">
              <div className="font-semibold text-slate-700">
                vs Previous Month
              </div>
              {cmp.vsPrevMonth ? (
                <>
                  <div className="flex items-center gap-1 font-semibold tabular-nums">
                    {cmp.vsPrevMonth.incomeDelta >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
                    )}
                    Income: {cmp.vsPrevMonth.incomeDelta >= 0 ? "+" : ""}
                    {formatCompactINR(cmp.vsPrevMonth.incomeDelta)}
                  </div>
                  <div className="text-slate-600 tabular-nums">
                    Invested:{" "}
                    {cmp.vsPrevMonth.invContributionsDelta >= 0 ? "+" : ""}
                    {formatCompactINR(cmp.vsPrevMonth.invContributionsDelta)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Compared to {cmp.vsPrevMonth.prevMonth}
                  </div>
                </>
              ) : (
                <div className="text-slate-400">Not enough prior months</div>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 space-y-1">
              <div className="font-semibold text-slate-700">
                vs 6-Month Average
              </div>
              {cmp.vsSixMonthAvg.avgIncome !== null ? (
                <>
                  <div className="font-semibold tabular-nums">
                    Income:{" "}
                    {(cmp.vsSixMonthAvg.incomeDelta ?? 0) >= 0 ? "+" : ""}
                    {formatCompactINR(cmp.vsSixMonthAvg.incomeDelta ?? 0)}
                  </div>
                  <div className="text-slate-600 tabular-nums">
                    Invested:{" "}
                    {(cmp.vsSixMonthAvg.invContributionsDelta ?? 0) >= 0
                      ? "+"
                      : ""}
                    {formatCompactINR(
                      cmp.vsSixMonthAvg.invContributionsDelta ?? 0
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Avg across {cmp.vsSixMonthAvg.monthsCount} month(s)
                  </div>
                </>
              ) : (
                <div className="text-slate-400">Not enough history</div>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5 space-y-1">
              <div className="font-semibold text-slate-700">
                {cmp.yearComparison.currentYear} vs{" "}
                {cmp.yearComparison.prevYear}
              </div>
              <div className="font-semibold tabular-nums">
                Income:{" "}
                {formatCompactINR(cmp.yearComparison.currentYearIncome)} vs{" "}
                {formatCompactINR(cmp.yearComparison.prevYearIncome)}
              </div>
              <div className="text-slate-600 tabular-nums">
                Invested:{" "}
                {formatCompactINR(cmp.yearComparison.currentYearInvested)} vs{" "}
                {formatCompactINR(cmp.yearComparison.prevYearInvested)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Chart */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
        <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-indigo-600" />
          Monthly Income vs Investment Contributions History
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.history.slice(-12)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCompactINR(Number(v))}
              />
              <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
              <Legend />
              <Bar
                dataKey="totalIncome"
                name="Total Income"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="invContributions"
                name="Investment Contributions"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Historical Table */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
        <h2 className="font-semibold text-slate-900 text-sm">
          Historical Scorecard Ledger
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-left">
                <th className="py-2">Month</th>
                <th className="py-2 text-right">Income</th>
                <th className="py-2 text-right">EMI Paid</th>
                <th className="py-2 text-right">Expenses</th>
                <th className="py-2 text-right">Contributions</th>
                <th className="py-2 text-right">Inv. Rate</th>
                <th className="py-2 text-right">Savings Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {[...data.history].reverse().map((r) => (
                <tr key={r.month}>
                  <td className="py-2 font-medium text-slate-900">{r.month}</td>
                  <td className="py-2 text-right">
                    {formatINR(r.totalIncome)}
                  </td>
                  <td className="py-2 text-right">{formatINR(r.emiPaid)}</td>
                  <td className="py-2 text-right">
                    {r.totalExpenses !== null
                      ? formatINR(r.totalExpenses)
                      : "—"}
                  </td>
                  <td className="py-2 text-right text-indigo-700 font-medium">
                    {formatINR(r.invContributions + r.employerContributions)}
                  </td>
                  <td className="py-2 text-right">
                    {r.investmentRatePct !== null
                      ? `${r.investmentRatePct}%`
                      : "Not enough data"}
                  </td>
                  <td className="py-2 text-right">
                    {r.savingsRatePct !== null
                      ? `${r.savingsRatePct}%`
                      : "Not enough data"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="scorecard"
      />
    </div>
  );
}
