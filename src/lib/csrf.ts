import { NextRequest } from "next/server";
import { AppError } from "./errors";

/**
 * Validates same-origin / non-cross-site requests for state-changing HTTP methods.
 * Allows non-browser API clients (no Origin/Referer and no cross-site Sec-Fetch-Site)
 * while strictly blocking cross-site browser CSRF requests.
 */
export function verifyCsrf(req: NextRequest): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return;
  }

  const secFetchSite = req.headers.get("sec-fetch-site")?.toLowerCase();
  if (secFetchSite === "cross-site") {
    throw new AppError("Cross-site request blocked (CSRF)", 403, "CSRF_BLOCKED");
  }

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";

  if (!origin && !referer) {
    return;
  }

  const allowedOrigins = new Set<string>();
  if (host) {
    allowedOrigins.add(`http://${host}`);
    allowedOrigins.add(`https://${host}`);
  }
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  if (configuredOrigin) {
    allowedOrigins.add(configuredOrigin.replace(/\/+$/, ""));
  }

  const candidate = origin || (referer ? new URL(referer).origin : "");
  if (candidate && allowedOrigins.size > 0 && !allowedOrigins.has(candidate)) {
    throw new AppError("Origin mismatch (CSRF)", 403, "CSRF_ORIGIN_MISMATCH");
  }
}
