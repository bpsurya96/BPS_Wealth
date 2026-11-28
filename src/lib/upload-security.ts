import crypto from "crypto";
import path from "path";
import { AppError } from "./errors";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_SPREADSHEET_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_AI_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_AI_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_IMAGE_WIDTH = 8000;
export const MAX_IMAGE_HEIGHT = 8000;
export const MAX_IMAGE_PIXELS = 25_000_000;

export const ALLOWED_DOCUMENT_EXTS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".csv",
]);

export const ALLOWED_SPREADSHEET_EXTS = new Set([".xlsx", ".csv"]);

export const ALLOWED_AI_EXTRACT_EXTS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".txt",
  ".csv",
]);

const EXT_TO_CANONICAL_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const ALLOWED_CLIENT_MIMES: Record<string, Set<string>> = {
  ".pdf": new Set(["application/pdf", "application/octet-stream", ""]),
  ".png": new Set(["image/png", "application/octet-stream", ""]),
  ".jpg": new Set(["image/jpeg", "image/jpg", "application/octet-stream", ""]),
  ".jpeg": new Set(["image/jpeg", "image/jpg", "application/octet-stream", ""]),
  ".webp": new Set(["image/webp", "application/octet-stream", ""]),
  ".txt": new Set(["text/plain", "application/octet-stream", ""]),
  ".csv": new Set([
    "text/csv",
    "text/plain",
    "application/csv",
    "application/vnd.ms-excel",
    "application/octet-stream",
    "",
  ]),
  ".xlsx": new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "",
  ]),
};

export function sanitizeDisplayFilename(name: string): string {
  const base = path.basename(name).replace(/[\x00-\x1f\x7f"\\/<>:|?*]/g, "_");
  return base.slice(0, 180) || "file";
}

export function resolveContainedPath(baseDir: string, storedName: string): string {
  const cleanName = path.basename(storedName);
  if (!cleanName || cleanName !== storedName || cleanName.includes("..")) {
    throw new AppError("Invalid file path", 400, "INVALID_PATH");
  }
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, cleanName);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new AppError("Path traversal rejected", 403, "PATH_TRAVERSAL");
  }
  return resolvedTarget;
}

function isLikelyUtf8Text(buf: Buffer): boolean {
  if (buf.includes(0x00)) return false;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(buf);
    return true;
  } catch {
    return false;
  }
}

export function detectImageDimensions(
  buf: Buffer,
  ext: string
): { width: number; height: number } | null {
  if (ext === ".png" && buf.length >= 24) {
    // PNG IHDR chunk starts at byte 16
    if (
      buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
      buf.subarray(12, 16).toString("ascii") === "IHDR"
    ) {
      return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
      };
    }
  }

  if ((ext === ".jpg" || ext === ".jpeg") && buf.length >= 4) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
        };
      }
      if (marker === 0xd9 || marker === 0xda) break;
      const segLen = buf.readUInt16BE(i + 2);
      if (segLen < 2) break;
      i += 2 + segLen;
    }
  }

  if (ext === ".webp" && buf.length >= 30) {
    const chunk = buf.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X" && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height };
    }
    if (chunk === "VP8 " && buf.length >= 30) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { width, height };
    }
    if (chunk === "VP8L" && buf.length >= 25) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
  }

  return null;
}

export function verifyMagicBytes(buf: Buffer, ext: string): boolean {
  if (buf.length === 0) return false;
  switch (ext) {
    case ".pdf":
      return buf.subarray(0, 5).toString("ascii") === "%PDF-";
    case ".png":
      return (
        buf.length >= 24 &&
        buf
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    case ".jpg":
    case ".jpeg":
      return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case ".webp":
      return (
        buf.length >= 16 &&
        buf.subarray(0, 4).toString("ascii") === "RIFF" &&
        buf.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case ".xlsx":
      return (
        buf.length >= 4 &&
        buf[0] === 0x50 &&
        buf[1] === 0x4b &&
        buf[2] === 0x03 &&
        buf[3] === 0x04
      );
    case ".txt":
    case ".csv":
      return isLikelyUtf8Text(buf);
    default:
      return false;
  }
}

export interface ValidatedUpload {
  originalName: string;
  ext: string;
  canonicalMime: string;
  buffer: Buffer;
  sha256: string;
  isImage: boolean;
  dimensions?: { width: number; height: number } | null;
}

export async function validateUploadedFile(
  file: File,
  options: {
    allowedExts: Set<string>;
    maxBytes: number;
    checkImageDimensions?: boolean;
  }
): Promise<ValidatedUpload> {
  const originalName = sanitizeDisplayFilename(file.name || "upload");
  const ext = path.extname(originalName).toLowerCase();

  if (!ext || !options.allowedExts.has(ext)) {
    throw new AppError(
      `Unsupported file extension "${ext || "none"}". Allowed: ${Array.from(
        options.allowedExts
      ).join(", ")}`,
      400,
      "UNSUPPORTED_FILE_TYPE"
    );
  }

  if (file.size <= 0) {
    throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
  }

  if (file.size > options.maxBytes) {
    throw new AppError(
      `File exceeds maximum allowed size of ${Math.round(
        options.maxBytes / (1024 * 1024)
      )} MB`,
      413,
      "FILE_TOO_LARGE"
    );
  }

  const clientMime = (file.type || "").toLowerCase().split(";")[0].trim();
  const allowedMimes = ALLOWED_CLIENT_MIMES[ext];
  if (allowedMimes && !allowedMimes.has(clientMime)) {
    throw new AppError(
      `MIME type "${clientMime}" does not match extension ${ext}`,
      400,
      "MIME_MISMATCH"
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > options.maxBytes) {
    throw new AppError("File exceeds maximum allowed size", 413, "FILE_TOO_LARGE");
  }

  if (!verifyMagicBytes(buffer, ext)) {
    throw new AppError(
      `File signature does not match ${ext} format`,
      400,
      "INVALID_FILE_SIGNATURE"
    );
  }

  const isImage = [".png", ".jpg", ".jpeg", ".webp"].includes(ext);
  let dimensions: { width: number; height: number } | null = null;
  if (isImage && options.checkImageDimensions !== false) {
    dimensions = detectImageDimensions(buffer, ext);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new AppError(
        "Unable to verify image dimensions",
        400,
        "INVALID_IMAGE_HEADER"
      );
    }
    if (
      dimensions.width > MAX_IMAGE_WIDTH ||
      dimensions.height > MAX_IMAGE_HEIGHT ||
      dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
    ) {
      throw new AppError(
        `Image dimensions (${dimensions.width}x${dimensions.height}) exceed safety limits`,
        400,
        "IMAGE_TOO_LARGE"
      );
    }
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    originalName,
    ext,
    canonicalMime: EXT_TO_CANONICAL_MIME[ext] || "application/octet-stream",
    buffer,
    sha256,
    isImage,
    dimensions,
  };
}
