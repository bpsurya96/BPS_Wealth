import { NextRequest, NextResponse } from "next/server";
import {
  ExtractionTargetType,
  extractStructuredDataWithVision,
} from "@/lib/ai";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import { extractTextFromPdfBuffer } from "@/lib/pdf-extract";
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

    const isPdf = validated.ext === ".pdf";
    if (!validated.isImage && !isPdf && validated.buffer.length > MAX_AI_TEXT_BYTES) {
      throw new AppError(
        "Text/CSV document exceeds 2 MB extraction limit",
        413,
        "FILE_TOO_LARGE"
      );
    }

    let textContent: string | undefined;
    if (isPdf) {
      const pdfResult = await extractTextFromPdfBuffer(validated.buffer);
      if (pdfResult.text.length < 15) {
        return NextResponse.json({
          ok: false,
          model: "pdf-extractor",
          requiresReview: true,
          isRemote: false,
          extracted: null,
          unknownFields: [],
          rawText:
            "This PDF appears to be scanned (no selectable text found). Please upload a screenshot or PNG/JPG/WEBP image for Vision AI extraction.",
        });
      }
      textContent = pdfResult.text;
    } else if (!validated.isImage) {
      textContent = validated.buffer.toString("utf-8");
    }

    const result = await extractStructuredDataWithVision({
      base64Image: validated.isImage
        ? validated.buffer.toString("base64")
        : undefined,
      mimeType: validated.canonicalMime,
      textContent,
      targetType,
      allowRemoteEgress,
      signal: req.signal,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err, "ai.extract.POST");
  }
}
