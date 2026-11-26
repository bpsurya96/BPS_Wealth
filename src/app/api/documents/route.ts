import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, paths } from "@/db";
import { documents } from "@/db/schema";
import { requireUnlocked } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
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
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const entityType = String(formData.get("entityType") || "insurance");
    const entityId = Number(formData.get("entityId") || 0);
    const title = String(formData.get("title") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!fs.existsSync(paths.DOCS_DIR)) {
      fs.mkdirSync(paths.DOCS_DIR, { recursive: true });
    }

    const ext = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
    const safeStoredName = `${Date.now()}_${crypto.randomUUID()}${ext}`;
    const targetPath = path.join(paths.DOCS_DIR, safeStoredName);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(targetPath, buf);

    const inserted = db
      .insert(documents)
      .values({
        entityType,
        entityId: Number.isFinite(entityId) ? entityId : 0,
        title: title || file.name,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: buf.length,
        filePath: safeStoredName,
        aiSummary: "",
      })
      .returning()
      .get();

    return NextResponse.json({ document: inserted }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const doc = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id)))
    .get();
  if (doc) {
    const safeBase = path.basename(doc.filePath);
    const fullPath = path.join(paths.DOCS_DIR, safeBase);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    db.delete(documents).where(eq(documents.id, id)).run();
  }
  return NextResponse.json({ ok: true });
}
