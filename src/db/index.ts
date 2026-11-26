import Database from "better-sqlite3";
import { drizzle, BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { assertProductionConfig, getEnvConfig } from "@/lib/env";
import { runMigrations } from "./migrator";

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
  drizzleDb?: BetterSQLite3Database<typeof schema>;
  dbPathLoaded?: string;
};

function getResolvedPaths() {
  const envCfg = getEnvConfig();
  return {
    DATA_DIR: path.dirname(envCfg.dbPath),
    BACKUP_DIR: envCfg.backupsDir,
    DB_PATH: envCfg.dbPath,
    DOCS_DIR: envCfg.docsDir,
  };
}

function ensureDirs(p: ReturnType<typeof getResolvedPaths>) {
  if (!fs.existsSync(p.DATA_DIR)) {
    fs.mkdirSync(p.DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(p.BACKUP_DIR)) {
    fs.mkdirSync(p.BACKUP_DIR, { recursive: true });
  }
  if (!fs.existsSync(p.DOCS_DIR)) {
    fs.mkdirSync(p.DOCS_DIR, { recursive: true });
  }
}

export function resetDbConnection() {
  if (globalForDb.sqlite) {
    try {
      globalForDb.sqlite.close();
    } catch {
      // ignore close errors during reset
    }
  }
  globalForDb.sqlite = undefined;
  globalForDb.drizzleDb = undefined;
  globalForDb.dbPathLoaded = undefined;
}

function getSqlite(): Database.Database {
  assertProductionConfig();
  const p = getResolvedPaths();
  if (globalForDb.sqlite && globalForDb.dbPathLoaded !== p.DB_PATH) {
    resetDbConnection();
  }
  if (!globalForDb.sqlite) {
    ensureDirs(p);
    const instance = new Database(p.DB_PATH, { timeout: 10000 });
    runMigrations(instance, { backupDir: p.BACKUP_DIR });
    globalForDb.sqlite = instance;
    globalForDb.dbPathLoaded = p.DB_PATH;
  }
  return globalForDb.sqlite;
}

function getDrizzleDb(): BetterSQLite3Database<typeof schema> {
  if (!globalForDb.drizzleDb) {
    globalForDb.drizzleDb = drizzle(getSqlite(), { schema });
  }
  return globalForDb.drizzleDb;
}

/**
 * Opens an isolated read-only SQLite connection for SQL Studio inspection.
 * Guarantees at the SQLite C engine layer that no writes or setting mutations can occur.
 */
export function openReadOnlySqlite(): Database.Database {
  const p = getResolvedPaths();
  // Ensure DB exists and migrations have run first
  getSqlite();
  const ro = new Database(p.DB_PATH, {
    readonly: true,
    fileMustExist: true,
    timeout: 2000,
  });
  ro.pragma("busy_timeout = 2000");
  return ro;
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

export const paths = new Proxy(
  {} as ReturnType<typeof getResolvedPaths>,
  {
    get(_target, prop) {
      const current = getResolvedPaths();
      return Reflect.get(current, prop, current);
    },
  }
);
