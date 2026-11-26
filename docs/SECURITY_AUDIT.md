# BPS Wealth — Security & Privacy Audit Register

> **Audit Scope**: Complete repository, runtime configuration, API surface, database layer, file handling, AI pipeline, dependencies, and Git commit history.  
> **Note on Privacy**: No actual personal financial balances, property names/locations, employer names, or credentials are reproduced in this document.

---

## 1. Issue Register & Remediation Status

| ID | Classification | Severity | Priority | Location | Summary & Risk | Status |
|---|---|---|---|---|---|---|
| SEC-01 | Security Vulnerability | **Critical** | P0 | `src/lib/excel-importer.ts`, `scripts/verify.ts`, `src/app/api/quick-log/route.ts`, `src/app/quick-log/page.tsx`, `src/components/AiAssistantDrawer.tsx` | Personal financial figures, employer/property/goal notes, and sample numbers embedded in source code. | **Resolved in HEAD** (see Section 2 for Git history rewrite procedure) |
| SEC-02 | Security Vulnerability | **Critical** | P0 | `src/lib/auth.ts`, `src/lib/env.ts` | Hardcoded fallback HMAC secret `"bps-local-tracker-secret-v1"`; no startup failure in production when `BPS_PIN_SECRET` is absent or weak. | **Resolved** (`resolvePinSecret(true)` enforces >=32-char non-default secret in prod; ephemeral CSPRNG secret in dev) |
| SEC-03 | Security Vulnerability | **Critical** | P0 | `src/lib/auth.ts`, `src/app/api/auth/pin/route.ts` | Unsalted SHA-256 PIN hash; deterministic cookie without server-side session revocation or embedded expiration. | **Resolved** (Argon2id hashing + server-side `auth_sessions` with expiration and revocation) |
| SEC-04 | Security Vulnerability | **Critical** | P0 | `src/lib/auth.ts`, `src/app/api/auth/pin/route.ts`, `src/components/AppShell.tsx` | Unauthenticated visitors could access data and claim ownership via `action: "set"` when PIN was unset; `AppShell` failed open. | **Resolved** (Production requires `BPS_OWNER_SETUP_TOKEN` / `data/.owner-setup-token` for first-run setup; `AppShell` fails closed) |
| SEC-05 | Security Vulnerability | **High** | P0 | `src/app/api/auth/pin/route.ts`, `src/lib/csrf.ts` | No rate limiting/lockout on failed PIN attempts; no `currentPin` check on update/disable; missing `Secure` cookie & CSRF protection. | **Resolved** (Persistent `auth_rate_limits` progressive backoff + lockout, `verifyCsrf()`, `Secure` cookie in prod, `currentPin` required) |
| SEC-06 | Security Vulnerability | **Critical** | P0 | `src/app/api/sql/route.ts`, `src/lib/sql-studio.ts` | First-word regex bypassable via `PRAGMA`, `ATTACH`, `VACUUM INTO`, multi-statements, client-controlled `allowWrite`, and disclosed `DB_PATH` + `app_settings.pin_hash`. | **Resolved** (`openReadOnlySqlite()` C-level readonly handle, single-statement validation, `PRAGMA`/`ATTACH`/`VACUUM` & security tables blocked, 500-row & 2s cap, writes disabled in prod) |
| SEC-07 | Security Vulnerability | **High** | P0 | `package.json`, `src/lib/excel-importer.ts`, `src/lib/backup.ts` | `xlsx@^0.18.5` had High Prototype Pollution + ReDoS CVEs with no upstream fix. | **Resolved** (`xlsx` removed; replaced with `exceljs` + built-in bounded RFC 4180 CSV parser) |
| SEC-08 | Security Vulnerability | **High** | P0 | `src/lib/upload-security.ts`, `src/app/api/documents/**`, `src/app/api/import/route.ts`, `src/app/api/ai/extract/route.ts` | Missing upload size caps, extension/MIME/magic-byte validation, image dimension bounds, spreadsheet limits, and safe serving headers (Stored XSS via SVG/HTML). | **Resolved** (`validateUploadedFile()`, magic bytes, image dimensions <=8000px/25MP, `X-Content-Type-Options: nosniff`, CSP `sandbox`, path containment) |
| DATA-01 | Data-Integrity Risk | **High** | P1 | `src/db/migrator.ts`, `drizzle/` | Duplicated schema, no versioned migrations, no pre-migration backup or post-migration validation. | **Resolved** (`0001`–`0003` SQL migrations, `schema_migrations`, `VACUUM INTO` pre-migration backup, schema validation) |
| DATA-02 | Data-Integrity Risk | **High** | P1 | `src/db/schema.ts`, `src/lib/currency.ts` | Monetary fields used IEEE-754 `REAL` without minor-unit integer precision. | **Resolved** (`*_minor` integer columns backfilled safely + centralized `currency.ts` arithmetic) |
| DATA-03 | Data-Integrity Risk | **High** | P1 | `src/lib/backup.ts`, `src/app/api/backup/route.ts` | Backups excluded uploaded documents, lacked manifest/checksums, rotation, integrity verification, and safe restore. | **Resolved** (Full `.zip` & AES-256-GCM `.bpsbak` bundles with `manifest.json`, SHA-256 checks, rotation, preview, safety pre-restore snapshot, and atomic restore) |
| DATA-04 | Data-Integrity Risk | **High** | P1 | `src/lib/excel-importer.ts`, `src/app/import/page.tsx` | No workbook fingerprinting, import history, or duplicate detection; `replaceExisting` defaulted to `true`. | **Resolved** (`import_history` SHA-256 tracking, diff preview, deduplication, safe `replaceExisting=false` default + confirmation modal) |
| FIN-01 | Confirmed Bug | **High** | P1 | `src/lib/finance.ts`, `src/services/portfolio.ts`, `src/app/api/investments/[id]/transactions/route.ts`, `src/app/api/investments/matrix/route.ts` | Historical USD cashflows used today's `usdInrRate` instead of transaction `fxRate`; partial sells & dividends distorted `investedAmount` and XIRR. | **Resolved** (Transaction-level historical FX, proportional cost-basis reduction on sells, non-cash accrual/dividend handling, adaptive XIRR solver) |
| FIN-02 | Confirmed Bug | **High** | P1 | `src/services/portfolio.ts`, `src/app/api/assets/route.ts`, `src/db/schema.ts` | Net Worth conflated with Investment Portfolio; historical snapshots assumed `totalLiabilities = 0` when unknown. | **Resolved** (`asset_register` table separating financial/physical assets; nullable `totalLiabilitiesMinor` + `liabilitiesKnown` flag) |
| FIN-03 | Confirmed Bug | **High** | P1 | `src/services/portfolio.ts`, `src/app/page.tsx` | Dividends/other income grouped under salary; rental income double-counted between `income_entries` and `rental_payments`. | **Resolved** (Separate `salary`, `rental`, `dividend`, `other` streams; `rentalPaymentId` linkage prevents double-counting) |
| FIN-04 | Confirmed Bug | **Medium** | P2 | `src/services/portfolio.ts`, `src/app/loans/page.tsx`, `src/app/page.tsx` | Monthly insurance premiums displayed as `/yr` and not normalized (`* 12`). | **Resolved** (`normalizeAnnualInsurancePremium()` + frequency selector in UI) |
| AI-01 | Architectural Improvement | **High** | P2 | `src/lib/ai.ts`, `src/app/api/ai/*`, `src/components/AiAssistantDrawer.tsx` | No timeouts/cancellation/retries, no Zod output validation, no remote-endpoint warning, no structured review-and-approve flow. | **Resolved** (Timeouts, `AbortSignal`, retry limits, Zod schemas, `unknownFields`, remote egress opt-in, review-before-save UI) |
| ARCH-01 | Architectural Improvement | **Medium** | P2 | `src/services/`, `src/lib/` | Duplicated DB/financial logic in routes, missing validation/error/logging utilities. | **Resolved** (`PortfolioService`, `validation.ts`, `errors.ts`, `logging.ts` with PII redaction) |
| UX-01 | Potential Issue / UX | **Medium** | P2 | `src/app/*`, `src/components/ConfirmDialog.tsx` | Missing delete confirmations, silent API errors, missing restore/asset screens. | **Resolved** (`ConfirmDialog` on destructive actions, error banners, Asset Register & Backup Restore UI) |
| TEST-01 | Data-Integrity Risk | **High** | P1 | `tests/` | Minimal `verify.ts` script only. | **Resolved** (26 Vitest unit, security, data-integrity, and E2E tests) |
| OPS-01 | Architectural Improvement | **High** | P2 | `Dockerfile`, `docker-compose.yml`, `src/app/api/health/route.ts` | No containerization, healthcheck, or deployment runbooks. | **Resolved** (Standalone Dockerfile, Compose with persistent volumes & private Ollama, `/api/health`) |

