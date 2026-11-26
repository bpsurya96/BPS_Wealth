import crypto from "crypto";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, paths } from "@/db";
import { documents } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import {
  ALLOWED_DOCUMENT_EXTS,
  MAX_DOCUMENT_BYTES,
  resolveContainedPath,
  validateUploadedFile,
} from "@/lib/upload-security";

const ALLOWED_ENTITY_TYPES = new Set([
  "insurance",
  "loan",
  "investment",
  "general",
]);

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
    const entityType = req.nextUrl.searchParams.get("entityType");
    const entityIdParam = req.nextUrl.searchParams.get("entityId");

    let rows = db
      .select()
      .from(documents)
      .orderBy(desc(documents.uploadedAt))
      .all();

    if (entityType) {
      rows = rows.filter((d) => d.entityType === entityType);
    }
    if (entityIdParam !== null) {
      const eid = Number(entityIdParam);
      if (Number.isFinite(eid)) {
        rows = rows.filter((d) => d.entityId === eid);
      }
    }
    return NextResponse.json({ documents: rows });
  } catch (err) {
    return handleApiError(err, "documents.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const formData = await req.formData();
    const file = formData.get("file");
    const entityTypeRaw = String(formData.get("entityType") || "insurance");
    const entityType = ALLOWED_ENTITY_TYPES.has(entityTypeRaw)
      ? entityTypeRaw
      : "general";
    const entityId = Number(formData.get("entityId") || 0);
    const title = String(formData.get("title") || "").trim().slice(0, 180);

    if (!(file instanceof File)) {
      throw new AppError("No file uploaded", 400, "NO_FILE");
    }

    const validated = await validateUploadedFile(file, {
      allowedExts: ALLOWED_DOCUMENT_EXTS,
      maxBytes: MAX_DOCUMENT_BYTES,
      checkImageDimensions: true,
    });

    if (!fs.existsSync(paths.DOCS_DIR)) {
      fs.mkdirSync(paths.DOCS_DIR, { recursive: true });
    }

    const safeStoredName = `${Date.now()}_${crypto.randomUUID()}${validated.ext}`;
    const targetPath = resolveContainedPath(paths.DOCS_DIR, safeStoredName);
    fs.writeFileSync(targetPath, validated.buffer, { mode: 0o600 });

    try {
      const inserted = db
        .insert(documents)
        .values({
          entityType,
          entityId: Number.isFinite(entityId) && entityId >= 0 ? entityId : 0,
          title: title || validated.originalName,
          originalName: validated.originalName,
          mimeType: validated.canonicalMime,
          sizeBytes: validated.buffer.length,
          filePath: safeStoredName,
          sha256: validated.sha256,
          aiSummary: "",
        })
        .returning()
        .get();

      return NextResponse.json({ document: inserted }, { status: 201 });
    } catch (dbErr) {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      throw dbErr;
    }
  } catch (err) {
    return handleApiError(err, "documents.POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid id", 400, "INVALID_ID");
    }
    const doc = db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .get();
    if (!doc) {
      throw new AppError("Document not found", 404, "NOT_FOUND");
    }

    const fullPath = resolveContainedPath(paths.DOCS_DIR, doc.filePath);
    db.delete(documents).where(eq(documents.id, id)).run();
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "documents.DELETE");
  }
}
