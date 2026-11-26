"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Landmark,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  ExternalLink,
} from "lucide-react";
import { formatINR } from "@/lib/utils";
import { AiInsightBanner } from "@/components/AiInsightBanner";
import { AiAssistantDrawer } from "@/components/AiAssistantDrawer";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Loan {
  id: number;
  name: string;
  lender: string;
  principalSanctioned: number;
  currentBalance: number;
  interestRate: number;
  emiAmount: number;
  status: string;
  notes: string;
}

interface LoanTxn {
  id: number;
  loanId: number;
  txnDate: string;
  description: string;
  type: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}

interface Policy {
  id: number;
  name: string;
  policyType: string;
  provider: string;
  premiumAmount: number;
  premiumFrequency: string;
  coverAmount: string;
  expiryDate: string;
  maturityDate: string;
  status: string;
  notes: string;
}

interface DocItem {
  id: number;
  entityType: string;
  entityId: number;
  title: string;
  originalName: string;
  sizeBytes: number;
  uploadedAt: string;
}

export default function LoansAndInsurancePage() {
  const [loansList, setLoansList] = useState<Loan[]>([]);
  const [loanTxns, setLoanTxns] = useState<LoanTxn[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "loan" | "policy" | "doc";
    id: number;
  } | null>(null);

  const [loanForm, setLoanForm] = useState({
    name: "",
    lender: "",
    principalSanctioned: "",
    currentBalance: "",
    interestRate: "",
    emiAmount: "",
    status: "active",
  });

  const [policyForm, setPolicyForm] = useState({
    name: "",
    policyType: "term",
    provider: "",
    premiumAmount: "",
    premiumFrequency: "annual",
    coverAmount: "",
    expiryDate: "",
    notes: "",
  });

  const load = useCallback(async () => {
    const [lRes, iRes, dRes] = await Promise.all([
      fetch("/api/loans", { cache: "no-store" }),
      fetch("/api/insurance", { cache: "no-store" }),
      fetch("/api/documents?entityType=insurance", { cache: "no-store" }),
    ]);
    if (lRes.ok) {
      const json = await lRes.json();
      setLoansList(json.loans ?? []);
      setLoanTxns(json.transactions ?? []);
    }
    if (iRes.ok) {
      const json = await iRes.json();
      setPolicies(json.policies ?? []);
    }
    if (dRes.ok) {
      const json = await dRes.json();
      setDocs(json.documents ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addLoan(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...loanForm,
        principalSanctioned: Number(loanForm.principalSanctioned || 0),
        currentBalance: Number(loanForm.currentBalance || 0),
        interestRate: Number(loanForm.interestRate || 0),
        emiAmount: Number(loanForm.emiAmount || 0),
      }),
    });
    if (res.ok) {
      setLoanForm({
        name: "",
        lender: "",
        principalSanctioned: "",
        currentBalance: "",
        interestRate: "",
        emiAmount: "",
        status: "active",
      });
      await load();
    }
  }

  async function addPolicy(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/insurance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...policyForm,
        premiumAmount: Number(policyForm.premiumAmount || 0),
      }),
    });
    if (res.ok) {
      setPolicyForm({
        name: "",
        policyType: "term",
        provider: "",
        premiumAmount: "",
        premiumFrequency: "annual",
        coverAmount: "",
        expiryDate: "",
        notes: "",
      });
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Failed to add policy");
    }
  }

  async function uploadPolicyDoc(policyId: number, file: File) {
    setErrorMsg("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entityType", "insurance");
    fd.append("entityId", String(policyId));
    fd.append("title", file.name);
    const res = await fetch("/api/documents", { method: "POST", body: fd });
    if (res.ok) {
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Document upload failed");
    }
  }

  async function executePendingDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    const url =
      kind === "loan"
        ? `/api/loans?id=${id}`
        : kind === "policy"
          ? `/api/insurance?id=${id}`
          : `/api/documents?id=${id}`;
    await fetch(url, { method: "DELETE" });
    setPendingDelete(null);
    await load();
  }

  async function extractPolicyFromImage(file: File) {
    setExtractMsg("Extracting policy details with Open-Source Vision AI...");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("targetType", "insurance");
    const res = await fetch("/api/ai/extract", { method: "POST", body: fd });
    const json = await res.json();
    if (json.ok && json.extracted) {
      const ex = json.extracted as Record<string, unknown>;
      setPolicyForm({
        name: String(ex.name || policyForm.name || ""),
        policyType: String(ex.policyType || "term"),
        provider: String(ex.provider || ""),
        premiumAmount: ex.premiumAmount ? String(ex.premiumAmount) : "",
        premiumFrequency: String(ex.premiumFrequency || "annual"),
        coverAmount: String(ex.coverAmount || ""),
        expiryDate: String(ex.expiryDate || ""),
        notes: String(ex.notes || ""),
      });
      setExtractMsg(`Auto-filled fields using ${json.model}. Review and click + Add Policy.`);
    } else {
      setExtractMsg(
        `${json.rawText || "Could not extract"} ${json.hint ? `(${json.hint})` : ""}`
      );
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Loans & Insurance Documents
        </h1>
        <p className="text-sm text-slate-500">
          Track Loan-1, Loan-2 ledgers and upload Term & Health policy PDFs/docs
          locally
        </p>
      </div>

      <AiInsightBanner scope="loans" onAskAi={() => setAiOpen(true)} />

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      {/* Loans */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-rose-600" />
          <h2 className="font-semibold text-slate-900">
            Loans (Loan-1, Loan-2 & EMIs)
          </h2>
        </div>

        <form
          onSubmit={addLoan}
          className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200"
        >
          <input
            required
            placeholder="Loan Name (e.g. Loan-1)"
            value={loanForm.name}
            onChange={(e) => setLoanForm({ ...loanForm, name: e.target.value })}
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <input
            placeholder="Lender (SBI/ICICI)"
            value={loanForm.lender}
            onChange={(e) =>
              setLoanForm({ ...loanForm, lender: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <input
            type="number"
            placeholder="Sanctioned ₹"
            value={loanForm.principalSanctioned}
            onChange={(e) =>
              setLoanForm({ ...loanForm, principalSanctioned: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <input
            type="number"
            placeholder="Current Balance ₹"
            value={loanForm.currentBalance}
            onChange={(e) =>
              setLoanForm({ ...loanForm, currentBalance: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <input
            type="number"
            placeholder="EMI ₹"
            value={loanForm.emiAmount}
            onChange={(e) =>
              setLoanForm({ ...loanForm, emiAmount: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium px-3 py-2"
          >
            + Add Loan
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loansList.map((l) => (
            <div
              key={l.id}
              className="rounded-xl border border-slate-200 p-4 flex items-start justify-between bg-slate-50/40"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{l.name}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md font-medium uppercase ${
                      l.status === "closed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {l.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {l.lender} • Sanctioned {formatINR(l.principalSanctioned)} •
                  EMI {formatINR(l.emiAmount)}
                </div>
                <div className="mt-2 text-base font-bold text-slate-900 tabular-nums">
                  Balance: {formatINR(l.currentBalance)}
                </div>
                {l.notes && (
                  <p className="text-xs text-slate-500 mt-1">{l.notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPendingDelete({ kind: "loan", id: l.id })}
                className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {loanTxns.length > 0 && (
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 uppercase border-b border-slate-100">
              Recent Loan Ledger Entries ({loanTxns.length} total)
            </div>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loanTxns.slice(0, 60).map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 tabular-nums">{t.txnDate}</td>
                      <td className="px-3 py-2 uppercase">{t.type}</td>
                      <td className="px-3 py-2 text-slate-600 truncate max-w-xs">
                        {t.description}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-600">
                        {t.debit > 0 ? formatINR(t.debit) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                        {t.credit > 0 ? formatINR(t.credit) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatINR(t.balanceAfter)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Insurance + Document Upload */}
      <section className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-teal-600" />
            <h2 className="font-semibold text-slate-900">
              Insurance (Term & Health Document Vault)
            </h2>
          </div>
          <label className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-200 text-violet-800 px-3 py-1.5 text-xs font-semibold cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            AI Extract Policy from Image
            <input
              type="file"
              accept="image/*,.txt,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) extractPolicyFromImage(f);
              }}
            />
          </label>
        </div>

        {extractMsg && (
          <div className="rounded-xl bg-violet-50 border border-violet-200 px-3.5 py-2 text-xs text-violet-900">
            {extractMsg}
          </div>
        )}

        <form
          onSubmit={addPolicy}
          className="grid grid-cols-2 sm:grid-cols-7 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200"
        >
          <input
            required
            placeholder="Policy Name"
            value={policyForm.name}
            onChange={(e) =>
              setPolicyForm({ ...policyForm, name: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <select
            value={policyForm.policyType}
            onChange={(e) =>
              setPolicyForm({ ...policyForm, policyType: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          >
            <option value="term">Term Insurance</option>
            <option value="health">Health Insurance</option>
            <option value="life_endowment">Life / Endowment</option>
          </select>
          <input
            type="number"
            placeholder="Premium ₹"
            value={policyForm.premiumAmount}
            onChange={(e) =>
              setPolicyForm({ ...policyForm, premiumAmount: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <select
            value={policyForm.premiumFrequency}
            onChange={(e) =>
              setPolicyForm({
                ...policyForm,
                premiumFrequency: e.target.value,
              })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          >
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </select>
          <input
            placeholder="Cover (e.g. 1 Cr)"
            value={policyForm.coverAmount}
            onChange={(e) =>
              setPolicyForm({ ...policyForm, coverAmount: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <input
            placeholder="Expiry / Maturity"
            value={policyForm.expiryDate}
            onChange={(e) =>
              setPolicyForm({ ...policyForm, expiryDate: e.target.value })
            }
            className="rounded-lg border border-slate-200 px-2.5 py-2 bg-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium px-3 py-2"
          >
            + Add Policy
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {policies.map((p) => {
            const pDocs = docs.filter((d) => d.entityId === p.id);
            return (
              <div
                key={p.id}
                className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between bg-teal-50/20 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-[11px] text-teal-700 font-semibold uppercase mt-0.5">
                      {p.policyType} {p.provider ? `• ${p.provider}` : ""}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-800 tabular-nums">
                      Premium: {formatINR(p.premiumAmount)} /{" "}
                      {p.premiumFrequency}
                    </div>
                    {p.coverAmount && (
                      <div className="text-xs text-slate-600">
                        Cover: {p.coverAmount}
                      </div>
                    )}
                    {(p.expiryDate || p.maturityDate) && (
                      <div className="text-xs text-amber-700 mt-1">
                        Expiry/Maturity: {p.expiryDate || p.maturityDate}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingDelete({ kind: "policy", id: p.id })
                    }
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Documents list + Upload */}
                <div className="border-t border-slate-200/80 pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">
                      Policy Documents ({pDocs.length})
                    </span>
                    <label className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900 cursor-pointer bg-teal-50 border border-teal-200 rounded-lg px-2 py-1">
                      <Upload className="h-3 w-3" />
                      Upload PDF/Img
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadPolicyDoc(p.id, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>

                  {pDocs.length > 0 && (
                    <div className="space-y-1">
                      {pDocs.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                        >
                          <a
                            href={`/api/documents/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-indigo-700 hover:underline truncate"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{d.originalName}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingDelete({ kind: "doc", id: d.id })
                            }
                            className="text-rose-500 hover:text-rose-700 ml-2"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Confirm Deletion"
        message="Are you sure you want to permanently delete this record?"
        confirmLabel="Delete"
        onConfirm={executePendingDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        context="loans"
      />
    </div>
  );
}
