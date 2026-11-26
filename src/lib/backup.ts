import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { db, paths, resetDbConnection, sqlite } from "@/db";
import { runMigrations, validateDatabaseSchema } from "@/db/migrator";
import {
  appSettings,
  assetRegister,
  documents,
  financialGoals,
  incomeEntries,
  insurancePolicies,
  investmentCategories,
  investmentHoldings,
  investmentTransactions,
  loans,
  loanTransactions,
  netWorthSnapshots,
  rentalPayments,
  rentalProperties,
} from "@/db/schema";
import { getEnvConfig } from "./env";
import { AppError } from "./errors";
import { logger } from "./logging";
import { resolveContainedPath } from "./upload-security";

export interface BackupManifest {
  backupVersion: string;
  appVersion: string;
  createdAt: string;
  encrypted: boolean;
  db: {
    filename: string;
    sizeBytes: number;
    sha256: string;
  };
  documentCount: number;
  documents: Array<{
    filePath: string;
    sizeBytes: number;
    sha256: string;
  }>;
  recordCounts: Record<string, number>;
}

const APP_VERSION = "0.1.0";
const BACKUP_VERSION = "2.0";
const ENCRYPTED_MAGIC = Buffer.from("BPSENC01", "ascii");

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
}

export function encryptBackupPayload(
  plainZip: Buffer,
  passphrase: string
): Buffer {
  if (!passphrase || passphrase.length < 8) {
    throw new AppError(
      "Encryption passphrase must be at least 8 characters",
      400,
      "WEAK_PASSPHRASE"
    );
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainZip), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENCRYPTED_MAGIC, salt, iv, tag, encrypted]);
}

export function decryptBackupPayload(
  payload: Buffer,
  passphrase: string
): Buffer {
  if (
    payload.length < ENCRYPTED_MAGIC.length + 16 + 12 + 16 ||
    !payload.subarray(0, 8).equals(ENCRYPTED_MAGIC)
  ) {
    throw new AppError(
      "Invalid encrypted backup format",
      400,
      "INVALID_ENCRYPTED_BACKUP"
    );
  }
  const salt = payload.subarray(8, 24);
  const iv = payload.subarray(24, 36);
  const tag = payload.subarray(36, 52);
  const ciphertext = payload.subarray(52);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new AppError(
      "Decryption failed: incorrect passphrase or corrupted backup",
      403,
      "DECRYPTION_FAILED"
    );
  }
}

export function collectRecordCounts(
  sqliteInstance: Database.Database = sqlite
): Record<string, number> {
  const tables = [
    "app_settings",
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
  ];
  const counts: Record<string, number> = {};
  for (const tbl of tables) {
    try {
      const row = sqliteInstance
        .prepare(`SELECT COUNT(*) AS cnt FROM "${tbl}"`)
        .get() as { cnt: number };
      counts[tbl] = row?.cnt ?? 0;
    } catch {
      counts[tbl] = 0;
    }
  }
  return counts;
}

export function rotateBackups(maxRetained?: number): number {
  const cfg = getEnvConfig();
  const limit = maxRetained ?? cfg.maxBackupsRetained;
  const backups = listSqliteBackups();
  if (backups.length <= limit) return 0;

  let removed = 0;
  for (const old of backups.slice(limit)) {
    const target = resolveContainedPath(paths.BACKUP_DIR, old.filename);
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      removed++;
    }
  }
  return removed;
}

