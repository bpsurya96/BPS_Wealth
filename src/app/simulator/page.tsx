"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookmarkPlus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { formatCompactINR, formatINR } from "@/lib/utils";
import {
  DEFAULT_WHAT_IF_ADJUSTMENTS,
  runWhatIfSimulation,
  SimulationBaseline,
  WhatIfAdjustments,
} from "@/lib/wealth-calculations";

interface SavedScenario {
  id: number;
  name: string;
  description: string;
  adjustments: WhatIfAdjustments;
}

export default function SimulatorPage() {
  const [baseline, setBaseline] = useState<SimulationBaseline | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [adj, setAdj] = useState<WhatIfAdjustments>(
    DEFAULT_WHAT_IF_ADJUSTMENTS
  );
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/planning/simulator", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setBaseline(json.baseline);
        setSavedScenarios(json.savedScenarios ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const simResult = useMemo(() => {
    if (!baseline) return null;
    return runWhatIfSimulation(baseline, adj);
  }, [baseline, adj]);

  const comparedResults = useMemo(() => {
    if (!baseline) return [];
    return savedScenarios
      .filter((s) => compareIds.includes(s.id))
      .map((s) => ({
        scenario: s,
        result: runWhatIfSimulation(baseline, s.adjustments).scenario,
      }));
  }, [baseline, savedScenarios, compareIds]);

  const mergedChartData = useMemo(() => {
    if (!simResult) return [];
    return simResult.baseline.trajectory.map((pt, idx) => {
      const row: Record<string, number> = {
        year: pt.year,
        baselineNetWorth: pt.netWorth,
        scenarioNetWorth: simResult.scenario.trajectory[idx]?.netWorth ?? pt.netWorth,
      };
      for (const c of comparedResults) {
        row[`cmp_${c.scenario.id}`] =
          c.result.trajectory[idx]?.netWorth ?? pt.netWorth;
      }
      return row;
    });
  }, [simResult, comparedResults]);

  async function saveCurrentScenario(e: React.FormEvent) {
    e.preventDefault();
    if (!scenarioName.trim()) return;
    setSaving(true);
    setToast("");
    try {
      const res = await fetch("/api/planning/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          name: scenarioName.trim(),
          description: "",
          adjustments: adj,
        }),
      });
      if (res.ok) {
        setScenarioName("");
        setToast("Saved hypothetical scenario (real records untouched)");
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteScenario(id: number) {
    await fetch(`/api/planning/simulator?id=${id}`, { method: "DELETE" });
    setCompareIds((prev) => prev.filter((x) => x !== id));
    await load();
  }

  function resetAdjustments() {
    setAdj(DEFAULT_WHAT_IF_ADJUSTMENTS);
    setToast("Reset simulator to baseline");
  }

  if (loading || !baseline || !simResult) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-slate-200 rounded-3xl" />
        <div className="h-80 bg-white rounded-2xl border border-slate-200" />
      </div>
    );
  }

  const b = simResult.baseline;
  const sc = simResult.scenario;
  const d = simResult.deltas;
  const CMP_COLORS = ["#f59e0b", "#ec4899", "#0ea5e9"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            What-If Financial Simulator
          </h1>
          <p className="text-sm text-slate-500">
            Test salary hikes, SIP increases or pauses, market crashes, medical
            expenses, and loan prepayments in an isolated sandbox without
            touching real database records.
          </p>
        </div>
        <button
          type="button"
          onClick={resetAdjustments}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Baseline
        </button>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <AiInsightBanner scope="simulator" onAskAi={() => setAiOpen(true)} />

      {/* Quick Presets */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs space-y-2.5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Quick What-If Levers
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {[5, 10, 15].map((pct) => (
            <button
              key={`sal-${pct}`}
              type="button"
              onClick={() => setAdj({ ...adj, salaryChangePct: pct })}
              className={`px-3 py-1.5 rounded-xl border font-medium ${
                adj.salaryChangePct === pct
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-slate-50 border-slate-200 text-slate-700"
              }`}
            >
              Salary +{pct}%
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setAdj({ ...adj, sipDeltaMonthly: adj.sipDeltaMonthly + 2000 })
            }
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 font-medium text-slate-700"
          >
            +₹2,000 SIP
          </button>
          <button
            type="button"
            onClick={() =>
              setAdj({ ...adj, sipDeltaMonthly: adj.sipDeltaMonthly + 5000 })
            }
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 font-medium text-slate-700"
          >
            +₹5,000 SIP
          </button>
          <button
            type="button"
            onClick={() => setAdj({ ...adj, pauseSipMonths: 6 })}
            className={`px-3 py-1.5 rounded-xl border font-medium ${
              adj.pauseSipMonths === 6
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            Pause SIP 6 Months
          </button>
          <button
            type="button"
            onClick={() => setAdj({ ...adj, marketShockPct: -20 })}
            className={`px-3 py-1.5 rounded-xl border font-medium ${
              adj.marketShockPct === -20
                ? "bg-rose-600 text-white border-rose-600"
                : "bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            Market Decline −20%
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4 text-xs">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
            Hypothetical Adjustments
          </div>

          {/* Income */}
          <div className="space-y-2 pb-3 border-b border-slate-100">
            <div className="font-semibold text-emerald-700 uppercase text-[11px]">
              Income Changes
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-slate-600 mb-1">
                  Salary Δ (%)
                </label>
                <input
                  type="number"
                  step="any"
                  value={adj.salaryChangePct}
                  onChange={(e) =>
                    setAdj({ ...adj, salaryChangePct: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">
                  +Rent (₹/mo)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adj.additionalRentalMonthly}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      additionalRentalMonthly: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">
                  +Passive (₹/mo)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adj.additionalPassiveMonthly}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      additionalPassiveMonthly: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
            </div>
          </div>

          {/* Investments */}
          <div className="space-y-2 pb-3 border-b border-slate-100">
            <div className="font-semibold text-indigo-700 uppercase text-[11px]">
              Investment Changes
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 mb-1">
                  SIP Change (₹/mo)
                </label>
                <input
                  type="number"
                  step="any"
                  value={adj.sipDeltaMonthly}
                  onChange={(e) =>
                    setAdj({ ...adj, sipDeltaMonthly: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">
                  Pause SIP (Months)
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={adj.pauseSipMonths}
                  onChange={(e) =>
                    setAdj({ ...adj, pauseSipMonths: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">
                  Extra Annual Lump Sum (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adj.annualLumpSumAddition}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      annualLumpSumAddition: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">
                  Return Override (% p.a.)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder={`Base ${baseline.expectedReturnPct}%`}
                  value={adj.returnRateOverridePct ?? ""}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      returnRateOverridePct:
                        e.target.value.trim() === ""
                          ? null
                          : Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-600 mb-1">
                  Immediate Market Shock (% e.g. -20)
                </label>
                <input
                  type="number"
                  min="-90"
                  max="200"
                  step="any"
                  value={adj.marketShockPct}
                  onChange={(e) =>
                    setAdj({ ...adj, marketShockPct: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="space-y-2 pb-3 border-b border-slate-100">
            <div className="font-semibold text-amber-700 uppercase text-[11px]">
              Expense Changes
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 mb-1">
                  Monthly Expense Δ (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  value={adj.newMonthlyExpenseDelta}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      newMonthlyExpenseDelta: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">
                  One-time Medical / Purchase (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adj.oneTimeExpense}
                  onChange={(e) =>
                    setAdj({ ...adj, oneTimeExpense: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
            </div>
          </div>

          {/* Debt */}
          <div className="space-y-2 pb-3 border-b border-slate-100">
            <div className="font-semibold text-rose-700 uppercase text-[11px]">
              Debt Changes
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 mb-1">
                  Lump Sum Prepayment (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adj.loanPrepaymentAmount}
                  onChange={(e) =>
                    setAdj({
                      ...adj,
                      loanPrepaymentAmount: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">
                  Extra Monthly EMI (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={adj.emiDeltaMonthly}
                  onChange={(e) =>
                    setAdj({ ...adj, emiDeltaMonthly: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-slate-200 px-2.5 py-1.5"
                />
              </div>
            </div>
            {baseline.loans.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="text-[11px] text-slate-500">
                  Simulate Closing Loan(s):
                </div>
                {baseline.loans.map((l) => (
                  <label key={l.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={adj.closeLoanIds.includes(l.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...adj.closeLoanIds, l.id]
                          : adj.closeLoanIds.filter((x) => x !== l.id);
                        setAdj({ ...adj, closeLoanIds: next });
                      }}
                    />
                    <span>
                      Close {l.name} ({formatCompactINR(l.currentBalance)})
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Save Scenario */}
          <form onSubmit={saveCurrentScenario} className="flex gap-2">
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="Save scenario name..."
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
            />
            <button
              type="submit"
              disabled={saving || !scenarioName.trim()}
              className="inline-flex items-center gap-1 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-3.5 py-2 font-semibold"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Save
            </button>
          </form>
        </div>

        {/* Comparison Results */}
        <div className="lg:col-span-7 space-y-5">
          {/* KPI Comparison Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                Monthly Surplus
              </div>
              <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                {formatCompactINR(sc.monthlySurplus)}
              </div>
              <div
                className={`text-[11px] font-semibold mt-0.5 tabular-nums ${
                  d.monthlySurplusDelta >= 0
                    ? "text-emerald-700"
                    : "text-rose-600"
                }`}
              >
                {d.monthlySurplusDelta >= 0 ? "+" : ""}
                {formatCompactINR(d.monthlySurplusDelta)} vs base
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                10-Year Net Worth
              </div>
              <div className="text-lg font-bold text-indigo-700 mt-1 tabular-nums">
                {formatCompactINR(sc.horizons.y10.netWorth)}
              </div>
              <div
                className={`text-[11px] font-semibold mt-0.5 tabular-nums ${
                  d.y10NetWorthDelta >= 0 ? "text-emerald-700" : "text-rose-600"
                }`}
              >
                {d.y10NetWorthDelta >= 0 ? "+" : ""}
                {formatCompactINR(d.y10NetWorthDelta)} vs base
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                20-Year Net Worth
              </div>
              <div className="text-lg font-bold text-emerald-700 mt-1 tabular-nums">
                {formatCompactINR(sc.horizons.y20.netWorth)}
              </div>
              <div
                className={`text-[11px] font-semibold mt-0.5 tabular-nums ${
                  d.y20NetWorthDelta >= 0 ? "text-emerald-700" : "text-rose-600"
                }`}
              >
                {d.y20NetWorthDelta >= 0 ? "+" : ""}
                {formatCompactINR(d.y20NetWorthDelta)} vs base
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] uppercase text-slate-500 font-semibold">
                FIRE Timeline
              </div>
              <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                {sc.fireYears !== null ? `${sc.fireYears} yrs` : "20+ yrs"}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                Base: {b.fireYears !== null ? `${b.fireYears} yrs` : "20+ yrs"}
                {d.fireMonthsDelta !== null
                  ? ` (${d.fireMonthsDelta > 0 ? "+" : ""}${d.fireMonthsDelta}m)`
                  : ""}
              </div>
            </div>
          </div>

          {/* 5, 10, 15, 20 Year Table */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm">
              5, 10, 15 & 20-Year Wealth Impact
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="py-2">Horizon</th>
                    <th className="py-2 text-right">Baseline Corpus</th>
                    <th className="py-2 text-right">Scenario Corpus</th>
                    <th className="py-2 text-right">Baseline Net Worth</th>
                    <th className="py-2 text-right">Scenario Net Worth</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {(
                    [
                      ["5 Years", b.horizons.y5, sc.horizons.y5],
                      ["10 Years", b.horizons.y10, sc.horizons.y10],
                      ["15 Years", b.horizons.y15, sc.horizons.y15],
                      ["20 Years", b.horizons.y20, sc.horizons.y20],
                    ] as const
                  ).map(([label, baseH, scH]) => (
                    <tr key={label}>
                      <td className="py-2 font-medium text-slate-800">
                        {label}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {formatCompactINR(baseH.corpus)}
                      </td>
                      <td className="py-2 text-right font-semibold text-indigo-700">
                        {formatCompactINR(scH.corpus)}
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {formatCompactINR(baseH.netWorth)}
                      </td>
                      <td className="py-2 text-right font-semibold text-emerald-700">
                        {formatCompactINR(scH.netWorth)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trajectory Comparison Chart */}
          <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm">
              Net Worth Comparison Over 20 Years
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mergedChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="year"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `Y${v}`}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                  />
                  <Tooltip
                    formatter={(v) => formatINR(Number(v ?? 0))}
                    labelFormatter={(lbl) => `Year ${lbl}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="baselineNetWorth"
                    name="Baseline"
                    stroke="#64748b"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="scenarioNetWorth"
                    name="Active What-If"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  {comparedResults.map((c, idx) => (
                    <Line
                      key={c.scenario.id}
                      type="monotone"
                      dataKey={`cmp_${c.scenario.id}`}
                      name={c.scenario.name}
                      stroke={CMP_COLORS[idx % CMP_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Saved Scenarios & Goal Impacts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
              <h3 className="font-semibold text-slate-900 text-sm">
                Goal Achievement Impact
              </h3>
              {sc.goalImpacts.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No active goals to evaluate.
                </p>
              ) : (
                <div className="space-y-2 text-xs">
                  {sc.goalImpacts.map((g, i) => {
                    const baseG = b.goalImpacts[i];
                    return (
                      <div
                        key={g.id}
                        className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold text-slate-800">
                            {g.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Base:{" "}
                            {baseG?.monthsToComplete !== null
                              ? `${baseG?.monthsToComplete}m`
                              : "50y+"}{" "}
                            → Scenario:{" "}
                            {g.monthsToComplete !== null
                              ? `${g.monthsToComplete}m`
                              : "50y+"}
                          </div>
                        </div>
                        <div className="text-right tabular-nums font-semibold text-indigo-700">
                          {formatCompactINR(g.projectedAtTarget)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
              <h3 className="font-semibold text-slate-900 text-sm">
                Saved Scenarios ({savedScenarios.length})
              </h3>
              {savedScenarios.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Save a scenario on the left to compare multiple paths side by
                  side.
                </p>
              ) : (
                <div className="space-y-2 text-xs">
                  {savedScenarios.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 flex items-center justify-between gap-2"
                    >
                      <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={compareIds.includes(s.id)}
                          onChange={(e) =>
                            setCompareIds((prev) =>
                              e.target.checked
                                ? [...prev, s.id]
                                : prev.filter((x) => x !== s.id)
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setAdj(s.adjustments)}
                          className="font-semibold text-slate-800 hover:text-indigo-600 truncate text-left"
                        >
                          {s.name}
                        </button>
                      </label>
                      <button
                        type="button"
                        onClick={() => deleteScenario(s.id)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                        aria-label={`Delete ${s.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="simulator"
      />
    </div>
  );
}
