import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentCategories } from "@/db/schema";
import { requireUnlocked } from "@/lib/auth";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const rows = db
    .select()
    .from(investmentCategories)
    .orderBy(asc(investmentCategories.id))
    .all();
  return NextResponse.json({ categories: rows });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  const label = String(body.label || "").trim();
  if (!label) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }
  const slug =
    String(body.slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_") ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  const existing = db
    .select()
    .from(investmentCategories)
    .where(eq(investmentCategories.slug, slug))
    .get();
  if (existing) {
    return NextResponse.json(
      { error: "Category already exists" },
      { status: 409 }
    );
  }

  const inserted = db
    .insert(investmentCategories)
    .values({
      slug,
      label,
      color: String(body.color || "#6366f1"),
      supportsSip: body.supportsSip !== false,
      isSystem: false,
    })
    .returning()
    .get();
  return NextResponse.json({ category: inserted }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  db.delete(investmentCategories)
    .where(eq(investmentCategories.id, id))
    .run();
  return NextResponse.json({ ok: true });
}
