import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { getEnvConfig } from "@/lib/env";

const envCfg = getEnvConfig();
const DB_PATH = envCfg.dbPath;
const DATA_DIR = path.dirname(DB_PATH);
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DOCS_DIR = envCfg.docsDir;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }
}

function initializeTables(sqliteInstance: Database.Database) {
  sqliteInstance.pragma("busy_timeout = 10000");
  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");

  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS income_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      month TEXT NOT NULL,
      date TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'salary',
      gross_amount REAL NOT NULL DEFAULT 0,
      inhand_amount REAL NOT NULL DEFAULT 0,
      tds_amount REAL NOT NULL DEFAULT 0,
      account TEXT DEFAULT 'ICICI',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investment_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      scheme_code TEXT DEFAULT '',
      ticker TEXT DEFAULT '',
      platform TEXT DEFAULT '',
      planned_sip REAL NOT NULL DEFAULT 0,
      target_amount REAL NOT NULL DEFAULT 0,
      invested_amount REAL NOT NULL DEFAULT 0,
      current_value REAL NOT NULL DEFAULT 0,
      units REAL NOT NULL DEFAULT 0,
      avg_nav REAL NOT NULL DEFAULT 0,
      current_nav REAL NOT NULL DEFAULT 0,
      interest_rate REAL NOT NULL DEFAULT 0,
      start_date TEXT DEFAULT '',
      maturity_date TEXT DEFAULT '',
      tenure_months INTEGER NOT NULL DEFAULT 0,
      is_emergency_fund INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      holding_id INTEGER NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'sip',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      fx_rate REAL NOT NULL DEFAULT 1,
      nav_or_price REAL NOT NULL DEFAULT 0,
      units REAL NOT NULL DEFAULT 0,
      employer_amount REAL NOT NULL DEFAULT 0,
      remarks TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rental_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      tenant_name TEXT DEFAULT '',
      advance_paid REAL NOT NULL DEFAULT 0,
      advance_pending REAL NOT NULL DEFAULT 0,
      monthly_rent REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'occupied',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rental_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      property_id INTEGER NOT NULL REFERENCES rental_properties(id) ON DELETE CASCADE,
      billing_month TEXT NOT NULL,
      rent_amount REAL NOT NULL DEFAULT 0,
      solar_charge REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_date TEXT DEFAULT '',
      payment_mode TEXT DEFAULT 'UPI',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      lender TEXT DEFAULT '',
      principal_sanctioned REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      interest_rate REAL NOT NULL DEFAULT 0,
      emi_amount REAL NOT NULL DEFAULT 0,
      tenure_months INTEGER NOT NULL DEFAULT 0,
      start_date TEXT DEFAULT '',
      closed_date TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      txn_date TEXT NOT NULL,
      description TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'emi',
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance_after REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS insurance_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      policy_type TEXT NOT NULL DEFAULT 'term',
      provider TEXT DEFAULT '',
      premium_amount REAL NOT NULL DEFAULT 0,
      premium_frequency TEXT NOT NULL DEFAULT 'annual',
      cover_amount TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      expiry_date TEXT DEFAULT '',
      maturity_date TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      date TEXT NOT NULL,
      total_assets REAL NOT NULL DEFAULT 0,
      total_liabilities REAL NOT NULL DEFAULT 0,
      net_worth REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS financial_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'wealth',
      target_amount REAL NOT NULL DEFAULT 0,
      current_amount REAL NOT NULL DEFAULT 0,
      target_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investment_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      supports_sip INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'insurance',
      entity_id INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes INTEGER NOT NULL DEFAULT 0,
      file_path TEXT NOT NULL,
      ai_summary TEXT DEFAULT '',
      uploaded_at TEXT NOT NULL
    );
  `);

  const now = new Date().toISOString();
  const insertDefaultSetting = sqliteInstance.prepare(
    "INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
  );
  insertDefaultSetting.run("usd_inr_rate", "84.5", now);
  insertDefaultSetting.run("emergency_fund_target", "600000", now);
  insertDefaultSetting.run("pin_enabled", "false", now);

  const insertDefaultCategory = sqliteInstance.prepare(
    "INSERT OR IGNORE INTO investment_categories (slug, label, color, supports_sip, is_system, created_at) VALUES (?, ?, ?, ?, 1, ?)"
  );
  const defaults: Array<[string, string, string, number]> = [
    ["mutual_fund", "Mutual Funds", "#6366f1", 1],
    ["stock", "Stocks", "#10b981", 1],
    ["nps", "NPS", "#0ea5e9", 1],
    ["ppf", "PPF", "#14b8a6", 1],
    ["etf_us", "US ETFs", "#8b5cf6", 1],
    ["etf_in", "India ETFs", "#06b6d4", 1],
    ["fd", "Fixed Deposit", "#f59e0b", 0],
    ["rd", "Recurring Deposit", "#f97316", 1],
    ["chit", "Chit Fund", "#ec4899", 1],
    ["esop", "ESOP", "#3b82f6", 0],
    ["gold_silver", "Gold & Silver", "#eab308", 1],
    ["bond", "Bonds", "#64748b", 0],
  ];
  for (const [slug, label, color, supportsSip] of defaults) {
    insertDefaultCategory.run(slug, label, color, supportsSip, now);
  }
}

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
  drizzleDb?: BetterSQLite3Database<typeof schema>;
};

function getSqlite(): Database.Database {
  if (!globalForDb.sqlite) {
    ensureDirs();
    const instance = new Database(DB_PATH, { timeout: 10000 });
    initializeTables(instance);
    globalForDb.sqlite = instance;
  }
  return globalForDb.sqlite;
}

function getDrizzleDb(): BetterSQLite3Database<typeof schema> {
  if (!globalForDb.drizzleDb) {
    globalForDb.drizzleDb = drizzle(getSqlite(), { schema });
  }
  return globalForDb.drizzleDb;
}

export const sqlite: Database.Database = new Proxy(
  {} as Database.Database,
  {
    get(_target, prop) {
      const instance = getSqlite();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  }
);

export const db: BetterSQLite3Database<typeof schema> = new Proxy(
  {} as BetterSQLite3Database<typeof schema>,
  {
    get(_target, prop) {
      const instance = getDrizzleDb();
      const value = Reflect.get(instance, prop, instance);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  }
);

export const paths = { DATA_DIR, BACKUP_DIR, DB_PATH, DOCS_DIR };
