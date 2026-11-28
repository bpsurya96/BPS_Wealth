"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  PieChart as PieIcon,
  Save,
  ShieldAlert,
} from "lucide-react";
import {
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
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import {
  ASSET_CLASS_LABELS,
  formatCompactINR,
  formatINR,
} from "@/lib/utils";
import type { LiquidityBucket } from "@/lib/wealth-calculations";

interface RiskResponse {
  usdInrRate: number;
  thresholds: {
    holdingWarnPct: number;
    categoryWarnPct: number;
    currencyWarnPct: number;
  };
  risk: {
    totalPortfolioInr: number;
    liquidAssetsInr: number;
    liquidAssetsPct: number;
    cashRegisterInr: number;
    topFiveSharePct: number;
    topFiveHoldings: Array<{
      id: number;
      name: string;
      assetClass: string;
      currency: string;
      currentInr: number;
      pct: number;
    }>;
    holdingConcentration: Array<{
      id: number;
      name: string;
      assetClass: string;
      currency: string;
      currentInr: number;
      pct: number;
      bucket: LiquidityBucket;
      label: string;
      reason: string;
      maturityDate: string;
    }>;
    categoryExposure: Array<{
      assetClass: string;
      amountInr: number;
      pct: number;
    }>;
    currencyExposure: Array<{
      currency: string;
      amountInr: number;
      pct: number;
    }>;
    concentrationAlerts: Array<{
      type: "holding" | "category" | "currency";
      subject: string;
      pct: number;
      thresholdPct: number;
      message: string;
    }>;
    liquidityBreakdown: Array<{
      bucket: LiquidityBucket;
      label: string;
      amountInr: number;
      pct: number;
    }>;
    maturityMismatches: Array<{
      goalId: number;
      goalName: string;
      goalTargetDate: string;
      holdingId: number;
      holdingName: string;
      holdingMaturityDate: string;
      allocatedInr: number;
    }>;
    goalRisks: Array<{
      goalId: number;
      goalName: string;
      category: string;
      targetDate: string;
      monthsToGoal: number | null;
      totalAllocatedInr: number;
      fundingGap: number;
      maxHoldingConcentrationPct: number;
      volatileExposurePct: number;
      illiquidExposurePct: number;
      maturingBeforeGoalInr: number;
      liquiditySuitability: "good" | "caution" | "mismatch" | "unlinked";
      flags: string[];
    }>;
  };
  upcomingMaturities: Array<{
    id: number;
    name: string;
    assetClass: string;
    maturityDate: string;
    currentInr: number;
    daysRemaining: number;
  }>;
}

const COLORS = [
  "#6366f1",
  "#10b981",
  "#0ea5e9",
  "#f59e0b",
  "#ec4899",
  "#64748b",
];

const SUITABILITY_STYLES: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800",
  caution: "bg-amber-100 text-amber-800",
  mismatch: "bg-rose-100 text-rose-800",
  unlinked: "bg-slate-100 text-slate-600",
};

