import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashPin, verifyPinHash } from "@/lib/auth";
import { resolvePinSecret } from "@/lib/env";
import { logger } from "@/lib/logging";
import { validateReadOnlySql } from "@/lib/sql-studio";
import {
  ALLOWED_DOCUMENT_EXTS,
  MAX_DOCUMENT_BYTES,
  resolveContainedPath,
  validateUploadedFile,
} from "@/lib/upload-security";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { POST as postPin } from "@/app/api/auth/pin/route";
import { POST as postSql } from "@/app/api/sql/route";
import { POST as postDoc } from "@/app/api/documents/route";
import {
  createIsolatedTestEnv,
  makeFormRequest,
  makeJsonRequest,
  TestContext,
} from "../helpers/test-env";

describe("Security Controls", () => {
  let ctx: TestContext;
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    ctx = createIsolatedTestEnv();
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
    ctx.cleanup();
  });

  it("refuses weak or missing secrets in production", () => {
    const prev = process.env.BPS_PIN_SECRET;
    process.env.BPS_PIN_SECRET = "bps-local-tracker-secret-v1";
    expect(() => resolvePinSecret(true)).toThrow();
    process.env.BPS_PIN_SECRET = "short";
    expect(() => resolvePinSecret(true)).toThrow();
    process.env.BPS_PIN_SECRET = prev;
  });

  it("uses Argon2id for PIN hashing", async () => {
    const h = await hashPin("4829");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPinHash(h, "4829")).toBe(true);
    expect(await verifyPinHash(h, "0000")).toBe(false);
  });

  it("blocks unauthenticated API access in production & requires owner setup token", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";

    const dashRes = await getDashboard();
    expect(dashRes.status).toBe(401);

    // Unauthenticated visitor cannot claim PIN with wrong setup token
    const badSetup = await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", {
        action: "setup",
        pin: "1234",
        setupToken: "wrong-token-value",
      })
    );
    expect(badSetup.status).toBe(403);

    // Valid setup token initializes owner PIN and unlocks session
    const goodSetup = await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", {
        action: "setup",
        pin: "2468",
        setupToken: process.env.BPS_OWNER_SETUP_TOKEN,
      })
    );
    expect(goodSetup.status).toBe(200);

    const dashAfter = await getDashboard();
    expect(dashAfter.status).toBe(200);
  });

  it("enforces rate limiting and lockout on repeated failed PIN attempts", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", {
        action: "setup",
        pin: "1357",
        setupToken: process.env.BPS_OWNER_SETUP_TOKEN,
      })
    );
    await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", { action: "lock" })
    );

    for (let i = 0; i < 3; i++) {
      const failRes = await postPin(
        makeJsonRequest("http://localhost/api/auth/pin", "POST", {
          action: "verify",
          pin: "9999",
        })
      );
      expect(failRes.status).toBe(401);
    }

    const lockedRes = await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", {
        action: "verify",
        pin: "1357",
      })
    );
    expect(lockedRes.status).toBe(429);
    expect(lockedRes.headers.get("Retry-After")).toBeTruthy();
  });

  it("redacts sensitive financial and credential fields from structured logs", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("test_redaction", {
      pin: "1234",
      pinHash: "$argon2id$secret",
      inhandAmount: 999999,
      holdingsSummary: [{ name: "Secret Fund" }],
      safeField: "ok",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0][0]);
    expect(logged).not.toContain("1234");
    expect(logged).not.toContain("$argon2id$secret");
    expect(logged).not.toContain("999999");
    expect(logged).not.toContain("Secret Fund");
    expect(logged).toContain("[REDACTED]");
    expect(logged).toContain("ok");
    spy.mockRestore();
  });

  it("blocks cross-site CSRF requests", async () => {
    const res = await postPin(
      makeJsonRequest(
        "http://localhost/api/auth/pin",
        "POST",
        { action: "lock" },
        { "sec-fetch-site": "cross-site", origin: "https://evil.example" }
      )
    );
    expect(res.status).toBe(403);
  });

  it("blocks SQL Studio write bypasses, PRAGMA, multi-statements, and security tables", async () => {
    expect(() => validateReadOnlySql("DELETE FROM loans")).toThrow();
    expect(() =>
      validateReadOnlySql("WITH x AS (SELECT 1) INSERT INTO loans(name) VALUES ('a')")
    ).toThrow();
    expect(() => validateReadOnlySql("PRAGMA writable_schema = ON")).toThrow();
    expect(() =>
      validateReadOnlySql("SELECT 1; DROP TABLE income_entries;")
    ).toThrow();
    expect(() =>
      validateReadOnlySql("SELECT * FROM app_settings")
    ).toThrow();
    expect(() =>
      validateReadOnlySql("VACUUM INTO '/tmp/leak.db'")
    ).toThrow();

    const apiRes = await postSql(
      makeJsonRequest("http://localhost/api/sql", "POST", {
        query: "PRAGMA journal_mode=DELETE",
        allowWrite: true,
      })
    );
    expect(apiRes.status).toBe(403);
  });

  it("blocks path traversal, spoofed file signatures, SVG XSS, and oversized uploads", async () => {
    expect(() =>
      resolveContainedPath(ctx.rootDir, "../../etc/passwd")
    ).toThrow();

    // Spoofed PDF (HTML payload inside .pdf)
    const fakePdf = new File(["<script>alert(1)</script>"], "evil.pdf", {
      type: "application/pdf",
    });
    await expect(
      validateUploadedFile(fakePdf, {
        allowedExts: ALLOWED_DOCUMENT_EXTS,
        maxBytes: MAX_DOCUMENT_BYTES,
      })
    ).rejects.toThrow();

    // Disallowed .svg upload
    const svg = new File(["<svg onload=alert(1)/>"], "x.svg", {
      type: "image/svg+xml",
    });
    const fd = new FormData();
    fd.append("file", svg);
    const res = await postDoc(
      makeFormRequest("http://localhost/api/documents", fd)
    );
    expect(res.status).toBe(400);

    // Oversized file > 10MB
    const big = new File([Buffer.alloc(10 * 1024 * 1024 + 10)], "big.txt", {
      type: "text/plain",
    });
    const fdBig = new FormData();
    fdBig.append("file", big);
    const resBig = await postDoc(
      new NextRequest("http://localhost/api/documents", {
        method: "POST",
        body: fdBig,
      })
    );
    expect(resBig.status).toBe(413);
  });
});
