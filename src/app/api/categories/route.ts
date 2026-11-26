import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { investmentCategories } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";

const createCategorySchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60),
  slug: z.string().trim().max(60).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6366f1"),
  supportsSip: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdminSession();
    const rows = db
      .select()
      .from(investmentCategories)
      .orderBy(asc(investmentCategories.id))
      .all();
    return NextResponse.json({ categories: rows });
  } catch (err) {
    return handleApiError(err, "categories.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = createCategorySchema.parse(await req.json());
    const slug =
      (parsed.slug || parsed.label)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "") || "custom";

    const existing = db
      .select()
      .from(investmentCategories)
      .where(eq(investmentCategories.slug, slug))
      .get();
    if (existing) {
      throw new AppError("Category already exists", 409, "CONFLICT");
    }

    const inserted = db
      .insert(investmentCategories)
      .values({
        slug,
        label: parsed.label,
        color: parsed.color,
        supportsSip: parsed.supportsSip,
        isSystem: false,
      })
      .returning()
      .get();
    return NextResponse.json({ category: inserted }, { status: 201 });
  } catch (err) {
    return handleApiError(err, "categories.POST");
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
    db.delete(investmentCategories)
      .where(eq(investmentCategories.id, id))
      .run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "categories.DELETE");
  }
}
