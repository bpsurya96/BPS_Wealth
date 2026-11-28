import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { handleApiError } from "@/lib/errors";
import { updatePlanningProfileSchema } from "@/lib/validation";
import {
  getFireAndRetirementData,
  getPortfolioRiskAndLiquidityData,
  updatePlanningProfile,
} from "@/services/wealth-planning";

export async function GET() {
  try {
    await requireAdminSession();
    const fireData = getFireAndRetirementData();
    const riskData = getPortfolioRiskAndLiquidityData();
    return NextResponse.json({
      ...fireData,
      emergency: riskData.emergency,
    });
  } catch (err) {
    return handleApiError(err, "planning.profile.GET");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const parsed = updatePlanningProfileSchema.parse(await req.json());
    updatePlanningProfile(parsed);
    const fireData = getFireAndRetirementData();
    const riskData = getPortfolioRiskAndLiquidityData();
    return NextResponse.json({
      ...fireData,
      emergency: riskData.emergency,
    });
  } catch (err) {
    return handleApiError(err, "planning.profile.PATCH");
  }
}