---

## 2. Dependency Audit Notes

After replacing `xlsx` and upgrading `vitest` to `^4.1.12`:
- **Zero Critical** vulnerabilities remain.
- **Residual Transitive Advisories**:
  - `next@15.5.29` -> `postcss <=8.5.22` (High, build-time CSS compiler only; fix requires major upgrade to `next@16.4.6`).
  - `exceljs@4.4.0` -> `uuid <11.1.1` (Moderate, bounds check in `uuid` v3/v5/v6 buffer APIs).
  - `drizzle-kit@0.31.11` (devDependency only) -> `esbuild <=0.24.2` (Moderate, local dev CLI only).

---

## 3. Safe Git History Cleanup Procedure (Requires Explicit Owner Approval)

Commit `1e9a332d644d5c84dd61c29164a6d55d032897f4` on `main` still contains the original un-sanitized source files. Removing them from `feature/production-readiness` cleans `HEAD`, not historical commit `1e9a332`.

> **WARNING**: Do **not** rewrite shared Git history or force-push without explicit repository owner approval.

1. Mirror backup first: `git clone --mirror . ../bps-wealth-mirror-backup.git`
2. After merging `feature/production-readiness` into `main`, create a sanitized single-commit history (if no external collaborators depend on `1e9a332`) or run `git filter-repo --replace-text ../replacements.txt --force`:
   ```bash
   git checkout --orphan clean-main
   git add -A
   git commit -m "Initial sanitized production-ready release"
   git branch -M clean-main main
   ```
3. Expire reflogs & GC: `git reflog expire --expire=now --all && git gc --prune=now --aggressive`
4. Verify no sensitive tokens/values remain: `git log --all -p -S "<sensitive-term>"`
5. Rotate `BPS_PIN_SECRET` and any API credentials in `.env.local` / production env.
