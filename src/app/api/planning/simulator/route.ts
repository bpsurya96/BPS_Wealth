import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { financialScenarios } from "@/db/schema";
import { requireAdminSession } from "@/lib/auth";
import { verifyCsrf } from "@/lib/csrf";
import { AppError, handleApiError } from "@/lib/errors";
import {
  saveScenarioSchema,
  whatIfAdjustmentsSchema,
} from "@/lib/validation";
import { runWhatIfSimulation } from "@/lib/wealth-calculations";
import {
  getSimulationBaseline,
  getSimulatorOverview,
} from "@/services/wealth-planning";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json(getSimulatorOverview());
  } catch (err) {
    return handleApiError(err, "planning.simulator.GET");
  }
}

export async function POST(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const body = await req.json();

    if (body?.action === "save") {
      const parsed = saveScenarioSchema.parse(body);
      const now = new Date().toISOString();
      const configJson = JSON.stringify(parsed.adjustments);

      let saved;
      if (parsed.id) {
        saved = db
          .update(financialScenarios)
          .set({
            name: parsed.name,
            description: parsed.description,
            configJson,
            updatedAt: now,
          })
          .where(eq(financialScenarios.id, parsed.id))
          .returning()
          .get();
        if (!saved) {
          throw new AppError("Scenario not found", 404, "NOT_FOUND");
        }
      } else {
        saved = db
          .insert(financialScenarios)
          .values({
            name: parsed.name,
            description: parsed.description,
            configJson,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
      }

      const baseline = getSimulationBaseline();
      const simulation = runWhatIfSimulation(baseline, parsed.adjustments);
      return NextResponse.json(
        { scenario: saved, baseline, simulation },
        { status: parsed.id ? 200 : 201 }
      );
    }

    const adjustments = whatIfAdjustmentsSchema.parse(body?.adjustments ?? body);
    const baseline = getSimulationBaseline();
    const simulation = runWhatIfSimulation(baseline, adjustments);
    return NextResponse.json({
      baseline,
      adjustments,
      simulation,
    });
  } catch (err) {
    return handleApiError(err, "planning.simulator.POST");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrf(req);
    await requireAdminSession();
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError("Invalid scenario id", 400, "INVALID_ID");
    }
    db.delete(financialScenarios).where(eq(financialScenarios.id, id)).run();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "planning.simulator.DELETE");
  }
}
