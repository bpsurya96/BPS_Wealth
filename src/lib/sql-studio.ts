import { openReadOnlySqlite, sqlite } from "@/db";
import { getEnvConfig } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logging";

const MAX_SQL_LENGTH = 4000;
const MAX_RESULT_ROWS = 500;
const MAX_EXEC_MS = 2000;

const BLOCKED_TABLES = [
  "app_settings",
  "auth_sessions",
  "auth_rate_limits",
  "schema_migrations",
];

const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM|REINDEX|ANALYZE|PRAGMA|LOAD_EXTENSION|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

function stripSqlCommentsAndLiterals(sql: string): string {
  // Replace single-quoted string literals and double-quoted identifiers only for keyword/semicolon scanning
  return sql
    .replace(/--[^\r\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:''|[^'])*'/g, "''");
}

export function validateReadOnlySql(rawSql: string): string {
  const trimmed = rawSql.trim();
  if (!trimmed) {
    throw new AppError("SQL query cannot be empty", 400, "EMPTY_SQL");
  }
  if (trimmed.length > MAX_SQL_LENGTH) {
    throw new AppError(
      `SQL query exceeds maximum length of ${MAX_SQL_LENGTH} characters`,
      400,
      "SQL_TOO_LONG"
    );
  }

  const scrubbed = stripSqlCommentsAndLiterals(trimmed);
  // Strip at most one trailing semicolon
  const withoutTrailingSemi = scrubbed.replace(/;\s*$/, "").trim();
  if (!withoutTrailingSemi) {
    throw new AppError("SQL query cannot be empty", 400, "EMPTY_SQL");
  }
  if (withoutTrailingSemi.includes(";")) {
    throw new AppError(
      "Multiple SQL statements are not allowed",
      403,
      "MULTI_STATEMENT_BLOCKED"
    );
  }

  const firstToken = withoutTrailingSemi.split(/\s+/)[0]?.toUpperCase() || "";
  if (!["SELECT", "WITH", "EXPLAIN"].includes(firstToken)) {
    throw new AppError(
      "Only single SELECT, WITH ... SELECT, or EXPLAIN read queries are allowed",
      403,
      "READ_ONLY_SQL_VIOLATION"
    );
  }

  if (FORBIDDEN_KEYWORDS.test(withoutTrailingSemi)) {
    throw new AppError(
      "Write, DDL, PRAGMA, ATTACH, or transaction-control keywords are blocked",
      403,
      "FORBIDDEN_SQL_KEYWORD"
    );
  }

  for (const tbl of BLOCKED_TABLES) {
    const pattern = new RegExp(`\\b${tbl}\\b`, "i");
    if (pattern.test(withoutTrailingSemi)) {
      throw new AppError(
        `Access to internal security/system table "${tbl}" is restricted in SQL Studio`,
        403,
        "RESTRICTED_TABLE"
      );
    }
  }

  return trimmed.replace(/;\s*$/, "");
}

export function getSqlStudioSchema() {
  const ro = openReadOnlySqlite();
  try {
    const tablesRaw = ro
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;

    const visibleTables = tablesRaw.filter(
      (t) => !BLOCKED_TABLES.includes(t.name)
    );

    const tables = visibleTables.map((t) => {
      const safeName = t.name.replace(/"/g, '""');
      const cols = ro
        .prepare(`PRAGMA table_info("${safeName}")`)
        .all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;
      const countRow = ro
        .prepare(`SELECT COUNT(*) AS cnt FROM "${safeName}"`)
        .get() as { cnt: number };

      return {
        name: t.name,
        rowCount: countRow?.cnt ?? 0,
        columns: cols,
      };
    });

    const cfg = getEnvConfig();
    return {
      dbName: "bps_income.db",
      readOnlyEnforced: !cfg.sqlStudioAllowWrites,
      sqlStudioEnabled: cfg.sqlStudioEnabled,
      tables,
    };
  } finally {
    ro.close();
  }
}

export function executeSqlStudioQuery(rawSql: string, allowWriteRequested: boolean) {
  const cfg = getEnvConfig();
  if (!cfg.sqlStudioEnabled) {
    throw new AppError(
      "SQL Studio execution is disabled by configuration",
      403,
      "SQL_STUDIO_DISABLED"
    );
  }

  if (allowWriteRequested && !cfg.sqlStudioAllowWrites) {
    throw new AppError(
      "Write operations in SQL Studio are disabled in this environment",
      403,
      "SQL_WRITES_DISABLED"
    );
  }

  // Always prefer isolated read-only execution unless explicitly allowed in non-production
  if (!allowWriteRequested || !cfg.sqlStudioAllowWrites) {
    const cleanedSql = validateReadOnlySql(rawSql);
    const ro = openReadOnlySqlite();
    try {
      const start = performance.now();
      const stmt = ro.prepare(cleanedSql);
      if (!stmt.readonly) {
        throw new AppError(
          "Statement is not read-only",
          403,
          "NON_READONLY_STMT"
        );
      }

      const rows: Array<Record<string, unknown>> = [];
      let truncated = false;
      for (const row of stmt.iterate()) {
        if (performance.now() - start > MAX_EXEC_MS) {
          throw new AppError(
            `Query exceeded ${MAX_EXEC_MS}ms execution limit`,
            408,
            "SQL_TIMEOUT"
          );
        }
        if (rows.length >= MAX_RESULT_ROWS) {
          truncated = true;
          break;
        }
        rows.push(row as Record<string, unknown>);
      }

      const durationMs = Math.round(performance.now() - start);
      const columns =
        rows.length > 0
          ? Object.keys(rows[0])
          : stmt.columns().map((c) => c.name);

      return {
        mode: "read" as const,
        columns,
        rows,
        totalRows: rows.length,
        truncated,
        durationMs,
      };
    } finally {
      ro.close();
    }
  }

  // Development-only explicit write path (still blocks security tables & multi-statements)
  const trimmed = rawSql.trim().replace(/;\s*$/, "");
  const scrubbed = stripSqlCommentsAndLiterals(trimmed);
  if (scrubbed.includes(";")) {
    throw new AppError(
      "Multiple SQL statements are not allowed",
      403,
      "MULTI_STATEMENT_BLOCKED"
    );
  }
  for (const tbl of BLOCKED_TABLES) {
    if (new RegExp(`\\b${tbl}\\b`, "i").test(scrubbed)) {
      throw new AppError(
        `Modifying or reading "${tbl}" in SQL Studio is restricted`,
        403,
        "RESTRICTED_TABLE"
      );
    }
  }

  logger.warn("sql_studio_dev_write", { length: trimmed.length });
  const start = performance.now();
  const stmt = sqlite.prepare(trimmed);
  if (stmt.reader) {
    const rows = stmt.all() as Array<Record<string, unknown>>;
    const durationMs = Math.round(performance.now() - start);
    const columns =
      rows.length > 0
        ? Object.keys(rows[0])
        : stmt.columns().map((c) => c.name);
    return {
      mode: "read" as const,
      columns,
      rows: rows.slice(0, MAX_RESULT_ROWS),
      totalRows: rows.length,
      truncated: rows.length > MAX_RESULT_ROWS,
      durationMs,
    };
  }
  const info = stmt.run();
  const durationMs = Math.round(performance.now() - start);
  return {
    mode: "write" as const,
    changes: info.changes,
    lastInsertRowid: Number(info.lastInsertRowid),
    durationMs,
  };
}
