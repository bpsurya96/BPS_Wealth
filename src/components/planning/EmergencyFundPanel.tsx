"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { LIQUIDITY_LABELS, LiquidityBucket } from "@/lib/wealth-calculations";

export interface EmergencyFundData {
  coverageMonthsTarget: number;
  monthlyExpenses: number;
  recommendedCorpus: number;
  actualEmergencyValue: number;
  coverageMonths: number | null;
  remainingAmount: number;
  progressPct: number;
  eligibleHoldings: Array<{
    id: number;
    name: string;
    assetClass: string;
    currentInr: number;
    liquidityBucket: LiquidityBucket;
    source: "holding" | "cash_asset";
  }>;
  excludedHoldings: Array<{
    id: number;
    name: string;
    assetClass: string;
    currentInr: number;
    reason: string;
  }>;
}

export function EmergencyFundPanel({
  emergency,
  onSaveProfile,
}: {
  emergency: EmergencyFundData;
  onSaveProfile: (patch: {
    emergencyMonthsTarget?: number;
    monthlyExpenses?: number;
  }) => Promise<void>;
}) {
  const [monthsTarget, setMonthsTarget] = useState(
    emergency.coverageMonthsTarget
  );
  const [monthlyExpenses, setMonthlyExpenses] = useState(
    emergency.monthlyExpenses > 0 ? String(emergency.monthlyExpenses) : ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave(nextMonths?: number) {
    setSaving(true);
    try {
      await onSaveProfile({
        emergencyMonthsTarget: nextMonths ?? monthsTarget,
        monthlyExpenses: Number(monthlyExpenses || 0),
      });
    } finally {
      setSaving(false);
    }
  }

  const pct = Math.min(100, Math.round(emergency.progressPct * 100));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              {pct >= 100 ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-amber-600" />
              )}
              Emergency Fund Planner
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Only counts genuinely accessible assets (Emergency FDs, RDs, liquid
              funds, and cash). Locked retirement assets (PPF, NPS, ESOP) are
              automatically excluded.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[3, 6, 9, 12].map((m) => (
              <button
                key={m}
                type="button"
                disabled={saving}
                onClick={() => {
                  setMonthsTarget(m);
                  handleSave(m);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  monthsTarget === m
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {m} Months
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
            <div className="text-[11px] font-medium text-slate-500 uppercase">
              Recommended Corpus
            </div>
            <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
              {formatINR(emergency.recommendedCorpus)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {emergency.monthlyExpenses > 0
                ? `${emergency.coverageMonthsTarget} × ${formatCompactINR(emergency.monthlyExpenses)}/mo`
                : "Using configured emergency target"}
            </div>
          </div>

          <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 p-4">
            <div className="text-[11px] font-medium text-emerald-700 uppercase">
              Accessible Emergency Value
            </div>
            <div className="text-xl font-bold text-emerald-950 mt-1 tabular-nums">
              {formatINR(emergency.actualEmergencyValue)}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5">
              Across {emergency.eligibleHoldings.length} eligible source(s)
            </div>
          </div>

          <div className="rounded-xl bg-sky-50/80 border border-sky-100 p-4">
            <div className="text-[11px] font-medium text-sky-700 uppercase">
              Actual Coverage
            </div>
            <div className="text-xl font-bold text-sky-950 mt-1 tabular-nums">
              {emergency.coverageMonths !== null
                ? `${emergency.coverageMonths} months`
                : "Set expenses"}
            </div>
            <div className="text-[11px] text-sky-700 mt-0.5">
              Target: {emergency.coverageMonthsTarget} months
            </div>
          </div>

          <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-4">
            <div className="text-[11px] font-medium text-amber-800 uppercase">
              Remaining Gap
            </div>
            <div className="text-xl font-bold text-amber-950 mt-1 tabular-nums">
              {formatINR(emergency.remainingAmount)}
            </div>
            <div className="text-[11px] text-amber-800 mt-0.5">
              {pct}% funded
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5">
            <span>Emergency Reserve Progress</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${
                pct >= 100
                  ? "bg-emerald-500"
                  : pct >= 60
                    ? "bg-sky-500"
                    : "bg-amber-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="flex flex-col sm:flex-row sm:items-end gap-3 pt-2 border-t border-slate-100"
        >
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Essential Monthly Expenses (INR)
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={monthlyExpenses}
              onChange={(e) => setMonthlyExpenses(e.target.value)}
              placeholder="e.g. 60000"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 text-xs font-semibold"
          >
            {saving ? "Saving..." : "Update Expense Baseline"}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Eligible Accessible Assets ({emergency.eligibleHoldings.length})
          </h3>
          {emergency.eligibleHoldings.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              Mark liquid FDs, RDs, or liquid funds with &quot;Emergency
              Fund&quot; on the Investments page or add Cash / Bank balances in
              the Asset Register.
            </p>
          ) : (
            <div className="space-y-2">
              {emergency.eligibleHoldings.map((item) => (
                <div
                  key={`${item.source}-${item.id}`}
                  className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {item.assetClass.toUpperCase()} •{" "}
                      {LIQUIDITY_LABELS[item.liquidityBucket]}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums text-slate-900">
                    {formatINR(item.currentInr)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
          <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Excluded Illiquid / Restricted Holdings (
            {emergency.excludedHoldings.length})
          </h3>
          {emergency.excludedHoldings.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No restricted retirement holdings are flagged as emergency funds.
            </p>
          ) : (
            <div className="space-y-2">
              {emergency.excludedHoldings.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-amber-950">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-amber-800">
                      {item.reason}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums text-amber-950">
                    {formatINR(item.currentInr)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
