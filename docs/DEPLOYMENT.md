# BPS Wealth — Production Deployment Guide

## 1. Architecture & Storage Requirements

BPS Wealth uses **SQLite (WAL mode)** and **local document storage (`data/documents`)**.

- **Deploy as a persistent single-instance Node.js service** (Docker container or systemd Node service) backed by persistent storage (`bps_data` volume).
- **Do NOT deploy to ephemeral serverless platforms** (such as Vercel Serverless Functions or stateless Lambda), as SQLite writes and uploaded documents would be lost on container recycling.
- **Do NOT run multiple horizontal app replicas** against the same SQLite file.

---

## 2. Quick Production Deployment (Docker Compose)

1. **Generate strong secrets** on the host:
   ```bash
   openssl rand -hex 32   # Use for BPS_PIN_SECRET
   openssl rand -hex 16   # Use for BPS_OWNER_SETUP_TOKEN
   ```
2. **Create `.env`** from `.env.example`:
   - Set `BPS_PIN_SECRET` ($\ge 32$ chars, required in production).
   - Set `BPS_OWNER_SETUP_TOKEN` ($\ge 16$ chars) for initial first-run PIN setup.
   - Set `APP_ORIGIN=https://wealth.yourdomain.com` and `BPS_COOKIE_SECURE=true` when behind an HTTPS reverse proxy.
   - Keep `SQL_STUDIO_ALLOW_WRITES=false` (writes are permanently disabled in production).
3. **Start the service**:
   ```bash
   docker compose up -d --build
   # Or include private Ollama container:
   docker compose --profile with-ollama up -d --build
   ```
4. **Verify healthcheck**:
   ```bash
   curl -fsS http://127.0.0.1:3000/api/health
   ```
5. **Complete First-Run Owner Setup**:
   - Open the application via your HTTPS reverse proxy.
   - Enter `BPS_OWNER_SETUP_TOKEN` (or read `/app/data/.owner-setup-token` from the container if omitted) and create your 4–8 digit owner PIN.
   - Once initialized, remove `BPS_OWNER_SETUP_TOKEN` from `.env` if desired; the setup endpoint is permanently locked once `pin_hash` is stored.

---

## 3. HTTPS Reverse Proxy (Nginx / Caddy)

Bind the container only to `127.0.0.1:3000` (default in `docker-compose.yml`) and terminate TLS in Caddy or Nginx:

```caddyfile
wealth.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Ensure `X-Forwarded-Host` and `X-Forwarded-Proto` headers are forwarded so CSRF Origin verification and `Secure` cookies function properly.

---

## 4. Ollama Privacy

- Ollama (`11434`) is attached only to the internal Docker `internal` bridge network and **must never be exposed publicly**.
- If a remote OpenAI-compatible endpoint is configured (`OSS_OPENAI_BASE_URL`), the UI displays a warning and requires explicit per-session opt-in before transmitting anonymized portfolio summaries.

---

## 5. Pre-Deployment Security Checklist

- [ ] `BPS_PIN_SECRET` set to >= 32 random chars (never default/placeholder).
- [ ] HTTPS TLS enabled in reverse proxy and `BPS_COOKIE_SECURE=true`.
- [ ] `APP_ORIGIN` matches your HTTPS origin.
- [ ] Persistent volume (`bps_data`) mounted at `/app/data` with host-level backups.
- [ ] Ollama port `11434` firewalled / internal-only.
- [ ] First-run owner PIN initialized and tested (unauthenticated `/api/dashboard` returns `401`).
- [ ] Encrypted off-device backup tested via `/import`.

---

## 6. Future Multi-Instance Scaling Path

If multi-instance horizontal scaling becomes necessary in the future:
1. Migrate Drizzle schema from `sqliteTable` to `pgTable` (`drizzle-orm/node-postgres`) backed by managed PostgreSQL.
2. Replace local filesystem storage in `src/app/api/documents/` and `src/lib/backup.ts` with S3-compatible object storage using pre-signed URLs.
3. Move `auth_rate_limits` and `auth_sessions` to PostgreSQL or Redis.
