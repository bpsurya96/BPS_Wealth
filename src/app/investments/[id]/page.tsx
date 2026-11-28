"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR, formatPercent, formatUSD } from "@/lib/utils";
import {
  EsopEntry,
  EsopSchedulePanel,
  EsopSummary,
} from "@/components/EsopSchedulePanel";

interface HoldingDetail {
  id: number;
  name: string;
  assetClass: string;
  currency: string;
  platform: string;
  schemeCode: string;
  ticker: string;
  plannedSip: number;
  investedAmount: number;
  currentValue: number;
  units: number;
  avgNav: number;
  currentNav: number;
  interestRate: number;
  maturityDate: string;
  tenureMonths: number;
  status: string;
  notes: string;
}

interface TxnRow {
  id: number;
  date: string;
  type: string;
  amount: number;
  currency: string;
  navOrPrice: number;
  units: number;
  remarks: string;
}

interface MonthlySummaryRow {
  month: string;
  invested: number;
  units: number;
  txCount: number;
}

export default function InvestmentDetailPage() {
  const params = useParams<{ id: string }>();
  const holdingId = params?.id;

  const [holding, setHolding] = useState<HoldingDetail | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummaryRow[]>([]);
  const [xirr, setXirr] = useState<number | null>(null);
  const [usdInrRate, setUsdInrRate] = useState(84.5);
  const [esopEntries, setEsopEntries] = useState<EsopEntry[]>([]);
  const [esopSummary, setEsopSummary] = useState<EsopSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "sip",
    amount: "",
    navOrPrice: "",
    units: "",
    remarks: "",
  });

  const [editDetails, setEditDetails] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    maturityDate: "",
    interestRate: "",
    platform: "",
    status: "active",
    notes: "",
  });

  const load = useCallback(async () => {
    if (!holdingId) return;
    try {
      const res = await fetch(`/api/investments/${holdingId}/transactions`, {
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        setHolding(json.holding);
        setTxns(json.transactions ?? []);
        setMonthly(json.monthlySummary ?? []);
        setXirr(json.xirr ?? null);
        setUsdInrRate(json.usdInrRate ?? 84.5);
        if (json.holding?.assetClass === "esop") {
          const esopRes = await fetch(`/api/investments/${holdingId}/esop`, {
            cache: "no-store",
          });
          if (esopRes.ok) {
            const esopJson = await esopRes.json();
            setEsopEntries(esopJson.entries ?? []);
            setEsopSummary(esopJson.summary ?? null);
          }
        }
        if (json.holding) {
          setDetailsForm({
            maturityDate: json.holding.maturityDate || "",
            interestRate:
              json.holding.interestRate > 0
                ? String(json.holding.interestRate)
                : "",
            platform: json.holding.platform || "",
            status: json.holding.status || "active",
            notes: json.holding.notes || "",
          });
        }
        setForm((prev) => ({
          ...prev,
          amount:
            prev.amount ||
            (json.holding?.plannedSip > 0
              ? String(json.holding.plannedSip)
              : ""),
          navOrPrice:
            prev.navOrPrice ||
            (json.holding?.currentNav > 0
              ? String(json.holding.currentNav)
              : ""),
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [holdingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!holdingId) return;
    const res = await fetch("/api/investments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Number(holdingId),
        maturityDate: detailsForm.maturityDate,
        interestRate: Number(detailsForm.interestRate || 0),
        platform: detailsForm.platform,
        status: detailsForm.status,
        notes: detailsForm.notes,
      }),
    });
    if (res.ok) {
      setEditDetails(false);
      await load();
    }
  }

  async function logTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!holdingId) return;
    const res = await fetch(`/api/investments/${holdingId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount || 0),
        navOrPrice: Number(form.navOrPrice || 0),
        units: form.units ? Number(form.units) : undefined,
      }),
    });
    if (res.ok) {
      setForm((prev) => ({ ...prev, units: "", remarks: "" }));
      await load();
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-sm text-slate-400">
        Loading investment details...
      </div>
    );
  }

  if (!holding) {
    return (
      <div className="space-y-3">
        <Link
          href="/investments"
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Investments
        </Link>
        <p className="text-slate-600">Holding not found.</p>
      </div>
    );
  }

  const fx = holding.currency === "USD" ? usdInrRate : 1;
  const currentNative =
    holding.units > 0 && holding.currentNav > 0
      ? holding.units * holding.currentNav
      : holding.currentValue;
  const currentInr = currentNative * fx;
  const investedInr = holding.investedAmount * fx;
  const isUnpricedEsop = holding.assetClass === "esop" && currentInr === 0;
  const gainInr = isUnpricedEsop ? 0 : currentInr - investedInr;
  const gainPct =
    isUnpricedEsop || investedInr <= 0 ? 0 : gainInr / investedInr;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link
            href="/investments"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Investments
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{holding.name}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {holding.platform || holding.currency}
            {holding.interestRate > 0 ? ` • ${holding.interestRate}% p.a.` : ""}
            {holding.maturityDate ? ` • Matures ${holding.maturityDate}` : ""}
            {holding.schemeCode ? ` • AMFI ${holding.schemeCode}` : ""}
            {holding.ticker ? ` • ${holding.ticker}` : ""}
            {holding.status !== "active" ? ` • ${holding.status.toUpperCase()}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditDetails((v) => !v)}
          className="self-start sm:self-auto rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
        >
          {editDetails ? "Close Editor" : "Edit Maturity / Rate / Details"}
        </button>
      </div>

      {editDetails && (
        <form
          onSubmit={saveDetails}
          className="rounded-2xl bg-white border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs shadow-xs"
        >
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Platform / Bank
            </label>
            <input
              value={detailsForm.platform}
              onChange={(e) =>
                setDetailsForm({ ...detailsForm, platform: e.target.value })
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Maturity Date
            </label>
            <input
              type="date"
              value={detailsForm.maturityDate}
              onChange={(e) =>
                setDetailsForm({ ...detailsForm, maturityDate: e.target.value })
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Interest Rate (%)
            </label>
            <input
              type="number"
              step="any"
              value={detailsForm.interestRate}
              onChange={(e) =>
                setDetailsForm({ ...detailsForm, interestRate: e.target.value })
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              Status
            </label>
            <select
              value={detailsForm.status}
              onChange={(e) =>
                setDetailsForm({ ...detailsForm, status: e.target.value })
              }
              className="w-full rounded-xl border border-slate-200 px-3 py-1.5"
            >
              <option value="active">Active</option>
              <option value="matured">Matured</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3 py-1.5"
            >
              Save Changes
            </button>
          </div>
        </form>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Invested (INR)</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {formatINR(investedInr)}
          </div>
          {holding.currency === "USD" && (
            <div className="text-xs text-slate-500 tabular-nums">
              {formatUSD(holding.investedAmount)}
            </div>
          )}
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Current Value (INR)</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {formatINR(currentInr)}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Net Gain / XIRR</div>
          <div
            className={`text-lg font-bold tabular-nums mt-1 ${
              gainInr >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {gainInr >= 0 ? "+" : ""}
            {formatINR(gainInr)}
          </div>
          <div className="text-xs text-indigo-600 font-medium">
            {formatPercent(gainPct)}
            {xirr !== null ? ` • XIRR ${formatPercent(xirr)}` : ""}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Units & Avg NAV</div>
          <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
            {holding.units.toFixed(3)}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            Avg {holding.avgNav.toFixed(2)} vs Live{" "}
            {holding.currentNav.toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-4">
          <div className="text-xs text-slate-500">Planned Monthly SIP</div>
          <div className="text-lg font-bold text-emerald-700 tabular-nums mt-1">
            {holding.currency === "USD"
              ? formatUSD(holding.plannedSip, 0)
              : formatINR(holding.plannedSip)}
          </div>
          <div className="text-xs text-slate-500">
            {monthly.length} months active
          </div>
        </div>
      </div>

      {holding.assetClass === "esop" && holdingId && (
        <EsopSchedulePanel
          holdingId={holdingId}
          currency={holding.currency}
          usdInrRate={usdInrRate}
          entries={esopEntries}
          summary={esopSummary}
          onUpdated={load}
        />
      )}

      {/* Monthly SIP Bar Chart */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-indigo-600" />
          <h2 className="font-semibold text-slate-900">
            All-Months SIP Contribution History
          </h2>
        </div>
        {monthly.length === 0 ? (
          <p className="text-sm text-slate-400 py-10 text-center">
            No monthly SIP entries recorded for this holding yet.
          </p>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v) =>
                    holding.currency === "USD"
                      ? formatUSD(Number(v ?? 0))
                      : formatINR(Number(v ?? 0))
                  }
                />
                <Bar
                  dataKey="invested"
                  name="Monthly Invested"
                  fill="#6366f1"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Log New SIP / Transaction */}
      <form
        onSubmit={logTransaction}
        className="rounded-2xl bg-white border border-slate-200 p-4 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs shadow-xs"
      >
        <input
          type="date"
          required
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="rounded-xl border border-slate-200 px-3 py-2"
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="rounded-xl border border-slate-200 px-3 py-2"
        >
          <option value="sip">SIP</option>
          <option value="buy">Buy</option>
          <option value="installment">Installment</option>
          <option value="sell">Sell</option>
          <option value="dividend">Dividend</option>
        </select>
        <input
          type="number"
          step="any"
          required
          placeholder={`Amount (${holding.currency})`}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="rounded-xl border border-slate-200 px-3 py-2"
        />
        <input
          type="number"
          step="any"
          placeholder="NAV / Price"
          value={form.navOrPrice}
          onChange={(e) => setForm({ ...form, navOrPrice: e.target.value })}
          className="rounded-xl border border-slate-200 px-3 py-2"
        />
        <input
          type="number"
          step="any"
          placeholder="Units (auto)"
          value={form.units}
          onChange={(e) => setForm({ ...form, units: e.target.value })}
          className="rounded-xl border border-slate-200 px-3 py-2"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Log Entry
        </button>
      </form>

      {/* Side-by-side Month Summary + Full Txn Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-600">
            Month-by-Month Totals ({monthly.length})
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...monthly].reverse().map((m) => (
                  <tr key={m.month}>
                    <td className="px-3 py-2 tabular-nums font-medium">
                      {m.month}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {holding.currency === "USD"
                        ? formatUSD(m.invested)
                        : formatINR(m.invested)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {m.units.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-600">
            All Individual Transactions ({txns.length})
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">NAV</th>
                  <th className="px-3 py-2 text-right">Units</th>
                  <th className="px-3 py-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {txns.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 tabular-nums">{t.date}</td>
                    <td className="px-3 py-2 uppercase">{t.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {t.currency === "USD"
                        ? formatUSD(t.amount)
                        : formatINR(t.amount, 2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.navOrPrice > 0 ? t.navOrPrice.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.units > 0 ? t.units.toFixed(4) : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{t.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
