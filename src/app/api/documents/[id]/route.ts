import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, paths } from "@/db";
import { documents } from "@/db/schema";
import { requireUnlocked } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const { id } = await params;
  const docId = Number(id);
  const doc = db
    .select()
    .from(documents)
    .where(eq(documents.id, docId))
    .get();
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const safeBase = path.basename(doc.filePath);
  const fullPath = path.join(paths.DOCS_DIR, safeBase);
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }

  const buf = fs.readFileSync(fullPath);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${doc.originalName.replace(/"/g, "")}"`,
    },
  });
}
