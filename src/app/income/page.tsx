"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Plus, Trash2, Wallet } from "lucide-react";
import { formatCompactINR, formatINR } from "@/lib/utils";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface IncomeEntry {
  id: number;
  month: string;
  date: string;
  source: string;
  category: string;
  inhandAmount: number;
  account: string;
  notes: string;
}

interface RentalProperty {
  id: number;
  name: string;
  tenantName: string;
  advancePaid: number;
  advancePending: number;
  monthlyRent: number;
  status: string;
  notes: string;
}

interface RentalPayment {
  id: number;
  propertyId: number;
  billingMonth: string;
  rentAmount: number;
  solarCharge: number;
  deductions: number;
  totalAmount: number;
  paidDate: string;
  paymentMode: string;
  notes: string;
}

export default function IncomePage() {
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "income" | "payment";
    id: number;
  } | null>(null);

  const [incomeForm, setIncomeForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    source: "Salary",
    category: "salary",
    inhandAmount: "",
    account: "ICICI",
    notes: "",
  });

  const [rentForm, setRentForm] = useState({
    propertyId: "",
    billingMonth: new Date().toISOString().slice(0, 7),
    rentAmount: "",
    solarCharge: "0",
    deductions: "0",
    paidDate: new Date().toISOString().slice(0, 10),
    paymentMode: "UPI",
    notes: "",
  });

  const [propForm, setPropForm] = useState({
    name: "",
    tenantName: "",
    advancePaid: "",
    advancePending: "0",
    monthlyRent: "",
  });

  const load = useCallback(async () => {
    const [incRes, rentRes] = await Promise.all([
      fetch("/api/income", { cache: "no-store" }),
      fetch("/api/rentals", { cache: "no-store" }),
    ]);
    if (incRes.ok) {
      const json = await incRes.json();
      setIncomes(json.items ?? []);
    }
    if (rentRes.ok) {
      const json = await rentRes.json();
      setProperties(json.properties ?? []);
      setPayments(json.payments ?? []);
      if (json.properties?.length && !rentForm.propertyId) {
        const first = json.properties[0];
        setRentForm((prev) => ({
          ...prev,
          propertyId: String(first.id),
          rentAmount: String(first.monthlyRent),
        }));
      }
    }
  }, [rentForm.propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addIncome(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    const res = await fetch("/api/income", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...incomeForm,
        inhandAmount: Number(incomeForm.inhandAmount || 0),
      }),
    });
    if (res.ok) {
      setIncomeForm((prev) => ({ ...prev, inhandAmount: "", notes: "" }));
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Failed to add income");
    }
  }

  async function deleteIncome(id: number) {
    await fetch(`/api/income?id=${id}`, { method: "DELETE" });
    setPendingDelete(null);
    await load();
  }

  async function addProperty(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/rentals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "property",
        ...propForm,
        advancePaid: Number(propForm.advancePaid || 0),
        advancePending: Number(propForm.advancePending || 0),
        monthlyRent: Number(propForm.monthlyRent || 0),
      }),
    });
    if (res.ok) {
      setPropForm({
        name: "",
        tenantName: "",
        advancePaid: "",
        advancePending: "0",
        monthlyRent: "",
      });
      await load();
    }
  }

  async function addRentPayment(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/rentals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "payment",
        propertyId: Number(rentForm.propertyId),
        billingMonth: rentForm.billingMonth,
        rentAmount: Number(rentForm.rentAmount || 0),
        solarCharge: Number(rentForm.solarCharge || 0),
        deductions: Number(rentForm.deductions || 0),
        paidDate: rentForm.paidDate,
        paymentMode: rentForm.paymentMode,
        notes: rentForm.notes,
      }),
    });
    if (res.ok) {
      setRentForm((prev) => ({ ...prev, solarCharge: "0", notes: "" }));
      await load();
    }
  }

  async function deleteRentPayment(id: number) {
    await fetch(`/api/rentals?kind=payment&id=${id}`, { method: "DELETE" });
    setPendingDelete(null);
    await load();
  }

  const propNameMap = new Map(properties.map((p) => [p.id, p.name]));
  const mainSalaryTotal = incomes
    .filter((i) => i.category === "salary")
    .reduce((s, i) => s + i.inhandAmount, 0);
  const passiveTotal =
    incomes
      .filter((i) => i.category !== "salary")
      .reduce((s, i) => s + i.inhandAmount, 0) +
    payments.reduce((s, p) => s + p.rentAmount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Main Income (Salary) & Passive Income
        </h1>
        <p className="text-sm text-slate-500">
          Track primary salary separately from passive streams (Shop Rentals,
          Dividends, Interest, Side Income)
        </p>
      </div>

      <AiInsightBanner scope="income" onAskAi={() => setAiOpen(true)} />

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* Split Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 shadow-sm">
          <div className="text-xs uppercase font-semibold text-emerald-100">
            Main Income (Salary)
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {formatINR(mainSalaryTotal)}
          </div>
          <div className="text-xs text-emerald-100/90 mt-1">
            {incomes.filter((i) => i.category === "salary").length} salary
            entries recorded
          </div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 text-white p-5 shadow-sm">
          <div className="text-xs uppercase font-semibold text-sky-100">
            Passive Income (Rentals + Dividends + Other)
          </div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {formatINR(passiveTotal)}
          </div>
          <div className="text-xs text-sky-100/90 mt-1">
            Includes {formatCompactINR(payments.reduce((s, p) => s + p.rentAmount, 0))}{" "}
            from Shop Rentals
          </div>
        </div>
      </div>

      {/* Main & General Income Ledger */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-slate-900">
            Salary & Generic Income Ledger
          </h2>
        </div>

        <form
          onSubmit={addIncome}
          className="grid grid-cols-1 sm:grid-cols-6 gap-2 text-sm"
        >
          <input
            type="date"
            required
            value={incomeForm.date}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, date: e.target.value })
            }
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <input
            required
            placeholder="Source (Salary / Dividend)"
            value={incomeForm.source}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, source: e.target.value })
            }
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <select
            value={incomeForm.category}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, category: e.target.value })
            }
            className="rounded-xl border border-slate-200 px-3 py-2"
          >
            <option value="salary">Main Income (Salary)</option>
            <option value="rental">Passive (Rental)</option>
            <option value="dividend">Passive (Dividend)</option>
            <option value="other">Passive (Other)</option>
          </select>
          <input
            type="number"
            required
            placeholder="In-hand Amount (₹)"
            value={incomeForm.inhandAmount}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, inhandAmount: e.target.value })
            }
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <input
            placeholder="Account (ICICI/SBI)"
            value={incomeForm.account}
            onChange={(e) =>
              setIncomeForm({ ...incomeForm, account: e.target.value })
            }
            className="rounded-xl border border-slate-200 px-3 py-2"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2"
          >
            <Plus className="h-4 w-4" />
            Add Income
          </button>
        </form>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-2.5 text-left">Month</th>
                <th className="px-4 py-2.5 text-left">Source</th>
                <th className="px-4 py-2.5 text-left">Stream</th>
                <th className="px-4 py-2.5 text-left">Account</th>
                <th className="px-4 py-2.5 text-right">In-Hand (INR)</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {incomes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-slate-400"
                  >
                    No income entries yet.
                  </td>
                </tr>
              ) : (
                incomes.map((inc) => (
                  <tr key={inc.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 tabular-nums">{inc.month}</td>
                    <td className="px-4 py-2.5 font-medium">{inc.source}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          inc.category === "salary"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {inc.category === "salary" ? "Main" : "Passive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {inc.account}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                      {formatINR(inc.inhandAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({ kind: "income", id: inc.id })
                        }
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Passive Income: Shop Rentals */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-sky-600" />
          <h2 className="font-semibold text-slate-900">
            Passive Income — Shop Rentals & Solar Charges
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {properties.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-sky-100 bg-sky-50/40 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{p.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 uppercase font-medium">
                  {p.status}
                </span>
              </div>
              <div className="mt-2 text-lg font-bold text-slate-900 tabular-nums">
                {formatINR(p.monthlyRent)}
                <span className="text-xs font-normal text-slate-500"> / mo</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Advance Paid: {formatINR(p.advancePaid)}
                {p.advancePending > 0
                  ? ` • Pending: ${formatINR(p.advancePending)}`
                  : ""}
              </div>
            </div>
          ))}

          <form
            onSubmit={addProperty}
            className="rounded-xl border border-dashed border-slate-300 p-4 space-y-2 text-xs"
          >
            <div className="font-medium text-slate-700">
              Add Rental / Passive Unit
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                required
                placeholder="Name (Shop 3)"
                value={propForm.name}
                onChange={(e) =>
                  setPropForm({ ...propForm, name: e.target.value })
                }
                className="rounded-lg border border-slate-200 px-2.5 py-1.5"
              />
              <input
                required
                type="number"
                placeholder="Rent (₹)"
                value={propForm.monthlyRent}
                onChange={(e) =>
                  setPropForm({ ...propForm, monthlyRent: e.target.value })
                }
                className="rounded-lg border border-slate-200 px-2.5 py-1.5"
              />
              <input
                type="number"
                placeholder="Advance (₹)"
                value={propForm.advancePaid}
                onChange={(e) =>
                  setPropForm({ ...propForm, advancePaid: e.target.value })
                }
                className="rounded-lg border border-slate-200 px-2.5 py-1.5"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-900 text-white font-medium px-2.5 py-1.5"
              >
                + Add Unit
              </button>
            </div>
          </form>
        </div>

        {properties.length > 0 && (
          <form
            onSubmit={addRentPayment}
            className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200"
          >
            <select
              value={rentForm.propertyId}
              onChange={(e) => {
                const pid = e.target.value;
                const found = properties.find((p) => String(p.id) === pid);
                setRentForm({
                  ...rentForm,
                  propertyId: pid,
                  rentAmount: found ? String(found.monthlyRent) : "",
                });
              }}
              className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="month"
              required
              value={rentForm.billingMonth}
              onChange={(e) =>
                setRentForm({ ...rentForm, billingMonth: e.target.value })
              }
              className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
            />
            <input
              type="number"
              required
              placeholder="Rent ₹"
              value={rentForm.rentAmount}
              onChange={(e) =>
                setRentForm({ ...rentForm, rentAmount: e.target.value })
              }
              className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
            />
            <input
              type="number"
              placeholder="Solar Charge ₹"
              value={rentForm.solarCharge}
              onChange={(e) =>
                setRentForm({ ...rentForm, solarCharge: e.target.value })
              }
              className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
            />
            <input
              placeholder="Mode (UPI/Cash)"
              value={rentForm.paymentMode}
              onChange={(e) =>
                setRentForm({ ...rentForm, paymentMode: e.target.value })
              }
              className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
            />
            <input
              placeholder="Notes"
              value={rentForm.notes}
              onChange={(e) =>
                setRentForm({ ...rentForm, notes: e.target.value })
              }
              className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
            />
            <button
              type="submit"
              className="rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium px-3 py-2"
            >
              + Log Rent
            </button>
          </form>
        )}

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-4 py-2.5 text-left">Shop</th>
                <th className="px-4 py-2.5 text-left">Month</th>
                <th className="px-4 py-2.5 text-right">Rent</th>
                <th className="px-4 py-2.5 text-right">Solar</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-left">Paid Date / Mode</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-slate-400"
                  >
                    No rent collections logged yet.
                  </td>
                </tr>
              ) : (
                payments.map((rp) => (
                  <tr key={rp.id}>
                    <td className="px-4 py-2.5 font-medium">
                      {propNameMap.get(rp.propertyId) ?? `Shop #${rp.propertyId}`}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {rp.billingMonth}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatINR(rp.rentAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-700">
                      {rp.solarCharge > 0 ? formatINR(rp.solarCharge) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-sky-700">
                      {formatINR(rp.totalAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {[rp.paidDate, rp.paymentMode, rp.notes]
                        .filter(Boolean)
                        .join(" • ")}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({ kind: "payment", id: rp.id })
                        }
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete Income / Rent Record?"
        message="This will permanently remove the selected record from the ledger."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === "income") {
            deleteIncome(pendingDelete.id);
          } else {
            deleteRentPayment(pendingDelete.id);
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="income"
      />
    </div>
  );
}
