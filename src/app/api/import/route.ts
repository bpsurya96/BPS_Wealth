import { desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { importHistory } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import {
  applyParsedImport,
  computeImportDiffPreview,
  parseWorkbookBuffer,
} from "@/lib/excel-importer";
import {
  ALLOWED_SPREADSHEET_EXTS,
  MAX_SPREADSHEET_BYTES,
  validateUploadedFile,
} from "@/lib/upload-security";

export async function GET() {
  try {
    await requireAdminSession();
    const history = db
      .select()
      .from(importHistory)
      .orderBy(desc(importHistory.id))
      .limit(25)
      .all();
    return NextResponse.json({ history });
  } catch (err) {
    return handleApiError(err, "import.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const formData = await req.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "preview");
    const replaceExisting = formData.get("replaceExisting") === "true";

    if (!(file instanceof File)) {
      throw new AppError("No file uploaded", 400, "NO_FILE");
    }

    const validated = await validateUploadedFile(file, {
      allowedExts: ALLOWED_SPREADSHEET_EXTS,
      maxBytes: MAX_SPREADSHEET_BYTES,
      checkImageDimensions: false,
    });

    const parsed = await parseWorkbookBuffer(
      validated.buffer,
      validated.originalName
    );
    const diff = computeImportDiffPreview(parsed);

    if (mode === "apply") {
      const result = applyParsedImport(parsed, replaceExisting);
      return NextResponse.json({
        applied: true,
        fileSha256: parsed.fileSha256,
        summary: parsed.summary,
        result,
      });
    }

    return NextResponse.json({
      applied: false,
      fileSha256: parsed.fileSha256,
      summary: parsed.summary,
      diff,
      rejected: parsed.rejected.slice(0, 20),
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
    return handleApiError(err, "import.POST");
  }
}
