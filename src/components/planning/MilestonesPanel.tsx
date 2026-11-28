"use client";

import { useState } from "react";
import { CheckCircle2, Flag, Plus, Trash2, Trophy } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCompactINR, formatINR } from "@/lib/utils";

export interface MilestonesTrackerData {
  currentNetWorthInr: number;
  previousMilestone: {
    id: number;
    label: string;
    targetAmount: number;
  } | null;
  nextMilestone: {
    id: number;
    label: string;
    targetAmount: number;
    remainingAmount: number;
    estimatedDate: string | null;
    estimatedMonths: number | null;
  } | null;
  progressToNextPct: number;
  milestones: Array<{
    id: number;
    label: string;
    targetAmount: number;
    isPreset: boolean;
    achieved: boolean;
    progressPct: number;
    remainingAmount: number;
    estimatedMonths: number | null;
    estimatedDate: string | null;
    notes: string;
  }>;
  breakdown: {
    investmentPortfolioInr: number;
    otherFinancialAssetsInr: number;
    physicalAssetsInr: number;
    totalLiabilitiesInr: number;
  };
  snapshots: Array<{
    id: number;
    date: string;
    totalAssets: number;
    totalLiabilities: number | null;
    liabilitiesKnown: boolean;
    netWorth: number | null;
  }>;
}

export function MilestonesPanel({
  data,
  onReload,
}: {
  data: MilestonesTrackerData;
  onReload: () => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/planning/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          targetAmount: Number(targetAmount),
          notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || "Failed to create milestone");
      } else {
        setLabel("");
        setTargetAmount("");
        setNotes("");
        await onReload();
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteMilestone(id: number) {
    await fetch(`/api/planning/milestones?id=${id}`, { method: "DELETE" });
    await onReload();
  }

  const nextPct = Math.round(data.progressToNextPct * 100);
  const chartData = data.snapshots.map((s) => ({
    date: s.date,
    value: s.netWorth !== null ? s.netWorth : s.totalAssets,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
            Authoritative Net Worth
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {formatINR(data.currentNetWorthInr)}
          </div>
          <div className="text-[11px] text-slate-300 mt-1 tabular-nums">
            Inv {formatCompactINR(data.breakdown.investmentPortfolioInr)} + Other{" "}
            {formatCompactINR(
              data.breakdown.otherFinancialAssetsInr +
                data.breakdown.physicalAssetsInr
            )}{" "}
            − Debt {formatCompactINR(data.breakdown.totalLiabilitiesInr)}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
          <div className="text-[11px] uppercase text-slate-500 font-semibold">
            Previous Milestone
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1 flex items-center gap-1.5">
            <Trophy className="h-5 w-5 text-emerald-600" />
            {data.previousMilestone ? data.previousMilestone.label : "Starting"}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {data.previousMilestone
              ? formatINR(data.previousMilestone.targetAmount)
              : "First milestone ahead"}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
          <div className="text-[11px] uppercase text-slate-500 font-semibold">
            Next Milestone
          </div>
          <div className="text-xl font-bold text-indigo-700 mt-1 flex items-center gap-1.5">
            <Flag className="h-5 w-5 text-indigo-600" />
            {data.nextMilestone ? data.nextMilestone.label : "All Achieved!"}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {data.nextMilestone
              ? `${formatCompactINR(data.nextMilestone.remainingAmount)} remaining`
              : "Add a custom stretch target"}
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
          <div className="text-[11px] uppercase text-slate-500 font-semibold">
            Estimated Achievement
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
            {data.nextMilestone?.estimatedDate ?? "—"}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {data.nextMilestone?.estimatedMonths !== null &&
            data.nextMilestone?.estimatedMonths !== undefined
              ? `~${data.nextMilestone.estimatedMonths} months at planned SIP & return`
              : "Add SIPs or assets to estimate"}
          </div>
        </div>
      </div>

      {data.nextMilestone && (
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
            <span>
              Progress from{" "}
              {data.previousMilestone ? data.previousMilestone.label : "₹0"} to{" "}
              {data.nextMilestone.label}
            </span>
            <span className="tabular-nums text-indigo-700">{nextPct}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500"
              style={{ width: `${nextPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
          <h3 className="font-semibold text-slate-900">
            Historical Net Worth Trend
          </h3>
          {chartData.length === 0 ? (
            <p className="text-xs text-slate-400 py-14 text-center">
              No historical net worth snapshots recorded yet.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCompactINR(Number(v))}
                  />
                  <Tooltip
                    formatter={(val) => formatINR(Number(val ?? 0))}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Net Worth"
                    stroke="#4f46e5"
                    fill="#4f46e522"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
          <h3 className="font-semibold text-slate-900">
            Add Custom Milestone
          </h3>
          {errorMsg && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}
          <form onSubmit={addMilestone} className="space-y-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Milestone Label *
              </label>
              <input
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. ₹3 Crore Independence"
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Target Net Worth (INR) *
              </label>
              <input
                required
                type="number"
                min="1"
                step="any"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="e.g. 30000000"
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Notes
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note"
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 text-xs font-semibold"
            >
              <Plus className="h-4 w-4" />
              {saving ? "Adding..." : "Add Milestone"}
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
        <h3 className="font-semibold text-slate-900 mb-4">
          All Wealth Milestones
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.milestones.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border p-4 space-y-2 ${
                m.achieved
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-slate-200 bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {m.achieved ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Flag className="h-4 w-4 text-indigo-600 shrink-0" />
                  )}
                  <span className="font-semibold text-sm text-slate-900">
                    {m.label}
                  </span>
                </div>
                {!m.isPreset && (
                  <button
                    type="button"
                    onClick={() => deleteMilestone(m.id)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                    aria-label={`Delete ${m.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                <span>Target: {formatCompactINR(m.targetAmount)}</span>
                <span className="font-semibold">
                  {Math.round(m.progressPct * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${
                    m.achieved ? "bg-emerald-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${Math.round(m.progressPct * 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                {m.achieved
                  ? "Milestone achieved"
                  : m.estimatedDate
                    ? `Est. ${m.estimatedDate} (${m.estimatedMonths} mo) • ${formatCompactINR(m.remainingAmount)} left`
                    : `${formatCompactINR(m.remainingAmount)} remaining`}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
