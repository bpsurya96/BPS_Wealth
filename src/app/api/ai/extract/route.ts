import { NextRequest, NextResponse } from "next/server";
import {
  ExtractionTargetType,
  extractStructuredDataWithVision,
} from "@/lib/ai";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import {
  ALLOWED_AI_EXTRACT_EXTS,
  MAX_AI_IMAGE_BYTES,
  MAX_AI_TEXT_BYTES,
  validateUploadedFile,
} from "@/lib/upload-security";

const ALLOWED_TARGETS = new Set<ExtractionTargetType>([
  "insurance",
  "investment",
  "income",
  "loan",
  "receipt",
  "bank_statement",
  "financial_document",
]);

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const formData = await req.formData();
    const file = formData.get("file");
    const targetRaw = String(formData.get("targetType") || "insurance");
    const allowRemoteEgress = formData.get("allowRemoteEgress") === "true";

    if (!ALLOWED_TARGETS.has(targetRaw as ExtractionTargetType)) {
      throw new AppError("Unsupported extraction targetType", 400, "INVALID_TARGET");
    }
    const targetType = targetRaw as ExtractionTargetType;

    if (!(file instanceof File)) {
      throw new AppError("No file uploaded", 400, "NO_FILE");
    }

    const validated = await validateUploadedFile(file, {
      allowedExts: ALLOWED_AI_EXTRACT_EXTS,
      maxBytes: MAX_AI_IMAGE_BYTES,
      checkImageDimensions: true,
    });

    if (!validated.isImage && validated.buffer.length > MAX_AI_TEXT_BYTES) {
      throw new AppError(
        "Text/CSV document exceeds 2 MB extraction limit",
        413,
        "FILE_TOO_LARGE"
      );
    }

    const result = await extractStructuredDataWithVision({
      base64Image: validated.isImage
        ? validated.buffer.toString("base64")
        : undefined,
      mimeType: validated.canonicalMime,
      textContent: validated.isImage
        ? undefined
        : validated.buffer.toString("utf-8"),
      targetType,
      allowRemoteEgress,
      signal: req.signal,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "ai.extract.POST");
  }
}
