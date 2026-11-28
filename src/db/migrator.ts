import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { logger } from "@/lib/logging";

export interface MigrationRecord {
  version: string;
  name: string;
  checksum: string;
  applied_at: string;
}

const REQUIRED_TABLES = [
  "app_settings",
  "auth_sessions",
  "auth_rate_limits",
  "income_entries",
  "investment_holdings",
  "investment_transactions",
  "rental_properties",
  "rental_payments",
  "loans",
  "loan_transactions",
  "insurance_policies",
  "asset_register",
  "net_worth_snapshots",
  "financial_goals",
  "investment_categories",
  "documents",
  "import_history",
  "esop_vesting_entries",
];

function getMigrationsDir(): string {
  return path.resolve(process.cwd(), "drizzle");
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (!inSingleQuote && ch === "-" && next === "-") {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === "'") {
      if (inSingleQuote && next === "'") {
        current += "''";
        i++;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && ch === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function columnExists(
  sqliteInstance: Database.Database,
  table: string,
  column: string
): boolean {
  const cols = sqliteInstance
    .prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`)
    .all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function executeStatementSafely(
  sqliteInstance: Database.Database,
  stmt: string
): void {
  const alterMatch = stmt.match(
    /^ALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+ADD\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+/i
  );
  if (alterMatch) {
    const [, table, col] = alterMatch;
    if (columnExists(sqliteInstance, table, col)) {
      return;
    }
  }
  sqliteInstance.exec(stmt);
}

export function createPreMigrationBackup(
  sqliteInstance: Database.Database,
  backupDir: string
): string | null {
  if (!backupDir) return null;
  const existingTables = sqliteInstance
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .all() as Array<{ name: string }>;

  if (existingTables.length === 0) {
    return null;
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const backupPath = path.join(backupDir, `pre_migration_${stamp}_${process.pid}.db`);
  const escaped = backupPath.replace(/'/g, "''");
  sqliteInstance.exec(`VACUUM INTO '${escaped}'`);
  return backupPath;
}

export function validateDatabaseSchema(sqliteInstance: Database.Database): void {
  const integrity = sqliteInstance.pragma("integrity_check") as Array<{
    integrity_check: string;
  }>;
  if (integrity[0]?.integrity_check !== "ok") {
    throw new Error(
      `SQLite integrity check failed: ${JSON.stringify(integrity)}`
    );
  }

  const rows = sqliteInstance
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .all() as Array<{ name: string }>;
  const tableSet = new Set(rows.map((r) => r.name));
  const missing = REQUIRED_TABLES.filter((t) => !tableSet.has(t));
  if (missing.length > 0) {
    throw new Error(
      `Schema validation failed; missing tables: ${missing.join(", ")}`
    );
  }
}

export function seedDefaults(sqliteInstance: Database.Database): void {
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

export function runMigrations(
  sqliteInstance: Database.Database,
  options: { backupDir?: string; migrationsDir?: string } = {}
): { applied: string[]; backupPath: string | null } {
  sqliteInstance.pragma("busy_timeout = 10000");
  sqliteInstance.pragma("journal_mode = WAL");
  sqliteInstance.pragma("foreign_keys = ON");

  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = options.migrationsDir || getMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();

  const appliedRows = sqliteInstance
    .prepare("SELECT version, name, checksum FROM schema_migrations")
    .all() as Array<{ version: string; name: string; checksum: string }>;
  const appliedMap = new Map(appliedRows.map((r) => [r.version, r]));

  const pendingFiles = files.filter((f) => {
    const version = f.split("_")[0];
    return !appliedMap.has(version);
  });

  let backupPath: string | null = null;
  if (pendingFiles.length > 0 && options.backupDir) {
    backupPath = createPreMigrationBackup(sqliteInstance, options.backupDir);
    if (backupPath) {
      logger.info("pre_migration_backup_created", {
        pendingCount: pendingFiles.length,
        backupFile: path.basename(backupPath),
      });
    }
  }

  const applied: string[] = [];

  for (const file of files) {
    const version = file.split("_")[0];
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");

    const existing = appliedMap.get(version);
    if (existing) {
      if (existing.checksum !== checksum) {
        logger.warn("migration_checksum_mismatch", { version, file });
      }
      continue;
    }

    const statements = splitSqlStatements(sql);
    const applyTx = sqliteInstance.transaction(() => {
      for (const stmt of statements) {
        executeStatementSafely(sqliteInstance, stmt);
      }
      sqliteInstance
        .prepare(
          "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)"
        )
        .run(version, file, checksum, new Date().toISOString());
    });
    applyTx();
    applied.push(file);
    logger.info("migration_applied", { version, file });
  }

  validateDatabaseSchema(sqliteInstance);
  seedDefaults(sqliteInstance);

  return { applied, backupPath };
}
