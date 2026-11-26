import { NextRequest, NextResponse } from "next/server";
import { requireUnlocked } from "@/lib/auth";
import {
  createSqliteBackup,
  exportAllDataJson,
  exportWorkbookBuffer,
  listSqliteBackups,
} from "@/lib/backup";

export async function GET(req: NextRequest) {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }

  const format = req.nextUrl.searchParams.get("format");
  if (format === "json") {
    const data = exportAllDataJson();
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bps_income_backup_${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
      },
    });
  }

  if (format === "xlsx") {
    const buf = exportWorkbookBuffer();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bps_income_export_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ backups: listSqliteBackups() });
}

export async function POST() {
  if (!(await requireUnlocked())) {
    return NextResponse.json({ error: "Locked" }, { status: 401 });
  }
  const backup = await createSqliteBackup();
  return NextResponse.json({ backup });
}
