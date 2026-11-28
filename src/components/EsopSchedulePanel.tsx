"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatINR, formatUSD } from "@/lib/utils";

export interface EsopEntry {
  id: number;
  holdingId: number;
  period: number;
  vestingDate: string;
  optionsVested: number;
  cumulativeVested: number;
  exercised: boolean;
  exerciseQuantity: number;
  sharePrice: number;
  strikePrice: number;
  totalPrice: number;
}

export interface EsopSummary {
  totalOptions: number;
  totalExercisedQty: number;
  totalInvested: number;
  totalInvestedInr: number;
  currentValue: number;
  currentValueInr: number;
  profit: number;
  profitInr: number;
}

interface EsopSchedulePanelProps {
  holdingId: string;
  currency: string;
  usdInrRate: number;
  entries: EsopEntry[];
  summary: EsopSummary | null;
  onUpdated: () => Promise<void>;
}

export function EsopSchedulePanel({
  holdingId,
  currency,
  usdInrRate,
  entries,
  summary,
  onUpdated,
}: EsopSchedulePanelProps) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({
    vestingDate: "",
    optionsVested: "",
    sharePrice: entries[0] ? String(entries[0].sharePrice) : "12.5",
    strikePrice: entries[0] ? String(entries[0].strikePrice) : "2.35",
    exercised: false,
  });

  const fmtNative = (val: number) =>
    currency.toUpperCase() === "USD" ? formatUSD(val) : formatINR(val, 2);

  async function toggleExercised(entry: EsopEntry) {
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/investments/${holdingId}/esop`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entry.id,
          exercised: !entry.exercised,
        }),
      });
      if (res.ok) {
        await onUpdated();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch(`/api/investments/${holdingId}/esop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vestingDate: newRow.vestingDate,
          optionsVested: Number(newRow.optionsVested || 0),
          sharePrice: Number(newRow.sharePrice || 0),
          strikePrice: Number(newRow.strikePrice || 0),
          exercised: newRow.exercised,
        }),
      });
      if (res.ok) {
        setNewRow((prev) => ({
          ...prev,
          vestingDate: "",
          optionsVested: "",
          exercised: false,
        }));
        await onUpdated();
      }
    } finally {
      setAdding(false);
    }
  }

  async function deleteEntry(entryId: number) {
    setBusyId(entryId);
    try {
      const res = await fetch(
        `/api/investments/${holdingId}/esop?entryId=${entryId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await onUpdated();
      }
    } finally {
      setBusyId(null);
    }
  }

  const totalVested = summary?.totalOptions ?? 0;
  const totalExercised = summary?.totalExercisedQty ?? 0;
  const totalInvested = summary?.totalInvested ?? 0;
  const fx = currency.toUpperCase() === "USD" ? usdInrRate : 1;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-sm text-slate-900">
            ESOP Vesting &amp; Exercise Schedule ({entries.length} periods)
          </h2>
          <p className="text-xs text-slate-500">
            Check &ldquo;Exercised&rdquo; on any date to add its vested options
            to Exercise Quantity and Total Invested (Share + Strike = Total).
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs tabular-nums">
          <span className="rounded-lg bg-indigo-50 border border-indigo-200 px-2.5 py-1 font-medium text-indigo-800">
            Exercised: {totalExercised} / {totalVested}
          </span>
          <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 font-semibold text-emerald-800">
            Total Invested: {fmtNative(totalInvested)} (
            {formatINR(totalInvested * fx)})
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5">Period</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5 text-right">Option Vested</th>
              <th className="px-3 py-2.5 text-right">Cumulative Vested</th>
              <th className="px-3 py-2.5 text-center">Exercised?</th>
              <th className="px-3 py-2.5 text-right">Exercise Quantity</th>
              <th className="px-3 py-2.5 text-right">Share Price</th>
              <th className="px-3 py-2.5 text-right">Strike Price</th>
              <th className="px-3 py-2.5 text-right">Total Price</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const unitTotal = entry.sharePrice + entry.strikePrice;
              return (
                <tr
                  key={entry.id}
                  className={
                    entry.exercised
                      ? "bg-emerald-50/35 hover:bg-emerald-50/60"
                      : "hover:bg-slate-50"
                  }
                >
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">
                    {entry.period}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-slate-900">
                    {entry.vestingDate}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {entry.optionsVested}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                    {entry.cumulativeVested}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`Exercised on ${entry.vestingDate}`}
                      checked={entry.exercised}
                      disabled={busyId === entry.id}
                      onChange={() => toggleExercised(entry)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                    {entry.exerciseQuantity}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtNative(entry.sharePrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtNative(entry.strikePrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    <div className="text-slate-900">
                      {fmtNative(entry.totalPrice)}
                    </div>
                    <div className="text-[10px] font-normal text-slate-400">
                      {fmtNative(unitTotal)}/sh
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => deleteEntry(entry.id)}
                      className="p-1 rounded-md hover:bg-rose-50 text-rose-500"
                      title="Remove Row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50 font-bold border-t border-slate-200">
              <td className="px-3 py-2.5" colSpan={2}>
                Total
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {totalVested}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {totalVested}
              </td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-right tabular-nums text-indigo-700">
                {totalExercised}
              </td>
              <td className="px-3 py-2.5 text-right text-slate-400" colSpan={2}>
                Invested Total
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                {fmtNative(totalInvested)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <form
        onSubmit={addEntry}
        className="p-3 bg-slate-50/70 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs"
      >
        <input
          type="date"
          required
          value={newRow.vestingDate}
          onChange={(e) =>
            setNewRow({ ...newRow, vestingDate: e.target.value })
          }
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white"
        />
        <input
          type="number"
          required
          min={0}
          placeholder="Option Vested"
          value={newRow.optionsVested}
          onChange={(e) =>
            setNewRow({ ...newRow, optionsVested: e.target.value })
          }
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white"
        />
        <input
          type="number"
          step="any"
          required
          min={0}
          placeholder="Share Price"
          value={newRow.sharePrice}
          onChange={(e) => setNewRow({ ...newRow, sharePrice: e.target.value })}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white"
        />
        <input
          type="number"
          step="any"
          required
          min={0}
          placeholder="Strike Price"
          value={newRow.strikePrice}
          onChange={(e) =>
            setNewRow({ ...newRow, strikePrice: e.target.value })
          }
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white"
        />
        <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700">
          <input
            type="checkbox"
            checked={newRow.exercised}
            onChange={(e) =>
              setNewRow({ ...newRow, exercised: e.target.checked })
            }
          />
          Exercised
        </label>
        <button
          type="submit"
          disabled={adding}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Vesting Date
        </button>
      </form>
    </div>
  );
}
