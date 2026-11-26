"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";

interface ImportSummary {
  incomes: number;
  holdings: number;
  transactions: number;
  rentals: number;
  rentPayments: number;
  loans: number;
  loanTransactions: number;
  insurances: number;
  snapshots: number;
  goals: number;
}

interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export default function ImportAndBackupPage() {
  const [file, setFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);

  const loadBackups = useCallback(async () => {
    const res = await fetch("/api/backup", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setBackups(json.backups ?? []);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  async function handlePreview(selectedFile: File) {
    setFile(selectedFile);
    setErrorMsg("");
    setStatusMsg("");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("mode", "preview");
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Failed to parse workbook");
      } else {
        setPreview(json.summary);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleApplyImport() {
    if (!file) return;
    setBusy(true);
    setErrorMsg("");
    setStatusMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "apply");
      fd.append("replaceExisting", String(replaceExisting));
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Import failed");
      } else {
        setStatusMsg(
          `Imported ${json.summary.holdings} holdings, ${json.summary.transactions} investment transactions, ${json.summary.incomes} income records, ${json.summary.rentPayments} rent payments, and ${json.summary.loanTransactions} loan ledger rows!`
        );
        setPreview(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createBackup() {
    setBusy(true);
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      if (res.ok) {
        await loadBackups();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Excel Importer & Local Backups
        </h1>
        <p className="text-sm text-slate-500">
          Migrate your existing BPS `.xlsx` or `.csv` workbook into SQLite, or
          export backups anytime.
        </p>
      </div>

      {/* Excel Importer */}
      <section className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-slate-900">
            Import BPS Excel / CSV Workbook
          </h2>
        </div>

        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 cursor-pointer bg-slate-50/60 transition">
          <Upload className="h-8 w-8 text-slate-400 mb-2" />
          <span className="text-sm font-medium text-slate-700">
            {file ? file.name : "Choose .xlsx, .xls, or .csv file"}
          </span>
          <span className="text-xs text-slate-400 mt-1">
            Automatically detects Income, MF/ETF Unit Ledgers, FDs, RDs, NPS,
            Chit, Shop Rentals, Home Loan & Net Worth
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePreview(f);
            }}
          />
        </label>

        {errorMsg && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        {statusMsg && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {statusMsg}
          </div>
        )}

        {preview && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="text-sm font-semibold text-slate-800">
              Detected Records Preview
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              {Object.entries(preview).map(([k, v]) => (
                <div
                  key={k}
                  className="bg-white rounded-xl border border-slate-200 p-3"
                >
                  <div className="text-slate-500 capitalize">{k}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums">
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              Replace existing records before importing (recommended for initial
              migration)
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={handleApplyImport}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 text-sm"
            >
              {busy ? "Importing..." : "Confirm & Import to SQLite"}
            </button>
          </div>
        )}
      </section>

      {/* Export & Backups */}
      <section className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <DatabaseBackup className="h-5 w-5 text-sky-600" />
            <h2 className="font-semibold text-slate-900">
              Exports & Local SQLite Backups
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/backup?format=xlsx"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              Export .xlsx
            </a>
            <a
              href="/api/backup?format=json"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              Export .json
            </a>
            <button
              type="button"
              onClick={createBackup}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 text-xs font-medium"
            >
              <DatabaseBackup className="h-3.5 w-3.5" />
              Snapshot SQLite DB
            </button>
          </div>
        </div>

        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100">
              <tr>
                <th className="px-4 py-2 text-left">Backup File</th>
                <th className="px-4 py-2 text-right">Size</th>
                <th className="px-4 py-2 text-right">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {backups.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-5 text-center text-slate-400"
                  >
                    No local snapshots created yet (stored in ./data/backups).
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename}>
                    <td className="px-4 py-2 font-mono">{b.filename}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {(b.sizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {new Date(b.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
