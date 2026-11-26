"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Database,
  Download,
  Play,
  ShieldAlert,
  Table2,
  Terminal,
} from "lucide-react";

interface TableInfo {
  name: string;
  rowCount: number;
  columns: Array<{ name: string; type: string; pk: number }>;
}

interface QueryResult {
  mode: "read" | "write";
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  totalRows?: number;
  truncated?: boolean;
  changes?: number;
  lastInsertRowid?: number;
  durationMs: number;
}

const PRESET_QUERIES = [
  {
    label: "All Holdings Summary",
    sql: "SELECT id, name, asset_class, currency, planned_sip, invested_amount, current_value, units, current_nav FROM investment_holdings ORDER BY current_value DESC;",
  },
  {
    label: "Monthly SIP Totals",
    sql: "SELECT substr(date, 1, 7) AS month, COUNT(*) AS txns, ROUND(SUM(amount), 2) AS total_amount FROM investment_transactions GROUP BY month ORDER BY month DESC;",
  },
  {
    label: "Main vs Passive Income",
    sql: "SELECT month, source, category, inhand_amount, account FROM income_entries ORDER BY date DESC;",
  },
  {
    label: "Shop Rent & Solar",
    sql: "SELECT p.name AS shop, rp.billing_month, rp.rent_amount, rp.solar_charge, rp.total_amount, rp.paid_date FROM rental_payments rp JOIN rental_properties p ON p.id = rp.property_id ORDER BY rp.billing_month DESC;",
  },
  {
    label: "Loans & Insurance Docs",
    sql: "SELECT l.name, l.status, l.current_balance, l.emi_amount FROM loans l;",
  },
];

export default function SqlStudioPage() {
  const [dbPath, setDbPath] = useState("");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [query, setQuery] = useState(PRESET_QUERIES[0].sql);
  const [allowWrite, setAllowWrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");

  const loadSchema = useCallback(async () => {
    const res = await fetch("/api/sql", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setDbPath(json.dbPath ?? "");
      setTables(json.tables ?? []);
    }
  }, []);

  useEffect(() => {
    loadSchema();
  }, [loadSchema]);

  const runQuery = useCallback(
    async (sqlToRun?: string) => {
      const sql = (sqlToRun ?? query).trim();
      if (!sql) return;
      setRunning(true);
      setError("");
      try {
        const res = await fetch("/api/sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: sql, allowWrite }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Query failed");
          setResult(null);
        } else {
          setResult(json);
          if (json.mode === "write") {
            await loadSchema();
          }
        }
      } finally {
        setRunning(false);
      }
    },
    [query, allowWrite, loadSchema]
  );

  function previewTable(tableName: string) {
    const q = `SELECT * FROM "${tableName}" LIMIT 100;`;
    setSelectedTable(tableName);
    setQuery(q);
    runQuery(q);
  }

  function downloadResultCsv() {
    if (!result?.rows || !result.columns) return;
    const header = result.columns.join(",");
    const lines = result.rows.map((r) =>
      result
        .columns!.map((c) => {
          const val = r[c] == null ? "" : String(r[c]);
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bps_sql_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-6 w-6 text-indigo-600" />
            SQL Studio
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
            {dbPath || "./data/bps_income.db"}
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allowWrite}
            onChange={(e) => setAllowWrite(e.target.checked)}
          />
          <ShieldAlert
            className={`h-3.5 w-3.5 ${
              allowWrite ? "text-rose-600" : "text-slate-400"
            }`}
          />
          <span className={allowWrite ? "text-rose-700 font-semibold" : "text-slate-600"}>
            Allow Writes (INSERT/UPDATE/DELETE)
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Left: Table Browser */}
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="px-4 py-3 bg-slate-900 text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
            <Table2 className="h-4 w-4 text-emerald-400" />
            Tables ({tables.length})
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {tables.map((t) => (
              <div key={t.name} className="p-3 hover:bg-indigo-50/40">
                <button
                  type="button"
                  onClick={() => previewTable(t.name)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span
                    className={`text-xs font-mono font-semibold ${
                      selectedTable === t.name
                        ? "text-indigo-700"
                        : "text-slate-800"
                    }`}
                  >
                    {t.name}
                  </span>
                  <span className="text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {t.rowCount}
                  </span>
                </button>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.columns.slice(0, 6).map((c) => (
                    <span
                      key={c.name}
                      className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded"
                    >
                      {c.name}
                    </span>
                  ))}
                  {t.columns.length > 6 && (
                    <span className="text-[10px] text-slate-400">
                      +{t.columns.length - 6}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Query Editor & Results */}
        <div className="lg:col-span-3 space-y-4">
          {/* Quick Presets */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_QUERIES.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setQuery(p.sql);
                  runQuery(p.sql);
                }}
                className="text-xs px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-700 font-medium transition"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Editor Box */}
          <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-sm">
            <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                SQLite Query Editor (Ctrl + Enter to run)
              </span>
              <button
                type="button"
                disabled={running}
                onClick={() => runQuery()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold px-3 py-1 text-xs"
              >
                <Play className="h-3.5 w-3.5" />
                {running ? "Running..." : "Run Query"}
              </button>
            </div>
            <textarea
              rows={6}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  runQuery();
                }
              }}
              spellCheck={false}
              className="w-full bg-slate-950 text-emerald-300 font-mono text-xs p-4 focus:outline-none resize-y"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-mono text-rose-700">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <div>
                  {result.mode === "read" ? (
                    <span>
                      Returned <strong>{result.totalRows}</strong> rows in{" "}
                      <strong>{result.durationMs}ms</strong>
                      {result.truncated ? " (showing first 500)" : ""}
                    </span>
                  ) : (
                    <span>
                      Write executed: <strong>{result.changes}</strong> row(s)
                      affected in <strong>{result.durationMs}ms</strong>
                    </span>
                  )}
                </div>
                {result.mode === "read" && result.rows && result.rows.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadResultCsv}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                )}
              </div>

              {result.mode === "read" && result.columns && result.rows && (
                <div className="overflow-x-auto max-h-[420px]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200">
                      <tr>
                        {result.columns.map((col) => (
                          <th
                            key={col}
                            className="px-3 py-2 font-mono font-semibold whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={result.columns.length}
                            className="px-4 py-6 text-center text-slate-400"
                          >
                            Query returned 0 rows.
                          </td>
                        </tr>
                      ) : (
                        result.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50">
                            {result.columns!.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-2 font-mono tabular-nums text-slate-700 whitespace-nowrap max-w-xs truncate"
                                title={
                                  row[col] == null ? "" : String(row[col])
                                }
                              >
                                {row[col] == null ? (
                                  <span className="text-slate-300">NULL</span>
                                ) : (
                                  String(row[col])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
