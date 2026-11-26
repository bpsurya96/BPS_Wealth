"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileSpreadsheet,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

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
  assets: number;
}

interface ImportDiff {
  alreadyImported: boolean;
  previousImports: Array<{ id: number; fileName: string; createdAt: string }>;
  counts: {
    toAdd: number;
    toUpdate: number;
    toSkip: number;
    rejected: number;
  };
}

interface BackupItem {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  format: string;
}

interface RestorePreview {
  filename?: string;
  valid: boolean;
  manifest: {
    backupVersion: string;
    createdAt: string;
    encrypted: boolean;
    documentCount: number;
    recordCounts: Record<string, number>;
  };
}

export default function ImportAndBackupPage() {
  const [file, setFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [passphrase, setPassphrase] = useState("");
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(
    null
  );
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

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
        setPreview(null);
        setDiff(null);
      } else {
        setPreview(json.summary);
        setDiff(json.diff ?? null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function executeApplyImport() {
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
          `Import complete: ${json.result?.addedCount ?? 0} added, ${
            json.result?.skippedCount ?? 0
          } duplicate/existing skipped.`
        );
        setPreview(null);
        setDiff(null);
      }
    } finally {
      setBusy(false);
      setConfirmReplaceOpen(false);
    }
  }

  async function createBackup() {
    setBusy(true);
    setErrorMsg("");
    setStatusMsg("");
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          passphrase: passphrase.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Backup failed");
      } else {
        setStatusMsg(
          `Verified backup created: ${json.backup.filename} (${json.backup.documentCount} documents included)`
        );
        await loadBackups();
      }
    } finally {
      setBusy(false);
    }
  }

  async function previewBackupFile(filename: string) {
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          filename,
          passphrase: passphrase.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Backup verification failed");
      } else {
        setRestorePreview({ ...json.preview, filename });
      }
    } finally {
      setBusy(false);
    }
  }

  async function executeRestore() {
    if (!restorePreview?.filename) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          filename: restorePreview.filename,
          passphrase: passphrase.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Restore failed");
      } else {
        setStatusMsg(
          `Restore verified & completed! Safety backup saved as ${json.result?.safetyBackupFilename}`
        );
        setRestorePreview(null);
        await loadBackups();
      }
    } finally {
      setBusy(false);
      setConfirmRestoreOpen(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Excel Importer & Verified Backups
        </h1>
        <p className="text-sm text-slate-500">
          Import `.xlsx` or `.csv` workbooks with duplicate detection, export
          portable snapshots, and verify or restore full backups.
        </p>
      </div>

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

      {/* Excel Importer */}
      <section className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          <h2 className="font-semibold text-slate-900">
            Import Excel / CSV Workbook
          </h2>
        </div>

        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 cursor-pointer bg-slate-50/60 transition">
          <Upload className="h-8 w-8 text-slate-400 mb-2" />
          <span className="text-sm font-medium text-slate-700">
            {file ? file.name : "Choose .xlsx or .csv file (max 15 MB)"}
          </span>
          <span className="text-xs text-slate-400 mt-1">
            Supports BPS Wealth exports and standard section workbooks
          </span>
          <input
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePreview(f);
              e.target.value = "";
            }}
          />
        </label>

        {preview && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            {diff?.alreadyImported && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                This exact workbook fingerprint was previously imported.
                Duplicate records will be skipped automatically in merge mode.
              </div>
            )}

            {diff && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-semibold">
                  To Add: {diff.counts.toAdd}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 font-semibold">
                  Duplicates Skipped: {diff.counts.toSkip}
                </span>
                {diff.counts.rejected > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 font-semibold">
                    Rejected: {diff.counts.rejected}
                  </span>
                )}
              </div>
            )}

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
              <span>
                Replace all existing financial records before importing
                (destructive; leave unchecked to safely merge & skip duplicates)
              </span>
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={() =>
                replaceExisting
                  ? setConfirmReplaceOpen(true)
                  : executeApplyImport()
              }
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
              Exports, Full Backups & Safe Restore
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
              Create Full Backup
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
          <span className="font-medium text-slate-700 shrink-0">
            Optional Encryption Passphrase:
          </span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Leave empty for standard .zip, or enter >=8 chars for AES-256-GCM .bpsbak"
            className="flex-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5"
          />
        </div>

        {restorePreview && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Verified Backup Preview: {restorePreview.filename}
              </div>
              <button
                type="button"
                onClick={() => setRestorePreview(null)}
                className="text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>
            <div className="text-slate-700">
              Created: {new Date(restorePreview.manifest.createdAt).toLocaleString()} •{" "}
              Documents: {restorePreview.manifest.documentCount}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(restorePreview.manifest.recordCounts).map(
                ([tbl, cnt]) => (
                  <span
                    key={tbl}
                    className="bg-white border border-indigo-100 rounded-lg px-2 py-1"
                  >
                    {tbl}: <strong>{cnt}</strong>
                  </span>
                )
              )}
            </div>
            <button
              type="button"
              onClick={() => setConfirmRestoreOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore This Backup
            </button>
          </div>
        )}

        <div className="border border-slate-100 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100">
              <tr>
                <th className="px-4 py-2 text-left">Backup File</th>
                <th className="px-4 py-2 text-right">Size</th>
                <th className="px-4 py-2 text-right">Created</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {backups.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-5 text-center text-slate-400"
                  >
                    No local snapshots created yet.
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
                    <td className="px-4 py-2 text-right space-x-2">
                      {(b.format === "zip" || b.format === "encrypted") && (
                        <button
                          type="button"
                          onClick={() => previewBackupFile(b.filename)}
                          className="text-indigo-600 hover:underline font-medium"
                        >
                          Verify / Restore
                        </button>
                      )}
                      <a
                        href={`/api/backup?download=${encodeURIComponent(b.filename)}`}
                        className="text-slate-600 hover:underline font-medium"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmReplaceOpen}
        title="Replace All Existing Records?"
        message="You selected Replace Existing Records. This will erase all current holdings, transactions, income, rentals, loans, insurance, and goals before importing the workbook."
        confirmLabel="Yes, Replace & Import"
        busy={busy}
        onConfirm={executeApplyImport}
        onCancel={() => setConfirmReplaceOpen(false)}
      />

      <ConfirmDialog
        open={confirmRestoreOpen}
        title="Restore Database & Documents?"
        message={`This will replace the current live database with "${restorePreview?.filename}". A verified pre-restore safety backup will be created automatically before swapping.`}
        confirmLabel="Verify & Restore"
        busy={busy}
        onConfirm={executeRestore}
        onCancel={() => setConfirmRestoreOpen(false)}
      />
    </div>
  );
}
