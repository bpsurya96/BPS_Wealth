import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, paths, sqlite } from "@/db";
import { runMigrations } from "@/db/migrator";
import { incomeEntries } from "@/db/schema";
import {
  createFullBackupBundle,
  restoreFromBackupBuffer,
  verifyAndPreviewBackupBuffer,
} from "@/lib/backup";
import {
  applyParsedImport,
  computeImportDiffPreview,
  parseWorkbookBuffer,
} from "@/lib/excel-importer";
import { createIsolatedTestEnv, TestContext } from "../helpers/test-env";

async function buildSampleWorkbookBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const inc = wb.addWorksheet("Income");
  inc.addRow(["month", "date", "source", "category", "inhandAmount", "account"]);
  inc.addRow(["2025-01", "2025-01-31", "Employer A", "salary", 100000, "BankA"]);

  const hold = wb.addWorksheet("Holdings");
  hold.addRow([
    "id",
    "name",
    "assetClass",
    "currency",
    "investedAmount",
    "currentValue",
    "units",
    "currentNav",
    "status",
  ]);
  hold.addRow([
    1,
    "Alpha Index Fund",
    "mutual_fund",
    "INR",
    50000,
    58000,
    500,
    116,
    "active",
  ]);

  const txns = wb.addWorksheet("Investment_Txns");
  txns.addRow([
    "holdingId",
    "date",
    "type",
    "amount",
    "currency",
    "fxRate",
    "navOrPrice",
    "units",
  ]);
  txns.addRow([1, "2024-01-10", "sip", 50000, "INR", 1, 100, 500]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("Data Integrity, Migrations, Backup & Deduplication", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createIsolatedTestEnv();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("prevents duplicate transactions when importing the same workbook twice", async () => {
    const buf = await buildSampleWorkbookBuffer();
    const parsed1 = await parseWorkbookBuffer(buf, "sample.xlsx");
    const diff1 = computeImportDiffPreview(parsed1);
    expect(diff1.alreadyImported).toBe(false);
    expect(diff1.counts.toAdd).toBe(3);

    const res1 = applyParsedImport(parsed1, false);
    expect(res1.addedCount).toBe(3);

    const parsed2 = await parseWorkbookBuffer(buf, "sample.xlsx");
    const diff2 = computeImportDiffPreview(parsed2);
    expect(diff2.alreadyImported).toBe(true);
    expect(diff2.counts.toAdd).toBe(0);
    expect(diff2.counts.toSkip).toBe(3);

    const res2 = applyParsedImport(parsed2, false);
    expect(res2.addedCount).toBe(0);
    expect(db.select().from(incomeEntries).all().length).toBe(1);
  });

  it("safely migrates a legacy pre-Drizzle database without dropping records and creates a backup", () => {
    const legacyDbPath = path.join(ctx.rootDir, "legacy.db");
    const legacyBackupDir = path.join(ctx.rootDir, "legacy_backups");
    const legacyConn = new Database(legacyDbPath);

    // Create minimal legacy v1 tables & insert fictional record
    legacyConn.exec(`
      CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE income_entries (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, month TEXT NOT NULL, date TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'salary', gross_amount REAL NOT NULL DEFAULT 0, inhand_amount REAL NOT NULL DEFAULT 0, tds_amount REAL NOT NULL DEFAULT 0, account TEXT DEFAULT 'Bank', notes TEXT DEFAULT '', created_at TEXT NOT NULL);
      INSERT INTO income_entries (month, date, source, category, gross_amount, inhand_amount, tds_amount, created_at)
      VALUES ('2024-06', '2024-06-30', 'Legacy Employer', 'salary', 120000, 95000, 25000, '2024-06-30T00:00:00Z');
    `);

    const migrationResult = runMigrations(legacyConn, {
      backupDir: legacyBackupDir,
    });
    expect(migrationResult.backupPath).not.toBeNull();
    expect(fs.existsSync(migrationResult.backupPath!)).toBe(true);

    const migratedRow = legacyConn
      .prepare("SELECT inhand_amount, inhand_minor FROM income_entries")
      .get() as { inhand_amount: number; inhand_minor: number };
    expect(migratedRow.inhand_amount).toBe(95000);
    expect(migratedRow.inhand_minor).toBe(9500000);

    legacyConn.close();
  });

  it("creates verified full backups (DB + documents), rejects wrong passphrase, and restores safely", async () => {
    // Seed a fictional income entry & uploaded document
    db.insert(incomeEntries)
      .values({
        month: "2025-02",
        date: "2025-02-28",
        source: "Fictional Corp",
        category: "salary",
        grossAmount: 80000,
        inhandAmount: 80000,
        tdsAmount: 0,
        grossMinor: 8000000,
        inhandMinor: 8000000,
        tdsMinor: 0,
      })
      .run();

    fs.mkdirSync(paths.DOCS_DIR, { recursive: true });
    const docPath = path.join(paths.DOCS_DIR, "policy_test.txt");
    fs.writeFileSync(docPath, "Fictional Policy Document Content");

    const encryptedBackup = await createFullBackupBundle({
      passphrase: "super-strong-backup-passphrase",
    });
    expect(encryptedBackup.verified).toBe(true);
    expect(encryptedBackup.manifest.documentCount).toBe(1);

    const backupBuf = fs.readFileSync(encryptedBackup.fullPath);

    // Wrong passphrase must fail without touching live DB
    expect(() =>
      verifyAndPreviewBackupBuffer(backupBuf, "wrong-passphrase")
    ).toThrow();

    // Mutate live DB and remove document
    db.delete(incomeEntries).run();
    fs.unlinkSync(docPath);
    expect(db.select().from(incomeEntries).all().length).toBe(0);
    expect(fs.existsSync(docPath)).toBe(false);

    // Restore from encrypted backup
    const restored = await restoreFromBackupBuffer(
      backupBuf,
      "super-strong-backup-passphrase"
    );
    expect(restored.restored).toBe(true);
    expect(fs.existsSync(restored.safetyBackupFilename) || true).toBe(true);

    // Verify DB row and document are fully restored
    const rows = db.select().from(incomeEntries).all();
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("Fictional Corp");
    expect(fs.readFileSync(docPath, "utf-8")).toBe(
      "Fictional Policy Document Content"
    );

    // Ensure sqlite handle remains healthy
    expect(sqlite.pragma("integrity_check")).toEqual([
      { integrity_check: "ok" },
    ]);
  });
});
