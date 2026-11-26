import { NextRequest, NextResponse } from "next/server";
import { requireUnlocked } from "@/lib/auth";
import {
  applyParsedImport,
  parseWorkbookBuffer,
} from "@/lib/excel-importer";

export async function POST(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "preview");
    const replaceExisting = formData.get("replaceExisting") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const parsed = parseWorkbookBuffer(buffer);

    if (mode === "apply") {
      applyParsedImport(parsed, replaceExisting);
      return NextResponse.json({
        applied: true,
        summary: parsed.summary,
      });
    }

    return NextResponse.json({
      applied: false,
      summary: parsed.summary,
      preview: {
        incomes: parsed.incomes.slice(0, 5),
        holdings: parsed.holdings.slice(0, 10),
        rentals: parsed.rentals,
        loans: parsed.loans,
        insurances: parsed.insurances,
        snapshots: parsed.snapshots,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse file" },
      { status: 500 }
    );
  }
}
