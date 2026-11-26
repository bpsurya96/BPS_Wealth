# BPS Wealth — Backup & Restoration Guide

## 1. Backup Contents & Manifest (`v2.0`)

Every backup bundle (`.zip` or AES-256-GCM encrypted `.bpsbak`) created via `src/lib/backup.ts` (`POST /api/backup`) includes:

- `database/bps_income.db`: Consistent online snapshot created via `sqlite.backup()` and verified with `PRAGMA integrity_check` + schema validation.
- `documents/<stored_filename>`: Complete copy of all uploaded files in `BPS_DOCS_DIR`.
- `manifest.json`:
  - `backupVersion`, `appVersion`, `createdAt`, `encrypted`
  - `db`: `{ filename, sizeBytes, sha256 }`
  - `documentCount` and per-document `{ filePath, sizeBytes, sha256 }`
  - `recordCounts`: Row counts across all 14 core tables.

### Post-Write Verification & Rotation
- Immediately after writing the backup file, `verifyAndPreviewBackupBuffer()` decompresses (and decrypts if `.bpsbak`), verifies SHA-256 checksums for the database and every document, and checks `PRAGMA integrity_check` on the snapshot.
- `rotateBackups()` retains the newest `BPS_MAX_BACKUPS` (default `15`) archives in `BPS_BACKUPS_DIR`.

---

## 2. Encrypted Off-Device Backups

- In **Import & Backup** (`/import`), enter an optional passphrase ($\ge 8$ characters) before clicking **Create Full Backup**.
- Payloads are encrypted using **AES-256-GCM** with a random 16-byte salt, 12-byte IV, `scrypt` key derivation (`N=16384, r=8, p=1`), and GCM authentication tag (`BPSENC01` header).
- Download the `.bpsbak` file via **Download** and store it in off-device cloud storage or an external encrypted drive.

---

## 3. Restore Preview & Safe Restore

1. **Preview / Verify**: Click **Verify / Restore** next to a backup (or upload a `.zip`/`.bpsbak` bundle to `POST /api/backup` with `action=preview`). The server validates all SHA-256 checksums and SQLite integrity *without* modifying the live database.
2. **Confirm & Restore**:
   - The system first creates an automatic **`pre_restore_safety_<timestamp>.zip`** backup of the current live database and documents.
   - The candidate database is staged to a temporary file, migrated forward if needed, and validated.
   - Only after staging succeeds does the server close the active SQLite handle, swap the database and document files atomically, and re-validate the live database.

---

## 4. Automated Backup Cron Example (Host / Docker)

Schedule daily verified backups on the host (keeping `BPS_MAX_BACKUPS=30`):

```bash
# Example: copy verified backup archives off-host daily at 02:30
30 2 * * * rsync -a /path/to/bps/data/backups/ /mnt/offsite-backup/bps-wealth/
```