export async function createFullBackupBundle(options?: {
  prefix?: string;
  passphrase?: string;
}): Promise<{
  filename: string;
  fullPath: string;
  sizeBytes: number;
  createdAt: string;
  manifest: BackupManifest;
  verified: boolean;
}> {
  if (!fs.existsSync(paths.BACKUP_DIR)) {
    fs.mkdirSync(paths.BACKUP_DIR, { recursive: true });
  }
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const prefix = options?.prefix || "bps_wealth";
  const stagingDbPath = path.join(
    paths.BACKUP_DIR,
    `.staging_${stamp}_${crypto.randomUUID()}.db`
  );

  try {
    await sqlite.backup(stagingDbPath);

    // Verify staged DB integrity before packaging
    const verifyConn = new Database(stagingDbPath, { readonly: true });
    try {
      validateDatabaseSchema(verifyConn);
    } finally {
      verifyConn.close();
    }

    const dbBuf = fs.readFileSync(stagingDbPath);
    const dbSha = sha256(dbBuf);

    const zipEntries: Record<string, Uint8Array> = {
      "database/bps_income.db": new Uint8Array(dbBuf),
    };

    const docEntries: BackupManifest["documents"] = [];
    if (fs.existsSync(paths.DOCS_DIR)) {
      const files = fs.readdirSync(paths.DOCS_DIR);
      for (const file of files) {
        const fullDocPath = resolveContainedPath(paths.DOCS_DIR, file);
        const stat = fs.statSync(fullDocPath);
        if (!stat.isFile()) continue;
        const docBuf = fs.readFileSync(fullDocPath);
        zipEntries[`documents/${file}`] = new Uint8Array(docBuf);
        docEntries.push({
          filePath: file,
          sizeBytes: docBuf.length,
          sha256: sha256(docBuf),
        });
      }
    }

    const createdAt = new Date().toISOString();
    const manifest: BackupManifest = {
      backupVersion: BACKUP_VERSION,
      appVersion: APP_VERSION,
      createdAt,
      encrypted: Boolean(options?.passphrase),
      db: {
        filename: "database/bps_income.db",
        sizeBytes: dbBuf.length,
        sha256: dbSha,
      },
      documentCount: docEntries.length,
      documents: docEntries,
      recordCounts: collectRecordCounts(),
    };

    zipEntries["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    const zipBytes = Buffer.from(zipSync(zipEntries, { level: 6 }));

    const finalBytes = options?.passphrase
      ? encryptBackupPayload(zipBytes, options.passphrase)
      : zipBytes;

    const ext = options?.passphrase ? ".bpsbak" : ".zip";
    const filename = `${prefix}_${stamp}${ext}`;
    const fullPath = resolveContainedPath(paths.BACKUP_DIR, filename);
    fs.writeFileSync(fullPath, finalBytes, { mode: 0o600 });

    // Verify written backup can actually be parsed and validated
    const verification = verifyAndPreviewBackupBuffer(
      fs.readFileSync(fullPath),
      options?.passphrase
    );
    if (!verification.valid) {
      throw new AppError(
        "Created backup failed post-write verification",
        500,
        "BACKUP_VERIFY_FAILED"
      );
    }

    const stat = fs.statSync(fullPath);
    const now = new Date().toISOString();
    sqlite
      .prepare(
        "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)"
      )
      .run("last_backup_at", now, now);

    rotateBackups();

    logger.info("backup_created", {
      filename,
      sizeBytes: stat.size,
      docCount: docEntries.length,
      encrypted: Boolean(options?.passphrase),
    });

    return {
      filename,
      fullPath,
      sizeBytes: stat.size,
      createdAt: now,
      manifest,
      verified: true,
    };
  } finally {
    if (fs.existsSync(stagingDbPath)) {
      fs.unlinkSync(stagingDbPath);
    }
  }
}

export async function createSqliteBackup() {
  return createFullBackupBundle({ prefix: "bps_wealth" });
}

export function listSqliteBackups(): Array<{
  filename: string;
  sizeBytes: number;
  createdAt: string;
  format: "zip" | "encrypted" | "sqlite";
}> {
  if (!fs.existsSync(paths.BACKUP_DIR)) return [];
  return fs
    .readdirSync(paths.BACKUP_DIR)
    .filter(
      (f) =>
        !f.startsWith(".") &&
        (f.endsWith(".zip") || f.endsWith(".bpsbak") || f.endsWith(".db"))
    )
    .map((filename) => {
      const stat = fs.statSync(path.join(paths.BACKUP_DIR, filename));
      const format: "zip" | "encrypted" | "sqlite" = filename.endsWith(".bpsbak")
        ? "encrypted"
        : filename.endsWith(".zip")
          ? "zip"
          : "sqlite";
      return {
        filename,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        format,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function verifyAndPreviewBackupBuffer(
  rawBuffer: Buffer,
  passphrase?: string
): {
  valid: boolean;
  manifest: BackupManifest;
  liveCounts: Record<string, number>;
  warnings: string[];
} {
  let zipBuffer = rawBuffer;
  if (
    rawBuffer.length >= ENCRYPTED_MAGIC.length &&
    rawBuffer.subarray(0, 8).equals(ENCRYPTED_MAGIC)
  ) {
    if (!passphrase) {
      throw new AppError(
        "Passphrase is required to inspect encrypted backup",
        400,
        "PASSPHRASE_REQUIRED"
      );
    }
    zipBuffer = decryptBackupPayload(rawBuffer, passphrase);
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(zipBuffer));
  } catch {
    throw new AppError("Backup archive is corrupted or unreadable", 400, "INVALID_ARCHIVE");
  }

  if (!entries["manifest.json"] || !entries["database/bps_income.db"]) {
    throw new AppError(
      "Backup archive is missing manifest.json or database snapshot",
      400,
      "INCOMPLETE_BACKUP"
    );
  }

  const manifest = JSON.parse(
    strFromU8(entries["manifest.json"])
  ) as BackupManifest;
  const dbBuf = Buffer.from(entries["database/bps_income.db"]);
  if (sha256(dbBuf) !== manifest.db.sha256) {
    throw new AppError(
      "Database checksum mismatch inside backup archive",
      400,
      "CHECKSUM_MISMATCH"
    );
  }

  const warnings: string[] = [];
  for (const docMeta of manifest.documents || []) {
    const entry = entries[`documents/${docMeta.filePath}`];
    if (!entry) {
      throw new AppError(
        `Missing document file in backup: ${docMeta.filePath}`,
        400,
        "MISSING_BACKUP_DOC"
      );
    }
    if (sha256(Buffer.from(entry)) !== docMeta.sha256) {
      throw new AppError(
        `Document checksum mismatch: ${docMeta.filePath}`,
        400,
        "DOC_CHECKSUM_MISMATCH"
      );
    }
  }

  // Write DB to temp file and run SQLite integrity & schema validation
  if (!fs.existsSync(paths.BACKUP_DIR)) {
    fs.mkdirSync(paths.BACKUP_DIR, { recursive: true });
  }
  const tmpCheckPath = path.join(
    paths.BACKUP_DIR,
    `.verify_${crypto.randomUUID()}.db`
  );
  try {
    fs.writeFileSync(tmpCheckPath, dbBuf, { mode: 0o600 });
    const conn = new Database(tmpCheckPath, { readonly: true });
    try {
      const integrity = conn.pragma("integrity_check") as Array<{
        integrity_check: string;
      }>;
      if (integrity[0]?.integrity_check !== "ok") {
        throw new AppError(
          "Backup SQLite database failed integrity_check",
          400,
          "CORRUPT_BACKUP_DB"
        );
      }
      const liveCounts = collectRecordCounts(conn);
      return {
        valid: true,
        manifest,
        liveCounts,
        warnings,
      };
    } finally {
      conn.close();
    }
  } finally {
    if (fs.existsSync(tmpCheckPath)) {
      fs.unlinkSync(tmpCheckPath);
    }
  }
}

export async function restoreFromBackupBuffer(
  rawBuffer: Buffer,
  passphrase?: string
): Promise<{
  restored: boolean;
  safetyBackupFilename: string;
  manifest: BackupManifest;
}> {
  // 1. Verify backup completely BEFORE touching live database
  const preview = verifyAndPreviewBackupBuffer(rawBuffer, passphrase);

  let zipBuffer = rawBuffer;
  if (
    rawBuffer.length >= ENCRYPTED_MAGIC.length &&
    rawBuffer.subarray(0, 8).equals(ENCRYPTED_MAGIC)
  ) {
    zipBuffer = decryptBackupPayload(rawBuffer, passphrase!);
  }
  const entries = unzipSync(new Uint8Array(zipBuffer));
  const newDbBuf = Buffer.from(entries["database/bps_income.db"]);

  // 2. Create verified pre-restore safety backup of current live state
  const safety = await createFullBackupBundle({ prefix: "pre_restore_safety" });

  // 3. Stage restored DB and run any forward migrations on the staged copy FIRST
  const stagedRestoreDb = path.join(
    paths.DATA_DIR,
    `.restore_stage_${crypto.randomUUID()}.db`
  );
  try {
    fs.writeFileSync(stagedRestoreDb, newDbBuf, { mode: 0o600 });
    const stageConn = new Database(stagedRestoreDb, { timeout: 10000 });
    try {
      runMigrations(stageConn);
      validateDatabaseSchema(stageConn);
    } finally {
      stageConn.close();
    }

    // 4. Close live SQLite connection and swap atomically
    resetDbConnection();
    for (const suffix of ["", "-wal", "-shm"]) {
      const target = `${paths.DB_PATH}${suffix}`;
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }
    fs.renameSync(stagedRestoreDb, paths.DB_PATH);

    // 5. Restore documents safely (keep existing documents backed up in safety zip; replace cleanly)
    if (!fs.existsSync(paths.DOCS_DIR)) {
      fs.mkdirSync(paths.DOCS_DIR, { recursive: true });
    }
    for (const docMeta of preview.manifest.documents || []) {
      const targetDoc = resolveContainedPath(paths.DOCS_DIR, docMeta.filePath);
      const docBytes = Buffer.from(entries[`documents/${docMeta.filePath}`]);
      fs.writeFileSync(targetDoc, docBytes, { mode: 0o600 });
    }

    // Re-open live connection & validate
    validateDatabaseSchema(sqlite);
    logger.info("backup_restored", {
      safetyBackup: safety.filename,
      backupCreatedAt: preview.manifest.createdAt,
    });

    return {
      restored: true,
      safetyBackupFilename: safety.filename,
      manifest: preview.manifest,
    };
  } catch (err) {
    if (fs.existsSync(stagedRestoreDb)) {
      fs.unlinkSync(stagedRestoreDb);
    }
    throw err;
  }
}

export function exportAllDataJson() {
  const safeSettings = db
    .select()
    .from(appSettings)
    .all()
    .filter((s) => s.key !== "pin_hash");

  return {
    exportedAt: new Date().toISOString(),
    settings: safeSettings,
    categories: db.select().from(investmentCategories).all(),
    incomeEntries: db.select().from(incomeEntries).all(),
    investmentHoldings: db.select().from(investmentHoldings).all(),
    investmentTransactions: db.select().from(investmentTransactions).all(),
    rentalProperties: db.select().from(rentalProperties).all(),
    rentalPayments: db.select().from(rentalPayments).all(),
    loans: db.select().from(loans).all(),
    loanTransactions: db.select().from(loanTransactions).all(),
    insurancePolicies: db.select().from(insurancePolicies).all(),
    assets: db.select().from(assetRegister).all(),
    netWorthSnapshots: db.select().from(netWorthSnapshots).all(),
    financialGoals: db.select().from(financialGoals).all(),
    documents: db.select().from(documents).all(),
  };
}

export async function exportWorkbookBuffer(): Promise<Buffer> {
  const data = exportAllDataJson();
  const wb = new ExcelJS.Workbook();
  wb.creator = "BPS Wealth";
  wb.created = new Date();

  const appendSheet = (name: string, rows: Array<Record<string, unknown>>) => {
    const ws = wb.addWorksheet(name.slice(0, 31));
    const sourceRows = rows.length > 0 ? rows : [{ note: "No records yet" }];
    const keys = Object.keys(sourceRows[0]);
    ws.addRow(keys);
    for (const row of sourceRows) {
      ws.addRow(keys.map((k) => row[k] ?? ""));
    }
  };

  appendSheet("Income", data.incomeEntries as Array<Record<string, unknown>>);
  appendSheet("Holdings", data.investmentHoldings as Array<Record<string, unknown>>);
  appendSheet(
    "Investment_Txns",
    data.investmentTransactions as Array<Record<string, unknown>>
  );
  appendSheet("Rentals", data.rentalProperties as Array<Record<string, unknown>>);
  appendSheet("Rent_Payments", data.rentalPayments as Array<Record<string, unknown>>);
  appendSheet("Loans", data.loans as Array<Record<string, unknown>>);
  appendSheet("Loan_Ledger", data.loanTransactions as Array<Record<string, unknown>>);
  appendSheet("Insurance", data.insurancePolicies as Array<Record<string, unknown>>);
  appendSheet("Assets", data.assets as Array<Record<string, unknown>>);
  appendSheet("Net_Worth", data.netWorthSnapshots as Array<Record<string, unknown>>);
  appendSheet("Goals", data.financialGoals as Array<Record<string, unknown>>);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
