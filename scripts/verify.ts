import assert from "node:assert";
import { calculateXIRR } from "../src/lib/finance";
import { parseWorkbookBuffer } from "../src/lib/excel-importer";
import { getEnvConfig } from "../src/lib/env";

// 1. Verify XIRR math: ₹10,000 invested on 2025-01-01 worth ₹11,200 on 2026-01-01 => ~12% XIRR
const xirr = calculateXIRR([
  { date: "2025-01-01", amount: -10000 },
  { date: "2026-01-01", amount: 11200 },
]);
assert(xirr !== null && Math.abs(xirr - 0.12) < 0.005, `Unexpected XIRR: ${xirr}`);

// 2. Verify CSV/Excel importer parser handles BPS sections cleanly
const sampleCsv = [
  ",Spends,Budget,2026-01-01,2026-02-01",
  ",Income,221000,221000,231000",
  ",,PPF (09-Oct),925073",
  ",FD_1,10000,Stable Money (North East),2028-05-02,5,0.0875",
  ",RD_1,95000,Stable Money(Suryoday),5 Yr,19,5000,0.086",
  ",Shop,Amount,,,Shop,Amount",
  ",Advance,4L,,,Advance,2L",
  ",Rent,24000,,,Rent,21000",
  ",Month,Rent,Date Paid,,Month,Solar Charge,Rent,Total,Date Paid,Mode",
  ",2026-01-25,24000,4th Feb,,,2024-07-01,2024,21000,23024,2024-08-07,UPI",
  ",Upto Age 69,Term Insurance,39834,4 Years,7 Years",
  ",,,,,,,2017-05-01,130000",
  ",,,,,,,2025-01-01,3392000",
].join("\n");

const parsed = parseWorkbookBuffer(Buffer.from(sampleCsv, "utf-8"));
assert.strictEqual(parsed.summary.incomes, 2, "Expected 2 income entries");
assert(parsed.summary.holdings >= 3, "Expected PPF, FD, RD holdings");
assert.strictEqual(parsed.summary.rentals, 2, "Expected 2 shop rentals");
assert.strictEqual(parsed.summary.rentPayments, 2, "Expected 2 rent payments");
assert.strictEqual(parsed.summary.insurances, 1, "Expected 1 insurance policy");
assert.strictEqual(parsed.summary.snapshots, 2, "Expected 2 net worth snapshots");

// 3. Verify AI env config resolves cleanly to open-source provider
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
