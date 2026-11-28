import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getDashboardPortfolioData } from "@/services/portfolio";
import { getDashboardPlanningSummary } from "@/services/wealth-planning";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json({
      ...getDashboardPortfolioData(),
      planning: getDashboardPlanningSummary(),
    });
  } catch (err) {
    return handleApiError(err, "dashboard.GET");
  }
}
