# BPS Wealth — Testing Strategy & Results

## 1. Test Framework & Execution

- **Test Runner**: Vitest (`vitest@^4.1.12`) configured via `vitest.config.mjs` and `tests/setup.ts`.
- **Command**:
  ```bash
  npm test
  ```
- **Additional Verification Scripts**:
  ```bash
  npx tsc --noEmit
  npm run lint
  npx tsx scripts/verify.ts
  npm run build
  ```

---

## 2. Test Coverage Map

| Suite | File | Scope Covered |
|---|---|---|
| **Unit Tests** | `tests/unit/finance.test.ts` | Monetary minor-unit conversion & float-drift prevention, USD->INR conversion, proportional sell cost-basis reduction, XIRR (one-time, monthly SIP, same-date cashflows, partial redemption, closed holdings, negative returns, zero/one-sided/missing valuation edge cases, historical FX vs current FX), insurance monthly/annual normalization. |
| **Security Tests** | `tests/security/security.test.ts` | Production secret enforcement, Argon2id hashing, unauthenticated API rejection (`401`), first-run owner setup token enforcement, PIN rate-limiting & progressive lockout (`429`), CSRF cross-site blocking (`403`), SQL Studio write/`WITH`/`PRAGMA`/`VACUUM`/multi-statement/security-table blocking, path traversal rejection, upload extension/MIME/magic-byte & size limits (`413`), structured log redaction. |
| **Data Integrity Tests** | `tests/data-integrity/integrity.test.ts` | Duplicate `.xlsx` import fingerprint & transaction deduplication, safe legacy DB migration with pre-migration backup & minor-unit backfill, full `.zip` and encrypted `.bpsbak` backup verification, wrong-passphrase rejection, and end-to-end DB + document restoration. |
| **End-to-End Workflows** | `tests/e2e/workflows.test.ts` | Full owner lifecycle against real route handlers and isolated SQLite DB: first-run setup -> lock/unlock -> add holding -> log SIP & dividend -> add income categories -> add rental property & payment without double-counting -> add loan & EMI -> monthly insurance normalization -> asset register & net worth -> document upload/download -> Excel import -> JSON/XLSX export -> backup & restore -> AI Q&A -> SQL Studio read query. |

---

## 3. External Service Limitations

- Live external HTTP calls to **Ollama**, **MFAPI.in**, and **Yahoo Finance** are not invoked in offline automated CI tests; AI fallback & validation paths are tested locally with `AI_PROVIDER=local`.
