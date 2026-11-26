import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { db, paths, sqlite } from "@/db";
import {
  appSettings,
  financialGoals,
  incomeEntries,
  insurancePolicies,
  investmentHoldings,
  investmentTransactions,
  loans,
  loanTransactions,
  netWorthSnapshots,
  rentalPayments,
  rentalProperties,
} from "@/db/schema";

export async function createSqliteBackup(): Promise<{
  filename: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: string;
}> {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const filename = `bps_income_${stamp}.db`;
  const fullPath = path.join(paths.BACKUP_DIR, filename);

  await sqlite.backup(fullPath);

  const stat = fs.statSync(fullPath);
  const now = new Date().toISOString();
  sqlite
    .prepare(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
    )
    .run("last_backup_at", now, now);

  return {
    filename,
    fullPath,
    sizeBytes: stat.size,
    createdAt: now,
  };
}

export function listSqliteBackups(): Array<{
  filename: string;
  sizeBytes: number;
  createdAt: string;
}> {
  if (!fs.existsSync(paths.BACKUP_DIR)) return [];
  return fs
    .readdirSync(paths.BACKUP_DIR)
    .filter((f) => f.endsWith(".db"))
    .map((filename) => {
      const stat = fs.statSync(path.join(paths.BACKUP_DIR, filename));
      return {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function exportAllDataJson() {
  return {
    exportedAt: new Date().toISOString(),
    settings: db.select().from(appSettings).all(),
    incomeEntries: db.select().from(incomeEntries).all(),
    investmentHoldings: db.select().from(investmentHoldings).all(),
    investmentTransactions: db.select().from(investmentTransactions).all(),
    rentalProperties: db.select().from(rentalProperties).all(),
    rentalPayments: db.select().from(rentalPayments).all(),
    loans: db.select().from(loans).all(),
    loanTransactions: db.select().from(loanTransactions).all(),
    insurancePolicies: db.select().from(insurancePolicies).all(),
    netWorthSnapshots: db.select().from(netWorthSnapshots).all(),
    financialGoals: db.select().from(financialGoals).all(),
  };
}

export function exportWorkbookBuffer(): Buffer {
  const data = exportAllDataJson();
  const wb = XLSX.utils.book_new();

  const appendSheet = (name: string, rows: unknown[]) => {
    const sheet = XLSX.utils.json_to_sheet(
      rows.length > 0 ? rows : [{ note: "No records yet" }]
    );
    XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
  };

  appendSheet("Income", data.incomeEntries);
  appendSheet("Holdings", data.investmentHoldings);
  appendSheet("Investment_Txns", data.investmentTransactions);
  appendSheet("Rentals", data.rentalProperties);
  appendSheet("Rent_Payments", data.rentalPayments);
  appendSheet("Loans", data.loans);
  appendSheet("Loan_Ledger", data.loanTransactions);
  appendSheet("Insurance", data.insurancePolicies);
  appendSheet("Net_Worth", data.netWorthSnapshots);
  appendSheet("Goals", data.financialGoals);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
