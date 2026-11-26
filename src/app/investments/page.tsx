"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  RefreshCw,
  Trash2,
  ArrowUpRight,
  CalendarRange,
  LayoutList,
  FolderPlus,
  X,
} from "lucide-react";
import { formatINR, formatPercent, formatUSD } from "@/lib/utils";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";

interface Category {
  id: number;
  slug: string;
  label: string;
  color: string;
  supportsSip: boolean;
  isSystem: boolean;
}

interface Holding {
  id: number;
  name: string;
  assetClass: string;
  currency: string;
  schemeCode: string;
  ticker: string;
  platform: string;
  plannedSip: number;
  investedAmount: number;
  currentValue: number;
  units: number;
  avgNav: number;
  currentNav: number;
  interestRate: number;
  maturityDate: string;
  isEmergencyFund: boolean;
  status: string;
  investedInr: number;
  currentInr: number;
  gainInr: number;
  gainPct: number;
  xirr: number | null;
  txnCount: number;
}

interface MatrixData {
  months: string[];
  rows: Array<{
    holdingId: number;
    name: string;
    assetClass: string;
    plannedSip: number;
    rowTotalInr: number;
    monthly: Record<string, { amountInr: number; units: number; count: number }>;
  }>;
  monthTotals: Record<string, number>;
}

