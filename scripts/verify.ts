import assert from "node:assert";
import { calculateXIRR } from "../src/lib/finance";
import { parseWorkbookBuffer } from "../src/lib/excel-importer";
import { getEnvConfig } from "../src/lib/env";

async function main() {
  // 1. Verify XIRR math: 10,000 invested on 2024-01-01 worth 11,200 on 2025-01-01 => ~12% XIRR
  const xirr = calculateXIRR([
    { date: "2024-01-01", amount: -10000 },
    { date: "2025-01-01", amount: 11200 },
  ]);
  assert(
    xirr !== null && Math.abs(xirr - 0.12) < 0.005,
    `Unexpected XIRR: ${xirr}`
  );

  // 2. Verify CSV/Excel importer parser with sanitized fictional fixtures
  const sampleCsv = [
    ",Spends,Budget,2024-01-01,2024-02-01",
    ",Income,100000,100000,105000",
    ",,PPF,150000",
    ",FD_1,50000,Example Bank,2026-05-01,5,0.075",
    ",RD_1,25000,Sample Bank,5 Yr,5,5000,0.072",
    ",Shop,Amount,,,Shop,Amount",
    ",Advance,100000,,,Advance,50000",
    ",Rent,10000,,,Rent,8000",
    ",Month,Rent,Date Paid,,Month,Solar Charge,Rent,Total,Date Paid,Mode",
    ",2024-01-05,10000,2024-01-06,,,2024-01-05,500,8000,8500,2024-01-06,UPI",
    ",2030-01-01,Term Insurance,12000,Annual,1Cr",
    ",,,,,,,2022-01-01,500000",
    ",,,,,,,2024-01-01,1200000",
  ].join("\n");

  const parsed = await parseWorkbookBuffer(
    Buffer.from(sampleCsv, "utf-8"),
    "fictional_sample.csv"
  );
  assert.strictEqual(parsed.summary.incomes, 2, "Expected 2 income entries");
  assert(parsed.summary.holdings >= 3, "Expected PPF, FD, RD holdings");
  assert.strictEqual(parsed.summary.rentals, 2, "Expected 2 rental units");
  assert.strictEqual(
    parsed.summary.rentPayments,
    2,
    "Expected 2 rent payments"
  );
  assert.strictEqual(
    parsed.summary.insurances,
    1,
    "Expected 1 insurance policy"
  );
  assert.strictEqual(
    parsed.summary.snapshots,
    2,
    "Expected 2 net worth snapshots"
  );
  assert.strictEqual(
    parsed.snapshots[0].liabilitiesKnown,
    false,
    "Expected unknown liabilities for historical asset-only snapshot"
  );

  // 3. Verify AI env config resolves cleanly
  const envCfg = getEnvConfig();
  assert(
    ["ollama", "oss_openai", "local"].includes(envCfg.activeProvider),
    `Unexpected activeProvider: ${envCfg.activeProvider}`
  );

  console.log("VERIFICATION PASSED:", {
    xirrPct: (xirr * 100).toFixed(2) + "%",
    parsedSummary: parsed.summary,
    aiActiveProvider: envCfg.activeProvider,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
