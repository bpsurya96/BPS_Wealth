import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";
import { resetDbConnection } from "@/db";
import { testCookieJar } from "../setup";

export interface TestContext {
  rootDir: string;
  cookieJar: Map<string, string>;
  cleanup: () => void;
}

export function createIsolatedTestEnv(): TestContext {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "bps-wealth-test-"));
  const dbPath = path.join(rootDir, "bps_test.db");
  const docsDir = path.join(rootDir, "documents");
  const backupsDir = path.join(rootDir, "backups");

  resetDbConnection();
  testCookieJar.clear();

  process.env.BPS_DB_PATH = dbPath;
  process.env.BPS_DOCS_DIR = docsDir;
  process.env.BPS_BACKUPS_DIR = backupsDir;
  process.env.BPS_PIN_SECRET =
    "test-only-random-secret-key-at-least-32-chars-long-123456";
  process.env.BPS_OWNER_SETUP_TOKEN = "test-owner-bootstrap-token-9999";
  process.env.AI_PROVIDER = "local";
  process.env.BPS_COOKIE_SECURE = "false";

  return {
    rootDir,
    cookieJar: testCookieJar,
    cleanup: () => {
      resetDbConnection();
      testCookieJar.clear();
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

export function makeJsonRequest(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function makeFormRequest(
  url: string,
  formData: FormData,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: formData,
  });
}
