import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, paths } from "@/db";
import { documents } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import {
  resolveContainedPath,
  sanitizeDisplayFilename,
} from "@/lib/upload-security";

const SAFE_INLINE_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const docId = Number(id);
    if (!Number.isInteger(docId) || docId <= 0) {
      throw new AppError("Invalid document id", 400, "INVALID_ID");
    }

    const doc = db
      .select()
      .from(documents)
      .where(eq(documents.id, docId))
      .get();
    if (!doc) {
      throw new AppError("Document not found", 404, "NOT_FOUND");
    }

    const fullPath = resolveContainedPath(paths.DOCS_DIR, doc.filePath);
    if (!fs.existsSync(fullPath)) {
      throw new AppError("File missing on disk", 404, "FILE_MISSING");
    }

    const buf = fs.readFileSync(fullPath);
    const safeName = sanitizeDisplayFilename(doc.originalName);
    const isSafeInline = SAFE_INLINE_MIMES.has(doc.mimeType);
    const disposition = isSafeInline ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": isSafeInline
          ? doc.mimeType
          : "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return handleApiError(err, "documents.[id].GET");
  }
}
