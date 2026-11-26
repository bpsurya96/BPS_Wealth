import { NextRequest, NextResponse } from "next/server";
import { paths, sqlite } from "@/db";
import { requireUnlocked } from "@/lib/auth";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  const tablesRaw = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as Array<{ name: string }>;

  const tables = tablesRaw.map((t) => {
    const safeName = t.name.replace(/"/g, '""');
    const cols = sqlite
      .prepare(`PRAGMA table_info("${safeName}")`)
      .all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;
    const countRow = sqlite
      .prepare(`SELECT COUNT(*) AS cnt FROM "${safeName}"`)
      .get() as { cnt: number };

    return {
      name: t.name,
      rowCount: countRow?.cnt ?? 0,
      columns: cols,
    };
  });

  return NextResponse.json({
    dbPath: paths.DB_PATH,
    tables,
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const rawSql = String(body.query || "").trim();
    const allowWrite = Boolean(body.allowWrite);

    if (!rawSql) {
      return NextResponse.json(
        { error: "SQL query cannot be empty" },
        { status: 400 }
      );
    }

    const cleaned = rawSql.replace(/^(--.*$|\/\*[\s\S]*?\*\/|\s)+/gm, "").trim();
    const firstWord = cleaned.split(/\s+/)[0]?.toUpperCase() || "";
    const isReadOnly = ["SELECT", "WITH", "PRAGMA", "EXPLAIN"].includes(
      firstWord
    );

    if (!isReadOnly && !allowWrite) {
      return NextResponse.json(
        {
          error:
            "Write queries are blocked in Read-Only mode. Enable 'Allow Writes' to run INSERT/UPDATE/DELETE.",
        },
        { status: 403 }
      );
    }

    const start = performance.now();
    const stmt = sqlite.prepare(rawSql);

    if (stmt.reader) {
      const rows = stmt.all() as Array<Record<string, unknown>>;
      const durationMs = Math.round(performance.now() - start);
      const columns =
        rows.length > 0
          ? Object.keys(rows[0])
          : stmt.columns().map((c) => c.name);
      return NextResponse.json({
        mode: "read",
        columns,
        rows: rows.slice(0, 500),
        totalRows: rows.length,
        truncated: rows.length > 500,
        durationMs,
      });
    } else {
      const info = stmt.run();
      const durationMs = Math.round(performance.now() - start);
      return NextResponse.json({
        mode: "write",
        changes: info.changes,
        lastInsertRowid: Number(info.lastInsertRowid),
        durationMs,
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SQL execution failed" },
      { status: 400 }
    );
  }
}
