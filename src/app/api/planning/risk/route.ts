import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getPortfolioRiskAndLiquidityData } from "@/services/wealth-planning";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json(getPortfolioRiskAndLiquidityData());
  } catch (err) {
    return handleApiError(err, "planning.risk.GET");
  }
}
