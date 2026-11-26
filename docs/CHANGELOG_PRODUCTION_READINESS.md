# BPS Wealth — Production Readiness Changelog

## Summary of Changes (`feature/production-readiness`)

### Phase 1 — Security & Privacy
- Removed hardcoded personal financial data, property/loan details, and sample defaults from `src/lib/excel-importer.ts`, `scripts/verify.ts`, `src/app/api/quick-log/route.ts`, `src/app/quick-log/page.tsx`, and `src/components/AiAssistantDrawer.tsx`.
- Removed hardcoded fallback secret `bps-local-tracker-secret-v1` in `src/lib/auth.ts`; added mandatory >= 32-char `BPS_PIN_SECRET` enforcement in production (`src/lib/env.ts`).
- Replaced unsalted SHA-256 PIN hashing with **Argon2id** (`argon2`), added server-side `auth_sessions` with expiration and revocation, persistent `auth_rate_limits` progressive backoff/lockout, `Secure` cookies in production, first-run `BPS_OWNER_SETUP_TOKEN` flow, and `verifyCsrf()` origin validation (`src/lib/csrf.ts`).
- Fixed `AppShell.tsx` fail-open auth handling.
- Hardened SQL Studio (`src/lib/sql-studio.ts`, `src/app/api/sql/route.ts`) with an isolated `readonly: true` SQLite connection, single-statement validation, `PRAGMA`/`ATTACH`/`VACUUM` and internal security-table blocking, 500-row & 2s caps, masked `dbName`, and production write disablement.
- Replaced vulnerable `xlsx` with `exceljs` + bounded CSV parsing and added `src/lib/upload-security.ts` (size caps, extension/MIME/magic-byte verification, image dimension limits, spreadsheet complexity bounds, path traversal confinement, and safe download headers).

### Phase 2 — Database & Data Protection
- Added authoritative versioned SQL migrations (`drizzle/0001_initial_schema.sql`, `0002_security_and_integrity.sql`, `0003_indexes_and_dedup.sql`) and `src/db/migrator.ts` with `VACUUM INTO` pre-migration backups and post-migration schema validation.
- Added `src/lib/currency.ts` and `*_minor` integer minor-unit columns across monetary tables with non-destructive backfill.
- Upgraded `src/lib/backup.ts` & `src/app/api/backup/route.ts` to create verified `.zip` and AES-256-GCM `.bpsbak` bundles containing SQLite snapshot + `documents/` + `manifest.json` with SHA-256 checksums, automatic rotation, restore preview, safety pre-restore backup, and atomic restore.
- Added SHA-256 workbook fingerprinting, `import_history` tracking, duplicate detection, diff preview, and safe `replaceExisting=false` default to `src/lib/excel-importer.ts` and `src/app/import/page.tsx`.

### Phase 3 — Financial Calculation Accuracy
- Fixed XIRR (`src/lib/finance.ts`) to aggregate same-date cashflows, handle closed holdings, treat `interest` accruals vs `dividend`/`interest_payout` inflows accurately, and use transaction-level historical `fxRate` for foreign-currency cashflows.
- Fixed partial-sell proportional cost basis in `src/app/api/investments/[id]/transactions/route.ts`.
- Added `asset_register` (`src/app/api/assets/route.ts`) and separated Investment Portfolio, Other Financial Assets, Physical Assets, Liabilities, and Net Worth in `src/services/portfolio.ts`.
- Separated `salary`, `rental`, `dividend`, and `other` income streams and prevented rental double-counting via `rentalPaymentId`.
- Added `normalizeAnnualInsurancePremium()` (`annual` vs `monthly`) and nullable `totalLiabilitiesMinor` + `liabilitiesKnown` for historical snapshots.

### Phase 4–6 — AI, Architecture & UX
- Added timeouts, `AbortSignal` cancellation, retry bounds, Zod schema validation, unknown-field reporting, PII minimization, remote-AI opt-in warnings, and review-before-save UI in `src/lib/ai.ts` and `src/components/AiAssistantDrawer.tsx`.
- Extracted `PortfolioService` (`src/services/portfolio.ts`), `src/lib/validation.ts`, `src/lib/errors.ts`, and `src/lib/logging.ts` (with automatic PII/financial redaction).
- Added `src/components/ConfirmDialog.tsx` across destructive delete/replace/restore flows and improved error handling across pages.

### Phase 7–8 — Testing & Deployment
- Added 26 Vitest unit, security, data-integrity, and E2E workflow tests in `tests/`.
- Added `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `src/app/api/health/route.ts`, updated `.env.example`, and documentation under `docs/`.
