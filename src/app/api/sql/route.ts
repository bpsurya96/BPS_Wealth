import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import {
  executeSqlStudioQuery,
  getSqlStudioSchema,
} from "@/lib/sql-studio";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json(getSqlStudioSchema());
  } catch (err) {
    return handleApiError(err, "sql.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();

    const body = await req.json();
    const rawSql = String(body.query || "");
    const allowWrite = Boolean(body.allowWrite);

    const result = executeSqlStudioQuery(rawSql, allowWrite);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AppError) {
      return handleApiError(err, "sql.POST");
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SQL execution failed" },
      { status: 400 }
    );
  }
}
