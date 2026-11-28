import { extractText, getDocumentProxy } from "unpdf";
import { AppError } from "./errors";

const MAX_PDF_PAGES = 50;
const MAX_EXTRACTED_CHARS = 12000;

/**
 * Extracts UTF-8 text from a digital PDF buffer with page and length bounds.
 */
export async function extractTextFromPdfBuffer(
  buffer: Buffer
): Promise<{ text: string; totalPages: number }> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const totalPages = pdf.numPages;
    if (totalPages > MAX_PDF_PAGES) {
      throw new AppError(
        `PDF has ${totalPages} pages, exceeding the ${MAX_PDF_PAGES}-page extraction limit`,
        400,
        "PDF_TOO_MANY_PAGES"
      );
    }

    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = (typeof text === "string" ? text : "")
      .replace(/\r\n/g, "\n")
      .trim()
      .slice(0, MAX_EXTRACTED_CHARS);

    return { text: cleaned, totalPages };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "Could not parse PDF document (file may be password-protected or corrupted)",
      400,
      "PDF_PARSE_FAILED"
    );
  }
}
