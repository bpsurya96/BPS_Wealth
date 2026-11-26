import fs from "fs";
import path from "path";

const dataDir = path.resolve(process.cwd(), "data");
const backupsDir = path.join(dataDir, "backups");
const docsDir = path.join(dataDir, "documents");

// Remove SQLite DB files (-wal, -shm, .db)
if (fs.existsSync(dataDir)) {
  for (const entry of fs.readdirSync(dataDir)) {
    if (entry.startsWith("bps_income.db")) {
      fs.rmSync(path.join(dataDir, entry), { force: true });
    }
  }
}

// Remove all backup files
if (fs.existsSync(backupsDir)) {
  for (const entry of fs.readdirSync(backupsDir)) {
    fs.rmSync(path.join(backupsDir, entry), { recursive: true, force: true });
  }
}

// Remove all uploaded documents
if (fs.existsSync(docsDir)) {
  for (const entry of fs.readdirSync(docsDir)) {
    fs.rmSync(path.join(docsDir, entry), { recursive: true, force: true });
  }
}

async function main() {
  // Re-initialize fresh schema + default categories & settings
  const { sqlite } = await import("../src/db");
  const tables = sqlite
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as Array<{ name: string }>;

  const counts = tables.map((t) => {
    const row = sqlite
      .prepare(`SELECT COUNT(*) AS c FROM "${t.name.replace(/"/g, '""')}"`)
      .get() as { c: number };
    return { table: t.name, rows: row.c };
  });

  console.log("Database reset complete:", counts);
}

main();
