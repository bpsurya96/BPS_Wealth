# BPS Wealth — Database Migrations & Schema Management

## 1. Strategy Overview

Schema evolution is governed by versioned SQL migrations under `drizzle/` executed automatically and atomically by `src/db/migrator.ts` on database connection initialization (`src/db/index.ts`), paired with the authoritative Drizzle TypeScript schema in `src/db/schema.ts`.

### Applied Migrations
1. `drizzle/0001_initial_schema.sql`: Idempotent (`CREATE TABLE IF NOT EXISTS`) creation of the 13 baseline tables, allowing seamless adoption of pre-existing SQLite databases without dropping or recreating data.
2. `drizzle/0002_security_and_integrity.sql`:
   - Adds `auth_sessions`, `auth_rate_limits`, `asset_register`, and `import_history`.
   - Safely appends `*_minor` integer columns, `documents.sha256`, `income_entries.rental_payment_id`, and `net_worth_snapshots` unknown-liability columns (`liabilities_known`, `source`, nullable `total_liabilities_minor`/`net_worth_minor`).
   - Backfills all `*_minor` columns from existing `REAL` columns via `CAST(ROUND(col * 100.0) AS INTEGER)`.
3. `drizzle/0003_indexes_and_dedup.sql`: Creates performance and lookup indexes across transaction, income, rental, loan, document, import, and session tables.

---

## 2. Safety Guarantees

- **Automatic Pre-Migration Backup**: Whenever pending migrations are detected on an existing non-empty database, `createPreMigrationBackup()` executes `VACUUM INTO '<backupDir>/pre_migration_<timestamp>_<pid>.db'` before any DDL runs.
- **Idempotent Column Guards**: `executeStatementSafely()` inspects `PRAGMA table_info` before running `ALTER TABLE ... ADD COLUMN` so partially migrated databases never fail or lose data.
- **Transactional Execution**: Each migration file executes inside a SQLite transaction and records its version, filename, SHA-256 checksum, and timestamp in `schema_migrations`.
- **Post-Migration Validation**: `validateDatabaseSchema()` runs `PRAGMA integrity_check` and verifies all 17 required application tables exist.

---

## 3. Rollback & Recovery Instructions

Because SQLite DDL migrations preserve all legacy columns (`gross_amount`, `inhand_amount`, etc.) alongside the new `*_minor` columns:

1. **Stop the application** cleanly (`docker compose down` or stop Node process).
2. **Locate the pre-migration backup** in `./data/backups/pre_migration_<timestamp>.db` (or the latest `.zip`/`.bpsbak` backup).
3. **Verify backup integrity** before swapping:
   ```bash
   sqlite3 ./data/backups/pre_migration_<timestamp>.db "PRAGMA integrity_check;"
   ```
4. **Restore**:
   - Remove active `-wal` and `-shm` files alongside `bps_income.db` (`rm -f ./data/bps_income.db-wal ./data/bps_income.db-shm`).
   - Copy the verified pre-migration backup back to `./data/bps_income.db`.
5. **Restart** the previous application version.