export default function InvestmentsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [usdInrRate, setUsdInrRate] = useState(84.5);
  const [viewMode, setViewMode] = useState<"holdings" | "matrix">("holdings");
  const [selectedCat, setSelectedCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [newCat, setNewCat] = useState({
    label: "",
    color: "#6366f1",
    supportsSip: true,
  });

  const [newForm, setNewForm] = useState({
    name: "",
    assetClass: "mutual_fund",
    currency: "INR",
    schemeCode: "",
    ticker: "",
    platform: "",
    plannedSip: "",
    investedAmount: "",
    units: "",
    currentNav: "",
    interestRate: "",
    maturityDate: "",
    isEmergencyFund: false,
  });

  const load = useCallback(async () => {
    try {
      const [invRes, catRes, matRes] = await Promise.all([
        fetch("/api/investments", { cache: "no-store" }),
        fetch("/api/categories", { cache: "no-store" }),
        fetch("/api/investments/matrix", { cache: "no-store" }),
      ]);
      if (invRes.ok) {
        const json = await invRes.json();
        setHoldings(json.holdings ?? []);
        setUsdInrRate(json.usdInrRate ?? 84.5);
      }
      if (catRes.ok) {
        const json = await catRes.json();
        setCategories(json.categories ?? []);
      }
      if (matRes.ok) {
        setMatrix(await matRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      await fetch("/api/prices/refresh", { method: "POST" });
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCat),
    });
    if (res.ok) {
      const json = await res.json();
      setShowAddCat(false);
      setNewCat({ label: "", color: "#6366f1", supportsSip: true });
      if (json.category?.slug) {
        setNewForm((prev) => ({ ...prev, assetClass: json.category.slug }));
      }
      await load();
    }
  }

  async function handleCreateHolding(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/investments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newForm,
        plannedSip: Number(newForm.plannedSip || 0),
        investedAmount: Number(newForm.investedAmount || 0),
        units: Number(newForm.units || 0),
        currentNav: Number(newForm.currentNav || 0),
        interestRate: Number(newForm.interestRate || 0),
      }),
    });
    if (res.ok) {
      setShowAdd(false);
      setNewForm({
        name: "",
        assetClass: categories[0]?.slug || "mutual_fund",
        currency: "INR",
        schemeCode: "",
        ticker: "",
        platform: "",
        plannedSip: "",
        investedAmount: "",
        units: "",
        currentNav: "",
        interestRate: "",
        maturityDate: "",
        isEmergencyFund: false,
      });
      await load();
    }
  }

  async function deleteHolding(id: number) {
    await fetch(`/api/investments?id=${id}`, { method: "DELETE" });
    await load();
  }

  const catMap = new Map(categories.map((c) => [c.slug, c]));

  const filtered = holdings.filter((h) => {
    if (selectedCat === "all") return true;
    if (selectedCat === "emergency") {
      return h.isEmergencyFund || h.assetClass === "fd" || h.assetClass === "rd";
    }
    return h.assetClass === selectedCat;
  });

  const totalInvested = filtered.reduce((s, h) => s + h.investedInr, 0);
  const totalCurrent = filtered.reduce((s, h) => s + h.currentInr, 0);
  const totalSip = filtered.reduce(
    (s, h) => s + h.plannedSip * (h.currency === "USD" ? usdInrRate : 1),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Investments & SIP Deep Dive
          </h1>
          <p className="text-sm text-slate-500">
            Generic categories (MF, Stocks, NPS, PPF, or any custom asset) •
            Click any holding for all-months SIP history
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddCat(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-700"
          >
            <FolderPlus className="h-4 w-4" />
            New Category
          </button>
          <button
            type="button"
            onClick={handleRefreshPrices}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Live NAVs
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-emerald-600 hover:opacity-95 text-white px-3.5 py-2 text-xs font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Investment
          </button>
        </div>
      </div>

      <AiInsightBanner scope="investments" onAskAi={() => setAiOpen(true)} />

      {/* View Switcher & Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1 w-fit">
          <button
            type="button"
            onClick={() => setViewMode("holdings")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === "holdings"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Holdings ({holdings.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("matrix")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === "matrix"
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:text-slate-900"
              }`}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            All-Months SIP Matrix ({matrix?.months.length ?? 0} mo)
          </button>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-slate-600 tabular-nums bg-white border border-slate-200 rounded-xl px-4 py-2">
          <span>
            Invested:{" "}
            <strong className="text-slate-900">
              {formatINR(totalInvested)}
            </strong>
          </span>
          <span>
            Current:{" "}
            <strong className="text-slate-900">
              {formatINR(totalCurrent)}
            </strong>
          </span>
          <span>
            Planned SIP:{" "}
            <strong className="text-emerald-700">
              {formatINR(totalSip)}/mo
            </strong>
          </span>
        </div>
      </div>

      {viewMode === "holdings" ? (
        <>
          {/* Dynamic Category Pills */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCat("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${selectedCat === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
            >
              All ({holdings.length})
            </button>
            {categories.map((cat) => {
              const count = holdings.filter(
                (h) => h.assetClass === cat.slug
              ).length;
              if (count === 0 && cat.isSystem) return null;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => setSelectedCat(cat.slug)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${selectedCat === cat.slug
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  {cat.label} ({count})
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedCat("emergency")}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${selectedCat === "emergency"
                  ? "bg-amber-600 text-white"
                  : "bg-white border border-slate-200 text-amber-700 hover:bg-amber-50"
                }`}
            >
              Emergency Fund
            </button>
          </div>

          {/* Holdings Table */}
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Holding</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Planned SIP
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Units / Rate
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Live NAV
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Invested (INR)
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Current (INR)
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Gain / XIRR
                    </th>
                    <th className="px-4 py-3 font-semibold text-right">
                      Deep Dive
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-slate-400"
                      >
                        Loading holdings...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-10 text-center text-slate-400"
                      >
                        No holdings in this category yet.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((h) => {
                      const cat = catMap.get(h.assetClass);
                      return (
                        <tr key={h.id} className="hover:bg-indigo-50/30">
                          <td className="px-4 py-3">
                            <Link
                              href={`/investments/${h.id}`}
                              className="font-semibold text-slate-900 hover:text-indigo-700"
                            >
                              {h.name}
                            </Link>
                            <div className="text-xs text-slate-400">
                              {h.platform || h.currency}
                              {h.txnCount > 0
                                ? ` • ${h.txnCount} txns`
                                : ""}
                              {h.maturityDate
                                ? ` • Matures ${h.maturityDate}`
                                : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800"
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor: cat?.color || "#6366f1",
                                }}
                              />
                              {cat?.label ?? h.assetClass}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {h.plannedSip > 0
                              ? h.currency === "USD"
                                ? formatUSD(h.plannedSip, 0)
                                : formatINR(h.plannedSip)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {h.units > 0
                              ? h.units.toFixed(3)
                              : h.interestRate > 0
                                ? `${h.interestRate}%`
                                : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {h.currentNav > 0
                              ? h.currency === "USD"
                                ? formatUSD(h.currentNav)
                                : `₹${h.currentNav.toFixed(2)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                            {formatINR(h.investedInr)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                            {formatINR(h.currentInr)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <div
                              className={`text-xs font-medium ${h.gainInr >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600"
                                }`}
                            >
                              {h.gainInr >= 0 ? "+" : ""}
                              {formatINR(h.gainInr)} ({formatPercent(h.gainPct)})
                            </div>
                            {h.xirr !== null && (
                              <div className="text-[11px] text-indigo-600 font-medium">
                                XIRR {formatPercent(h.xirr)}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <Link
                                href={`/investments/${h.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold"
                              >
                                All Months
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Link>
                              <button
                                type="button"
                                onClick={() => deleteHolding(h.id)}
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                                title="Delete Holding"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* All-Months SIP Matrix View */
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          {!matrix || matrix.months.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              No monthly SIP/investment transactions logged yet. Log SIPs via
              Quick-Log or import your Excel ledger to see every month side by
              side.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-900 text-slate-100 uppercase">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-slate-900 z-10 min-w-[200px]">
                      Investment / SIP
                    </th>
                    <th className="px-3 py-3 text-right min-w-[90px]">
                      Total (INR)
                    </th>
                    {matrix.months.map((m) => (
                      <th
                        key={m}
                        className="px-3 py-3 text-right min-w-[95px] tabular-nums"
                      >
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matrix.rows.map((row) => (
                    <tr key={row.holdingId} className="hover:bg-indigo-50/40">
                      <td className="px-4 py-2.5 sticky left-0 bg-white font-medium text-slate-900 border-r border-slate-100">
                        <Link
                          href={`/investments/${row.holdingId}`}
                          className="hover:text-indigo-600"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-indigo-700 bg-indigo-50/30">
                        {formatINR(row.rowTotalInr)}
                      </td>
                      {matrix.months.map((m) => {
                        const cell = row.monthly[m];
                        return (
                          <td
                            key={m}
                            className="px-3 py-2.5 text-right tabular-nums text-slate-700"
                          >
                            {cell ? (
                              <div>
                                <div className="font-medium text-slate-900">
                                  {formatINR(cell.amountInr)}
                                </div>
                                {cell.units > 0 && (
                                  <div className="text-[10px] text-slate-400">
                                    {cell.units.toFixed(2)}u
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                    <td className="px-4 py-3 sticky left-0 bg-slate-50 text-slate-900">
                      Monthly Total
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                      {formatINR(
                        Object.values(matrix.monthTotals).reduce(
                          (s, v) => s + v,
                          0
                        )
                      )}
                    </td>
                    {matrix.months.map((m) => (
                      <td
                        key={m}
                        className="px-3 py-3 text-right tabular-nums text-emerald-700"
                      >
                        {formatINR(matrix.monthTotals[m] ?? 0)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Custom Category Modal */}
      {showAddCat && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">
                Add Custom Investment Category
              </h2>
              <button
                type="button"
                onClick={() => setShowAddCat(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCategory} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Category Name *
                </label>
                <input
                  required
                  value={newCat.label}
                  onChange={(e) =>
                    setNewCat({ ...newCat, label: e.target.value })
                  }
                  placeholder="e.g. Real Estate, Crypto, SGB, Angel"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Badge Color
                </label>
                <input
                  type="color"
                  value={newCat.color}
                  onChange={(e) =>
                    setNewCat({ ...newCat, color: e.target.value })
                  }
                  className="h-10 w-20 rounded-lg border border-slate-200 p-1"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={newCat.supportsSip}
                  onChange={(e) =>
                    setNewCat({ ...newCat, supportsSip: e.target.checked })
                  }
                />
                Supports monthly SIP / recurring contributions
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddCat(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-medium"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holding Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Add Investment Holding</h2>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateHolding} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Name *
                </label>
                <input
                  required
                  value={newForm.name}
                  onChange={(e) =>
                    setNewForm({ ...newForm, name: e.target.value })
                  }
                  placeholder="e.g. Quant Small Cap, PPF, Sovereign Gold"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Category
                  </label>
                  <select
                    value={newForm.assetClass}
                    onChange={(e) =>
                      setNewForm({ ...newForm, assetClass: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Currency
                  </label>
                  <select
                    value={newForm.currency}
                    onChange={(e) =>
                      setNewForm({ ...newForm, currency: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    AMFI Scheme Code (MF)
                  </label>
                  <input
                    value={newForm.schemeCode}
                    onChange={(e) =>
                      setNewForm({ ...newForm, schemeCode: e.target.value })
                    }
                    placeholder="e.g. 120828"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Ticker (Stocks/US ETF)
                  </label>
                  <input
                    value={newForm.ticker}
                    onChange={(e) =>
                      setNewForm({ ...newForm, ticker: e.target.value })
                    }
                    placeholder="e.g. VOO, GOLDBEES.NS"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Invested Amount
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newForm.investedAmount}
                    onChange={(e) =>
                      setNewForm({ ...newForm, investedAmount: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Planned Monthly SIP
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newForm.plannedSip}
                    onChange={(e) =>
                      setNewForm({ ...newForm, plannedSip: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Total Units
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newForm.units}
                    onChange={(e) =>
                      setNewForm({ ...newForm, units: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Current NAV / Price
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newForm.currentNav}
                    onChange={(e) =>
                      setNewForm({ ...newForm, currentNav: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Platform
                  </label>
                  <input
                    value={newForm.platform}
                    onChange={(e) =>
                      setNewForm({ ...newForm, platform: e.target.value })
                    }
                    placeholder="Groww, INDmoney, Stable Money"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Interest Rate % (FD/RD)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newForm.interestRate}
                    onChange={(e) =>
                      setNewForm({ ...newForm, interestRate: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 pt-1">
                <input
                  type="checkbox"
                  checked={newForm.isEmergencyFund}
                  onChange={(e) =>
                    setNewForm({
                      ...newForm,
                      isEmergencyFund: e.target.checked,
                    })
                  }
                />
                Count toward Emergency Fund target
              </label>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium"
                >
                  Save Holding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="investments"
      />
    </div>
  );
}
