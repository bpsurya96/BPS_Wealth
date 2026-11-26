"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Zap } from "lucide-react";
import { ASSET_CLASS_LABELS, formatINR, formatUSD } from "@/lib/utils";

interface SipItem {
  id: number;
  name: string;
  assetClass: string;
  currency: string;
  plannedSip: number;
  currentNav: number;
}

interface RentalItem {
  id: number;
  name: string;
  monthlyRent: number;
}

export default function QuickLogPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [salaryAmount, setSalaryAmount] = useState("");
  const [salaryAccount, setSalaryAccount] = useState("Bank");
  const [sips, setSips] = useState<
    Array<SipItem & { enabled: boolean; amount: string; nav: string }>
  >([]);
  const [rentals, setRentals] = useState<
    Array<
      RentalItem & { enabled: boolean; rentAmount: string; solarCharge: string }
    >
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [resultMsg, setResultMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    fetch("/api/quick-log", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.defaultSalary > 0) {
          setSalaryAmount(String(json.defaultSalary));
        }
        if (json.defaultAccount) {
          setSalaryAccount(String(json.defaultAccount));
        }
        setSips(
          (json.sips ?? []).map((s: SipItem) => ({
            ...s,
            enabled: true,
            amount: String(s.plannedSip),
            nav: s.currentNav > 0 ? String(s.currentNav) : "",
          }))
        );
        setRentals(
          (json.rentals ?? []).map((r: RentalItem) => ({
            ...r,
            enabled: true,
            rentAmount: String(r.monthlyRent),
            solarCharge: "0",
          }))
        );
      })
      .catch(() => {
        setErrorMsg("Failed to load quick-log defaults");
      });
  }, []);

  async function submitBatch(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResultMsg("");
    setErrorMsg("");
    try {
      const res = await fetch("/api/quick-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          month: date.slice(0, 7),
          salaryAmount: Number(salaryAmount || 0),
          salaryAccount,
          rentals: rentals
            .filter((r) => r.enabled)
            .map((r) => ({
              propertyId: r.id,
              rentAmount: Number(r.rentAmount || 0),
              solarCharge: Number(r.solarCharge || 0),
              paymentMode: "UPI",
            })),
          sips: sips
            .filter((s) => s.enabled)
            .map((s) => ({
              holdingId: s.id,
              amount: Number(s.amount || 0),
              nav: Number(s.nav || 0),
            })),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setResultMsg(
          `Successfully logged ${json.loggedCount} monthly records for ${date.slice(
            0,
            7
          )}!`
        );
      } else {
        setErrorMsg(json.error || "Failed to log monthly batch");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Monthly Quick-Log Batch Sheet
        </h1>
        <p className="text-sm text-slate-500">
          Record this month&apos;s Salary, Shop Rents, and all planned SIPs /
          installments in one atomic transaction.
        </p>
      </div>

      {resultMsg && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {resultMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      <form onSubmit={submitBatch} className="space-y-6">
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
          <h2 className="font-semibold text-slate-900">1. Income</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Entry Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Monthly Salary In-Hand (₹)
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={salaryAmount}
                onChange={(e) => setSalaryAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Account
              </label>
              <input
                value={salaryAccount}
                onChange={(e) => setSalaryAccount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
          </div>

          {rentals.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="text-xs font-medium text-slate-500 uppercase">
                Shop Rentals
              </div>
              {rentals.map((r, idx) => (
                <div
                  key={r.id}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center bg-slate-50 p-2.5 rounded-xl text-sm"
                >
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={(e) => {
                        const copy = [...rentals];
                        copy[idx].enabled = e.target.checked;
                        setRentals(copy);
                      }}
                    />
                    {r.name}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Rent ₹"
                    value={r.rentAmount}
                    onChange={(e) => {
                      const copy = [...rentals];
                      copy[idx].rentAmount = e.target.value;
                      setRentals(copy);
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Solar Charge ₹"
                    value={r.solarCharge}
                    onChange={(e) => {
                      const copy = [...rentals];
                      copy[idx].solarCharge = e.target.value;
                      setRentals(copy);
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white"
                  />
                  <span className="text-xs text-slate-500 text-right tabular-nums">
                    Total:{" "}
                    {formatINR(
                      Number(r.rentAmount || 0) + Number(r.solarCharge || 0)
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
          <h2 className="font-semibold text-slate-900">
            2. Planned SIPs & Monthly Investments
          </h2>
          {sips.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">
              No active holdings with a planned monthly SIP yet. Add holdings or
              import your Excel workbook first.
            </p>
          ) : (
            <div className="space-y-2">
              {sips.map((s, idx) => {
                const amt = Number(s.amount || 0);
                const nav = Number(s.nav || 0);
                const estUnits = nav > 0 ? amt / nav : 0;
                return (
                  <div
                    key={s.id}
                    className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center bg-slate-50 p-2.5 rounded-xl text-sm"
                  >
                    <label className="sm:col-span-2 flex items-center gap-2 font-medium min-w-0">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => {
                          const copy = [...sips];
                          copy[idx].enabled = e.target.checked;
                          setSips(copy);
                        }}
                      />
                      <span className="truncate">{s.name}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        ({ASSET_CLASS_LABELS[s.assetClass] ?? s.assetClass})
                      </span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={s.amount}
                      onChange={(e) => {
                        const copy = [...sips];
                        copy[idx].amount = e.target.value;
                        setSips(copy);
                      }}
                      placeholder={
                        s.currency === "USD" ? "Amount ($)" : "Amount (₹)"
                      }
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={s.nav}
                      onChange={(e) => {
                        const copy = [...sips];
                        copy[idx].nav = e.target.value;
                        setSips(copy);
                      }}
                      placeholder="NAV / Price"
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                    <div className="text-xs text-slate-500 text-right tabular-nums">
                      {estUnits > 0
                        ? `${estUnits.toFixed(3)} units`
                        : s.currency === "USD"
                          ? formatUSD(amt)
                          : formatINR(amt)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-6 py-3 text-sm shadow-sm"
        >
          <Zap className="h-4 w-4" />
          {submitting
            ? "Logging Monthly Batch..."
            : `Submit ${date.slice(0, 7)} Monthly Batch`}
        </button>
      </form>
    </div>
  );
}
