import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { incomeEntries } from "@/db/schema";
import { requireUnlocked } from "@/lib/auth";

export async function GET() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const rows = db
    .select()
    .from(incomeEntries)
    .orderBy(desc(incomeEntries.date), desc(incomeEntries.id))
    .all();
  return NextResponse.json({ items: rows });
}

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const body = await req.json();
  const date = String(body.date || new Date().toISOString().slice(0, 10));
  const month = String(body.month || date.slice(0, 7));
  const inserted = db
    .insert(incomeEntries)
    .values({
      month,
      date,
      source: String(body.source || "Salary"),
      category: String(body.category || "salary"),
      grossAmount: Number(body.grossAmount || body.inhandAmount || 0),
      inhandAmount: Number(body.inhandAmount || 0),
      tdsAmount: Number(body.tdsAmount || 0),
      account: String(body.account || "ICICI"),
      notes: String(body.notes || ""),
    })
    .returning()
    .get();
  return NextResponse.json({ item: inserted }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  db.delete(incomeEntries).where(eq(incomeEntries.id, id)).run();
  return NextResponse.json({ ok: true });
}
