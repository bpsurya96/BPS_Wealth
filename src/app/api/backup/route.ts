import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { paths } from "@/db";
import { requireAdminSession } from "@/lib/auth";
import {
  createFullBackupBundle,
  exportAllDataJson,
  exportWorkbookBuffer,
  listSqliteBackups,
  restoreFromBackupBuffer,
  verifyAndPreviewBackupBuffer,
} from "@/lib/backup";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import { resolveContainedPath } from "@/lib/upload-security";

const MAX_BACKUP_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();

    const format = req.nextUrl.searchParams.get("format");
    if (format === "json") {
      const data = exportAllDataJson();
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="bps_wealth_export_${new Date()
            .toISOString()
            .slice(0, 10)}.json"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    if (format === "xlsx") {
      const buf = await exportWorkbookBuffer();
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bps_wealth_export_${new Date()
            .toISOString()
            .slice(0, 10)}.xlsx"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const downloadFile = req.nextUrl.searchParams.get("download");
    if (downloadFile) {
      const target = resolveContainedPath(paths.BACKUP_DIR, downloadFile);
      if (!fs.existsSync(target)) {
        throw new AppError("Backup file not found", 404, "NOT_FOUND");
      }
      const bytes = fs.readFileSync(target);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${downloadFile}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json({ backups: listSqliteBackups() });
  } catch (err) {
    return handleApiError(err, "backup.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const action = String(formData.get("action") || "preview");
      const passphrase = String(formData.get("passphrase") || "").trim() || undefined;
      const filename = String(formData.get("filename") || "").trim();
      const file = formData.get("file");

      let rawBuf: Buffer;
      if (file instanceof File) {
        if (file.size <= 0 || file.size > MAX_BACKUP_UPLOAD_BYTES) {
          throw new AppError("Backup file size out of allowed bounds", 400, "INVALID_BACKUP_SIZE");
        }
        rawBuf = Buffer.from(await file.arrayBuffer());
      } else if (filename) {
        const target = resolveContainedPath(paths.BACKUP_DIR, filename);
        if (!fs.existsSync(target)) {
          throw new AppError("Backup file not found", 404, "NOT_FOUND");
        }
        rawBuf = fs.readFileSync(target);
      } else {
        throw new AppError("Provide a backup file or filename", 400, "MISSING_BACKUP_SOURCE");
      }

      if (action === "preview") {
        const preview = verifyAndPreviewBackupBuffer(rawBuf, passphrase);
        return NextResponse.json({ preview });
      }

      if (action === "restore") {
        const result = await restoreFromBackupBuffer(rawBuf, passphrase);
        return NextResponse.json({ result });
      }

      throw new AppError("Unknown backup action", 400, "UNKNOWN_ACTION");
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create");
    const passphrase =
      typeof body.passphrase === "string" && body.passphrase.trim()
        ? body.passphrase.trim()
        : undefined;

    if (action === "verify" && typeof body.filename === "string") {
      const target = resolveContainedPath(paths.BACKUP_DIR, body.filename);
      if (!fs.existsSync(target)) {
        throw new AppError("Backup file not found", 404, "NOT_FOUND");
      }
      const preview = verifyAndPreviewBackupBuffer(
        fs.readFileSync(target),
        passphrase
      );
      return NextResponse.json({ preview });
    }

    if (action === "restore" && typeof body.filename === "string") {
      const target = resolveContainedPath(paths.BACKUP_DIR, body.filename);
      if (!fs.existsSync(target)) {
        throw new AppError("Backup file not found", 404, "NOT_FOUND");
      }
      const result = await restoreFromBackupBuffer(
        fs.readFileSync(target),
        passphrase
      );
      return NextResponse.json({ result });
    }

    const backup = await createFullBackupBundle({
      prefix: "bps_wealth",
      passphrase,
    });
    return NextResponse.json({
      backup: {
        filename: backup.filename,
        sizeBytes: backup.sizeBytes,
        createdAt: backup.createdAt,
        verified: backup.verified,
        encrypted: backup.manifest.encrypted,
        documentCount: backup.manifest.documentCount,
        recordCounts: backup.manifest.recordCounts,
      },
    });
  } catch (err) {
    return handleApiError(err, "backup.POST");
  }
}