export default function PortfolioRiskPage() {
  const [data, setData] = useState<RiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const [holdingWarn, setHoldingWarn] = useState("25");
  const [catWarn, setCatWarn] = useState("45");
  const [currWarn, setCurrWarn] = useState("35");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/planning/risk", { cache: "no-store" });
      if (res.ok) {
        const json: RiskResponse = await res.json();
        setData(json);
        setHoldingWarn(String(json.thresholds.holdingWarnPct));
        setCatWarn(String(json.thresholds.categoryWarnPct));
        setCurrWarn(String(json.thresholds.currencyWarnPct));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveThresholds(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast("");
    try {
      const res = await fetch("/api/planning/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concentrationHoldingWarnPct: Number(holdingWarn || 25),
          concentrationCategoryWarnPct: Number(catWarn || 45),
          concentrationCurrencyWarnPct: Number(currWarn || 35),
        }),
      });
      if (res.ok) {
        setToast("Updated configurable concentration warning thresholds");
        await load();
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

  const r = data.risk;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Portfolio Concentration & Liquidity Analysis
        </h1>
        <p className="text-sm text-slate-500">
          Informational risk indicators based on your actual holdings,
          currencies, maturity dates, and goal allocations.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-800">
          {toast}
        </div>
      )}

      <AiInsightBanner scope="portfolio-risk" onAskAi={() => setAiOpen(true)} />

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] uppercase text-slate-500 font-semibold">
            Liquid Portfolio Assets
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1 tabular-nums">
            {formatCompactINR(r.liquidAssetsInr)} ({r.liquidAssetsPct.toFixed(1)}
            %)
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            + {formatCompactINR(r.cashRegisterInr)} Cash / Bank Register
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] uppercase text-slate-500 font-semibold">
            Top 5 Holdings Share
          </div>
          <div className="text-xl font-bold text-indigo-700 mt-1 tabular-nums">
            {r.topFiveSharePct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {r.holdingConcentration.length} active holdings
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] uppercase text-slate-500 font-semibold">
            Concentration Alerts
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
            {r.concentrationAlerts.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Based on your configured thresholds
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs">
          <div className="text-[11px] uppercase text-slate-500 font-semibold">
            Goal Maturity Mismatches
          </div>
          <div className="text-xl font-bold text-amber-700 mt-1 tabular-nums">
            {r.maturityMismatches.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Holdings maturing after goal date
          </div>
        </div>
      </div>

      {/* Configurable Thresholds + Informational Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={saveThresholds}
          className="lg:col-span-5 rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3 text-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-indigo-600" />
              Warning Thresholds (%)
            </h2>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 font-semibold"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-slate-600 mb-1">Single Holding</label>
              <input
                type="number"
                min="5"
                max="100"
                step="1"
                value={holdingWarn}
                onChange={(e) => setHoldingWarn(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Asset Class</label>
              <input
                type="number"
                min="5"
                max="100"
                step="1"
                value={catWarn}
                onChange={(e) => setCatWarn(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1">Non-INR FX</label>
              <input
                type="number"
                min="5"
                max="100"
                step="1"
                value={currWarn}
                onChange={(e) => setCurrWarn(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-2.5 py-2"
              />
            </div>
          </div>
        </form>

        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-2.5">
          <h2 className="font-semibold text-sm text-slate-900">
            Informational Concentration Indicators
          </h2>
          {r.concentrationAlerts.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-emerald-700 py-2">
              <CheckCircle2 className="h-4 w-4" />
              No holding, asset class, or non-INR currency exceeds your
              configured thresholds.
            </div>
          ) : (
            <div className="space-y-2">
              {r.concentrationAlerts.map((a, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 flex items-center gap-2"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>{a.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Charts: Category Exposure & Liquidity Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
            <PieIcon className="h-4 w-4 text-indigo-600" />
            Exposure by Asset Category & Currency
          </h2>
          {r.categoryExposure.length === 0 ? (
            <p className="text-xs text-slate-400 py-12 text-center">
              No active holdings recorded.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={r.categoryExposure.map((c) => ({
                        name:
                          ASSET_CLASS_LABELS[c.assetClass] ?? c.assetClass,
                        value: c.amountInr,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={78}
                    >
                      {r.categoryExposure.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatINR(Number(v ?? 0))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-xs">
                {r.categoryExposure.map((c, idx) => (
                  <div
                    key={c.assetClass}
                    className="flex items-center justify-between"
                  >
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: COLORS[idx % COLORS.length],
                        }}
                      />
                      {ASSET_CLASS_LABELS[c.assetClass] ?? c.assetClass}
                    </span>
                    <span className="tabular-nums font-medium">
                      {c.pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">
                    Currency Exposure
                  </div>
                  {r.currencyExposure.map((cur) => (
                    <div
                      key={cur.currency}
                      className="flex items-center justify-between text-slate-600"
                    >
                      <span>{cur.currency}</span>
                      <span className="tabular-nums font-medium">
                        {formatCompactINR(cur.amountInr)} ({cur.pct.toFixed(1)}
                        %)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
            <Droplets className="h-4 w-4 text-sky-600" />
            Portfolio Liquidity Breakdown
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.liquidityBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => formatCompactINR(Number(v))}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
                <Bar dataKey="amountInr" name="Value" fill="#0ea5e9" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-500">
            PPF, NPS, and ESOPs are classified as Restricted / Locked unless
            matured. FDs/RDs with future maturity dates are Maturity-Based.
          </p>
        </div>
      </div>

      {/* Top 5 & Full Holding Concentration Table */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
        <h2 className="font-semibold text-slate-900 text-sm">
          Holding Concentration & Liquidity Classification
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-left">
                <th className="py-2">Holding</th>
                <th className="py-2">Category</th>
                <th className="py-2">Currency</th>
                <th className="py-2 text-right">Value (INR)</th>
                <th className="py-2 text-right">Share %</th>
                <th className="py-2">Liquidity</th>
                <th className="py-2">Maturity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.holdingConcentration.map((h) => (
                <tr key={h.id}>
                  <td className="py-2 font-medium text-slate-900">
                    <Link
                      href={`/investments/${h.id}`}
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {h.name}
                    </Link>
                  </td>
                  <td className="py-2 text-slate-600">
                    {ASSET_CLASS_LABELS[h.assetClass] ?? h.assetClass}
                  </td>
                  <td className="py-2 text-slate-600">{h.currency}</td>
                  <td className="py-2 text-right tabular-nums font-medium">
                    {formatINR(h.currentInr)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {h.pct.toFixed(1)}%
                  </td>
                  <td className="py-2">
                    <span
                      className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold"
                      title={h.reason}
                    >
                      {h.label}
                    </span>
                  </td>
                  <td className="py-2 text-slate-500">
                    {h.maturityDate || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Goal-Specific Risk & Maturity Mismatch */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">
            Goal-Specific Risk & Liquidity Alignment
          </h2>
          <Link
            href="/goals"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Adjust Allocations →
          </Link>
        </div>
        {r.goalRisks.length === 0 ? (
          <p className="text-xs text-slate-400">
            Create financial goals and link holdings to inspect goal-level
            concentration and liquidity alignment.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {r.goalRisks.map((g) => (
              <div
                key={g.goalId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">
                    {g.goalName}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      SUITABILITY_STYLES[g.liquiditySuitability]
                    }`}
                  >
                    {g.liquiditySuitability}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 tabular-nums">
                  <span>
                    Allocated: {formatCompactINR(g.totalAllocatedInr)}
                  </span>
                  <span>Funding Gap: {formatCompactINR(g.fundingGap)}</span>
                  <span>
                    Volatile Exp.: {g.volatileExposurePct.toFixed(0)}%
                  </span>
                  <span>
                    Illiquid Exp.: {g.illiquidExposurePct.toFixed(0)}%
                  </span>
                </div>
                {g.flags.length > 0 && (
                  <ul className="space-y-1 text-[11px] text-amber-800 pt-1 border-t border-slate-200">
                    {g.flags.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="portfolio-risk"
      />
    </div>
  );
}
