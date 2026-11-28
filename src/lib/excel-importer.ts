import crypto from "crypto";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  assetRegister,
  financialGoals,
  importHistory,
  incomeEntries,
  insurancePolicies,
  investmentHoldings,
  investmentTransactions,
  loans,
  loanTransactions,
  netWorthSnapshots,
  rentalPayments,
  rentalProperties,
} from "@/db/schema";
import { toMinorUnits } from "./currency";
import { AppError } from "./errors";
import { computeHoldingSummaryFromTransactions } from "./finance";
import { guessSchemeOrTicker } from "./market-data";

const MAX_SHEETS = 25;
const MAX_ROWS_PER_SHEET = 20000;
const MAX_COLS_PER_ROW = 100;
const MAX_TOTAL_CELLS = 250000;

export interface ParsedImportData {
  fileSha256: string;
  fileName: string;
  summary: {
    incomes: number;
    holdings: number;
    transactions: number;
    rentals: number;
    rentPayments: number;
    loans: number;
    loanTransactions: number;
    insurances: number;
    snapshots: number;
    goals: number;
    assets: number;
  };
  incomes: Array<{
    month: string;
    date: string;
    source: string;
    category: string;
    grossAmount: number;
    inhandAmount: number;
    tdsAmount: number;
    account: string;
    notes: string;
  }>;
  holdings: Array<{
    key: string;
    name: string;
    assetClass: string;
    currency: string;
    schemeCode: string;
    ticker: string;
    platform: string;
    plannedSip: number;
    targetAmount: number;
    investedAmount: number;
    currentValue: number;
    units: number;
    avgNav: number;
    currentNav: number;
    interestRate: number;
    startDate: string;
    maturityDate: string;
    tenureMonths: number;
    isEmergencyFund: boolean;
    status: string;
    notes: string;
  }>;
  transactions: Array<{
    holdingKey: string;
    holdingName: string;
    date: string;
    type: string;
    amount: number;
    currency: string;
    fxRate: number;
    navOrPrice: number;
    units: number;
    employerAmount: number;
    remarks: string;
  }>;
  rentals: Array<{
    key: string;
    name: string;
    tenantName: string;
    advancePaid: number;
    advancePending: number;
    monthlyRent: number;
    status: string;
    notes: string;
  }>;
  rentPayments: Array<{
    rentalKey: string;
    rentalName: string;
    billingMonth: string;
    rentAmount: number;
    solarCharge: number;
    deductions: number;
    totalAmount: number;
    paidDate: string;
    paymentMode: string;
    notes: string;
  }>;
  loans: Array<{
    key: string;
    name: string;
    lender: string;
    principalSanctioned: number;
    currentBalance: number;
    interestRate: number;
    emiAmount: number;
    tenureMonths: number;
    startDate: string;
    closedDate: string;
    status: string;
    notes: string;
  }>;
  loanTransactions: Array<{
    loanKey: string;
    loanName: string;
    txnDate: string;
    description: string;
    type: string;
    debit: number;
    credit: number;
    balanceAfter: number;
  }>;
  insurances: Array<{
    name: string;
    policyType: string;
    provider: string;
    premiumAmount: number;
    premiumFrequency: string;
    coverAmount: string;
    startDate: string;
    expiryDate: string;
    maturityDate: string;
    status: string;
    notes: string;
  }>;
  snapshots: Array<{
    date: string;
    totalAssets: number;
    totalLiabilities: number | null;
    liabilitiesKnown: boolean;
    netWorth: number | null;
    source: string;
    notes: string;
  }>;
  goals: Array<{
    name: string;
    category: string;
    targetAmount: number;
    currentAmount: number;
    targetDate: string;
    notes: string;
  }>;
  assets: Array<{
    name: string;
    assetType: string;
    currency: string;
    currentValue: number;
    valuationDate: string;
    isEstimated: boolean;
    notes: string;
  }>;
  rejected: Array<{ section: string; reason: string }>;
}

export interface ImportDiffPreview {
  alreadyImported: boolean;
  previousImports: Array<{
    id: number;
    fileName: string;
    createdAt: string;
    mode: string;
  }>;
  counts: {
    toAdd: number;
    toUpdate: number;
    toSkip: number;
    rejected: number;
  };
  breakdown: Record<
    string,
    { add: number; update: number; skip: number }
  >;
}

function cleanNum(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val !== "string") return 0;
  const trimmed = val.trim();
  if (!trimmed || trimmed === "NaN" || trimmed === "-") return 0;
  // Support shorthand like "4L" / "1.5Cr" if present in cell text
  const lakhMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*L$/i);
  if (lakhMatch) return Number.parseFloat(lakhMatch[1]) * 100000;
  const crMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*Cr$/i);
  if (crMatch) return Number.parseFloat(crMatch[1]) * 10000000;
  const s = trimmed.replace(/[₹$,\s]/g, "");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(val: unknown): string {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "number" && val > 25000 && val < 70000) {
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof val !== "string") return "";
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return "";
}

function cellStr(row: unknown[], col: number): string {
  const v = row[col];
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "result" in (v as Record<string, unknown>)) {
    const res = (v as { result?: unknown }).result;
    return res == null ? "" : String(res).trim();
  }
  if (typeof v === "object" && "text" in (v as Record<string, unknown>)) {
    const txt = (v as { text?: unknown }).text;
    return txt == null ? "" : String(txt).trim();
  }
  return String(v).trim();
}

function unwrapCellValue(val: unknown): unknown {
  if (val == null) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if ("result" in obj && obj.result !== undefined) return obj.result;
    if ("text" in obj && obj.text !== undefined) return obj.text;
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((r: { text?: string }) => r.text || "").join("");
    }
  }
  return val;
}

function parseCsvRows(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
      if (row.length > MAX_COLS_PER_ROW) {
        throw new AppError(
          `CSV row exceeds maximum ${MAX_COLS_PER_ROW} columns`,
          400,
          "SPREADSHEET_TOO_COMPLEX"
        );
      }
    } else if (ch === "\r" && next === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }

    if (rows.length > MAX_ROWS_PER_SHEET) {
      throw new AppError(
        `CSV exceeds maximum ${MAX_ROWS_PER_SHEET} rows`,
        400,
        "SPREADSHEET_TOO_COMPLEX"
      );
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function readSheetsFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<Array<{ name: string; rows: unknown[][] }>> {
  const lower = fileName.toLowerCase();
  const isCsv =
    lower.endsWith(".csv") ||
    !(buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b);

  if (lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
    throw new AppError(
      "Legacy .xls binary format is unsupported for security reasons. Please save the workbook as .xlsx or .csv.",
      400,
      "UNSUPPORTED_XLS_FORMAT"
    );
  }

  if (isCsv) {
    const rows = parseCsvRows(buffer.toString("utf-8"));
    return [{ name: "CSV", rows }];
  }

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);

  if (wb.worksheets.length > MAX_SHEETS) {
    throw new AppError(
      `Workbook has ${wb.worksheets.length} sheets, exceeding maximum ${MAX_SHEETS}`,
      400,
      "SPREADSHEET_TOO_COMPLEX"
    );
  }

  let totalCells = 0;
  const result: Array<{ name: string; rows: unknown[][] }> = [];

  for (const ws of wb.worksheets) {
    if (ws.rowCount > MAX_ROWS_PER_SHEET) {
      throw new AppError(
        `Sheet "${ws.name}" exceeds ${MAX_ROWS_PER_SHEET} rows`,
        400,
        "SPREADSHEET_TOO_COMPLEX"
      );
    }
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > MAX_ROWS_PER_SHEET) {
        throw new AppError(
          `Sheet "${ws.name}" exceeds ${MAX_ROWS_PER_SHEET} rows`,
          400,
          "SPREADSHEET_TOO_COMPLEX"
        );
      }
      const arr: unknown[] = [];
      const colLimit = Math.min(row.cellCount + 5, MAX_COLS_PER_ROW);
      for (let c = 1; c <= colLimit; c++) {
        const val = unwrapCellValue(row.getCell(c).value);
        arr[c - 1] = val;
        if (val !== "" && val != null) {
          totalCells++;
          if (totalCells > MAX_TOTAL_CELLS) {
            throw new AppError(
              `Workbook exceeds ${MAX_TOTAL_CELLS} non-empty cells limit`,
              400,
              "SPREADSHEET_TOO_COMPLEX"
            );
          }
        }
      }
      rows.push(arr);
    });
    result.push({ name: ws.name, rows });
  }

  return result;
}

function sheetRowsToObjects(rows: unknown[][]): Array<Record<string, unknown>> {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h ?? "").trim());
  const out: Array<Record<string, unknown>> = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === "" || c == null)) continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c] ?? "";
    }
    if (obj.note === "No records yet") continue;
    out.push(obj);
  }
  return out;
}

export async function parseWorkbookBuffer(
  buffer: Buffer,
  fileName = "workbook.xlsx"
): Promise<ParsedImportData> {
  const fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const sheets = await readSheetsFromBuffer(buffer, fileName);

  const incomes: ParsedImportData["incomes"] = [];
  const holdingsMap = new Map<string, ParsedImportData["holdings"][number]>();
  const transactions: ParsedImportData["transactions"] = [];
  const rentals: ParsedImportData["rentals"] = [];
  const rentPayments: ParsedImportData["rentPayments"] = [];
  const loansList: ParsedImportData["loans"] = [];
  const loanTransactions: ParsedImportData["loanTransactions"] = [];
  const insurances: ParsedImportData["insurances"] = [];
  const snapshots: ParsedImportData["snapshots"] = [];
  const goals: ParsedImportData["goals"] = [];
  const assets: ParsedImportData["assets"] = [];
  const rejected: ParsedImportData["rejected"] = [];

  // 1. Check if this is a structured BPS Wealth export workbook (round-trip support)
  const sheetByName = new Map(sheets.map((s) => [s.name.toLowerCase(), s.rows]));
  const isStructuredExport =
    sheetByName.has("holdings") ||
    sheetByName.has("income") ||
    sheetByName.has("investment_txns");

  if (isStructuredExport) {
    const incRows = sheetRowsToObjects(sheetByName.get("income") ?? []);
    for (const r of incRows) {
      const date = normalizeDate(r.date) || String(r.date || "");
      const inhandAmount = cleanNum(r.inhandAmount ?? r.inhand_amount);
      if (!date || inhandAmount <= 0) continue;
      incomes.push({
        month: String(r.month || date.slice(0, 7)),
        date,
        source: String(r.source || "Income"),
        category: String(r.category || "salary"),
        grossAmount: cleanNum(r.grossAmount ?? r.gross_amount) || inhandAmount,
        inhandAmount,
        tdsAmount: cleanNum(r.tdsAmount ?? r.tds_amount),
        account: String(r.account || "Bank"),
        notes: String(r.notes || ""),
      });
    }

    const oldHoldingIdToKey = new Map<string, string>();
    const holdRows = sheetRowsToObjects(sheetByName.get("holdings") ?? []);
    for (const r of holdRows) {
      const name = String(r.name || "").trim();
      if (!name) continue;
      const assetClass = String(r.assetClass ?? r.asset_class ?? "mutual_fund");
      const key = `${assetClass}::${name.toLowerCase()}`;
      if (r.id != null && r.id !== "") {
        oldHoldingIdToKey.set(String(r.id), key);
      }
      holdingsMap.set(key, {
        key,
        name,
        assetClass,
        currency: String(r.currency || "INR"),
        schemeCode: String(r.schemeCode ?? r.scheme_code ?? ""),
        ticker: String(r.ticker || ""),
        platform: String(r.platform || ""),
        plannedSip: cleanNum(r.plannedSip ?? r.planned_sip),
        targetAmount: cleanNum(r.targetAmount ?? r.target_amount),
        investedAmount: cleanNum(r.investedAmount ?? r.invested_amount),
        currentValue: cleanNum(r.currentValue ?? r.current_value),
        units: cleanNum(r.units),
        avgNav: cleanNum(r.avgNav ?? r.avg_nav),
        currentNav: cleanNum(r.currentNav ?? r.current_nav),
        interestRate: cleanNum(r.interestRate ?? r.interest_rate),
        startDate: String(r.startDate ?? r.start_date ?? ""),
        maturityDate: String(r.maturityDate ?? r.maturity_date ?? ""),
        tenureMonths: Math.trunc(cleanNum(r.tenureMonths ?? r.tenure_months)),
        isEmergencyFund: Boolean(r.isEmergencyFund ?? r.is_emergency_fund),
        status: String(r.status || "active"),
        notes: String(r.notes || ""),
      });
    }

    const txRows = sheetRowsToObjects(sheetByName.get("investment_txns") ?? []);
    for (const r of txRows) {
      const hid = String(r.holdingId ?? r.holding_id ?? "");
      const holdingKey = oldHoldingIdToKey.get(hid) || "";
      const holding = holdingsMap.get(holdingKey);
      const date = normalizeDate(r.date) || String(r.date || "");
      const amount = cleanNum(r.amount);
      if (!holding || !date || amount <= 0) {
        rejected.push({ section: "investment_txns", reason: "Unmatched holding or invalid date/amount" });
        continue;
      }
      transactions.push({
        holdingKey,
        holdingName: holding.name,
        date,
        type: String(r.type || "sip"),
        amount,
        currency: String(r.currency || holding.currency || "INR"),
        fxRate: cleanNum(r.fxRate ?? r.fx_rate) || 1,
        navOrPrice: cleanNum(r.navOrPrice ?? r.nav_or_price),
        units: cleanNum(r.units),
        employerAmount: cleanNum(r.employerAmount ?? r.employer_amount),
        remarks: String(r.remarks || ""),
      });
    }

    const oldRentalIdToKey = new Map<string, string>();
    for (const r of sheetRowsToObjects(sheetByName.get("rentals") ?? [])) {
      const name = String(r.name || "").trim();
      if (!name) continue;
      const key = `rental::${name.toLowerCase()}`;
      if (r.id != null && r.id !== "") oldRentalIdToKey.set(String(r.id), key);
      rentals.push({
        key,
        name,
        tenantName: String(r.tenantName ?? r.tenant_name ?? ""),
        advancePaid: cleanNum(r.advancePaid ?? r.advance_paid),
        advancePending: cleanNum(r.advancePending ?? r.advance_pending),
        monthlyRent: cleanNum(r.monthlyRent ?? r.monthly_rent),
        status: String(r.status || "occupied"),
        notes: String(r.notes || ""),
      });
    }

    for (const r of sheetRowsToObjects(sheetByName.get("rent_payments") ?? [])) {
      const pid = String(r.propertyId ?? r.property_id ?? "");
      const rentalKey = oldRentalIdToKey.get(pid) || "";
      const rental = rentals.find((x) => x.key === rentalKey);
      const billingMonth = String(r.billingMonth ?? r.billing_month ?? "");
      const rentAmount = cleanNum(r.rentAmount ?? r.rent_amount);
      if (!rental || !billingMonth || rentAmount <= 0) continue;
      rentPayments.push({
        rentalKey,
        rentalName: rental.name,
        billingMonth,
        rentAmount,
        solarCharge: cleanNum(r.solarCharge ?? r.solar_charge),
        deductions: cleanNum(r.deductions),
        totalAmount: cleanNum(r.totalAmount ?? r.total_amount) || rentAmount,
        paidDate: String(r.paidDate ?? r.paid_date ?? ""),
        paymentMode: String(r.paymentMode ?? r.payment_mode ?? "UPI"),
        notes: String(r.notes || ""),
      });
    }

    const oldLoanIdToKey = new Map<string, string>();
    for (const r of sheetRowsToObjects(sheetByName.get("loans") ?? [])) {
      const name = String(r.name || "").trim();
      if (!name) continue;
      const key = `loan::${name.toLowerCase()}`;
      if (r.id != null && r.id !== "") oldLoanIdToKey.set(String(r.id), key);
      loansList.push({
        key,
        name,
        lender: String(r.lender || ""),
        principalSanctioned: cleanNum(r.principalSanctioned ?? r.principal_sanctioned),
        currentBalance: cleanNum(r.currentBalance ?? r.current_balance),
        interestRate: cleanNum(r.interestRate ?? r.interest_rate),
        emiAmount: cleanNum(r.emiAmount ?? r.emi_amount),
        tenureMonths: Math.trunc(cleanNum(r.tenureMonths ?? r.tenure_months)),
        startDate: String(r.startDate ?? r.start_date ?? ""),
        closedDate: String(r.closedDate ?? r.closed_date ?? ""),
        status: String(r.status || "active"),
        notes: String(r.notes || ""),
      });
    }

    for (const r of sheetRowsToObjects(sheetByName.get("loan_ledger") ?? [])) {
      const lid = String(r.loanId ?? r.loan_id ?? "");
      const loanKey = oldLoanIdToKey.get(lid) || "";
      const loan = loansList.find((x) => x.key === loanKey);
      const txnDate = normalizeDate(r.txnDate ?? r.txn_date);
      if (!loan || !txnDate) continue;
      loanTransactions.push({
        loanKey,
        loanName: loan.name,
        txnDate,
        description: String(r.description || ""),
        type: String(r.type || "emi"),
        debit: cleanNum(r.debit),
        credit: cleanNum(r.credit),
        balanceAfter: cleanNum(r.balanceAfter ?? r.balance_after),
      });
    }

    for (const r of sheetRowsToObjects(sheetByName.get("insurance") ?? [])) {
      const name = String(r.name || "").trim();
      if (!name) continue;
      insurances.push({
        name,
        policyType: String(r.policyType ?? r.policy_type ?? "term"),
        provider: String(r.provider || ""),
        premiumAmount: cleanNum(r.premiumAmount ?? r.premium_amount),
        premiumFrequency: String(r.premiumFrequency ?? r.premium_frequency ?? "annual"),
        coverAmount: String(r.coverAmount ?? r.cover_amount ?? ""),
        startDate: String(r.startDate ?? r.start_date ?? ""),
        expiryDate: String(r.expiryDate ?? r.expiry_date ?? ""),
        maturityDate: String(r.maturityDate ?? r.maturity_date ?? ""),
        status: String(r.status || "active"),
        notes: String(r.notes || ""),
      });
    }

    for (const r of sheetRowsToObjects(sheetByName.get("net_worth") ?? [])) {
      const date = normalizeDate(r.date);
      if (!date) continue;
      const totalAssets = cleanNum(r.totalAssets ?? r.total_assets);
      const rawLiab = r.totalLiabilities ?? r.total_liabilities;
      const liabilitiesKnown =
        r.liabilitiesKnown !== undefined
          ? Boolean(r.liabilitiesKnown)
          : rawLiab !== "" && rawLiab != null;
      const totalLiabilities = liabilitiesKnown ? cleanNum(rawLiab) : null;
      snapshots.push({
        date,
        totalAssets,
        totalLiabilities,
        liabilitiesKnown,
        netWorth:
          liabilitiesKnown && totalLiabilities !== null
            ? totalAssets - totalLiabilities
            : null,
        source: String(r.source || "excel_import"),
        notes: String(r.notes || ""),
      });
    }

    for (const r of sheetRowsToObjects(sheetByName.get("goals") ?? [])) {
      const name = String(r.name || "").trim();
      if (!name) continue;
      goals.push({
        name,
        category: String(r.category || "wealth"),
        targetAmount: cleanNum(r.targetAmount ?? r.target_amount),
        currentAmount: cleanNum(r.currentAmount ?? r.current_amount),
        targetDate: String(r.targetDate ?? r.target_date ?? ""),
        notes: String(r.notes || ""),
      });
    }

    for (const r of sheetRowsToObjects(sheetByName.get("assets") ?? [])) {
      const name = String(r.name || "").trim();
      if (!name) continue;
      assets.push({
        name,
        assetType: String(r.assetType ?? r.asset_type ?? "financial_cash"),
        currency: String(r.currency || "INR"),
        currentValue: cleanNum(r.currentValue ?? r.current_value),
        valuationDate: String(r.valuationDate ?? r.valuation_date ?? ""),
        isEstimated: Boolean(r.isEstimated ?? r.is_estimated),
        notes: String(r.notes || ""),
      });
    }
  } else {
    // 2. Flexible section-based parser (purely extracts from uploaded file cells; zero hardcoded personal records)
    const allRows: unknown[][] = sheets.flatMap((s) => s.rows);
    const seenIncomeMonths = new Set<string>();

    for (let r = 0; r < allRows.length; r++) {
      const row = allRows[r];
      if (!row || row.length === 0) continue;

      // Income header + row ("Spends" row followed by "Income" row)
      if (cellStr(row, 1) === "Spends" && r + 1 < allRows.length) {
        const incomeRow = allRows[r + 1];
        if (cellStr(incomeRow, 1) === "Income") {
          for (let c = 3; c < row.length; c++) {
            const d = normalizeDate(row[c]);
            const amt = cleanNum(incomeRow[c]);
            if (d && amt > 0) {
              const month = d.slice(0, 7);
              if (!seenIncomeMonths.has(month)) {
                seenIncomeMonths.add(month);
                incomes.push({
                  month,
                  date: d,
                  source: "Salary",
                  category: "salary",
                  grossAmount: amt,
                  inhandAmount: amt,
                  tdsAmount: 0,
                  account: "Bank",
                  notes: "Imported from monthly sheet",
                });
              }
            }
          }
        }
      }

      // Mutual Fund & ETF summary table
      if (
        cellStr(row, 5) === "Mutual Fund" &&
        cellStr(row, 6) === "Total Invested"
      ) {
        for (let k = r + 1; k < Math.min(r + 25, allRows.length); k++) {
          const sub = allRows[k];
          if (!sub) break;
          const name = cellStr(sub, 5);
          if (!name) continue;
          const totalInvested = cleanNum(sub[6]);
          if (totalInvested <= 0) continue;
          const sip = cleanNum(sub[8]);
          const units = cleanNum(sub[10]);
          const avgNav = cleanNum(sub[11]);
          const isUsEtf = /vanguard|invesco|qqq|sp500|s&p\s*500/i.test(name);
          const guessed = guessSchemeOrTicker(name);
          const key = `mf_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
          holdingsMap.set(key, {
            key,
            name,
            assetClass: isUsEtf ? "etf_us" : "mutual_fund",
            currency: isUsEtf ? "USD" : "INR",
            schemeCode: guessed.schemeCode,
            ticker: guessed.ticker,
            platform: "",
            plannedSip: sip,
            targetAmount: 0,
            investedAmount: totalInvested,
            currentValue: totalInvested,
            units,
            avgNav,
            currentNav: avgNav,
            interestRate: 0,
            startDate: "",
            maturityDate: "",
            tenureMonths: 0,
            isEmergencyFund: false,
            status: "active",
            notes: "Imported from MF/ETF summary",
          });
        }
      }

      // Horizontal MF / ETF Transaction Blocks
      const dateCols: number[] = [];
      for (let c = 0; c < row.length; c++) {
        if (
          cellStr(row, c) === "Date" &&
          cellStr(row, c + 1) === "Days" &&
          cellStr(row, c + 2).startsWith("Amount") &&
          cellStr(row, c + 3) === "NAV"
        ) {
          dateCols.push(c);
        }
      }
      if (dateCols.length > 0 && r >= 1) {
        for (const col of dateCols) {
          let blockTitle = "";
          for (let back = 1; back <= Math.min(2, r); back++) {
            const candidateRow = allRows[r - back];
            const cand = cellStr(candidateRow, col) || cellStr(candidateRow, col - 1);
            if (cand && Number.isNaN(Number(cand.replace(/,/g, "")))) {
              blockTitle = cand;
              break;
            }
          }
          if (!blockTitle) continue;
          let matchedKey = "";
          for (const [k, h] of holdingsMap.entries()) {
            if (
              h.name.toLowerCase().includes(blockTitle.toLowerCase().slice(0, 10)) ||
              blockTitle.toLowerCase().includes(h.name.toLowerCase().slice(0, 10))
            ) {
              matchedKey = k;
              break;
            }
          }
          if (!matchedKey) {
            const isUsEtf = /vanguard|invesco|qqq/i.test(blockTitle);
            const guessed = guessSchemeOrTicker(blockTitle);
            matchedKey = `mf_${blockTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
            holdingsMap.set(matchedKey, {
              key: matchedKey,
              name: blockTitle,
              assetClass: isUsEtf ? "etf_us" : "mutual_fund",
              currency: isUsEtf ? "USD" : "INR",
              schemeCode: guessed.schemeCode,
              ticker: guessed.ticker,
              platform: "",
              plannedSip: 0,
              targetAmount: 0,
              investedAmount: 0,
              currentValue: 0,
              units: 0,
              avgNav: 0,
              currentNav: 0,
              interestRate: 0,
              startDate: "",
              maturityDate: "",
              tenureMonths: 0,
              isEmergencyFund: false,
              status: "active",
              notes: "Imported from transaction ledger",
            });
          }
          const holding = holdingsMap.get(matchedKey)!;
          for (let k = r + 1; k < allRows.length; k++) {
            const txRow = allRows[k];
            if (!txRow) break;
            if (cellStr(txRow, 1) === "Shop" || cellStr(txRow, 2) === "Txn Date") break;
            const d = normalizeDate(txRow[col]);
            const amt = cleanNum(txRow[col + 2]);
            const nav = cleanNum(txRow[col + 3]);
            const units = cleanNum(txRow[col + 4]);
            if (d && amt > 0) {
              transactions.push({
                holdingKey: matchedKey,
                holdingName: holding.name,
                date: d,
                type: "sip",
                amount: amt,
                currency: holding.currency,
                fxRate: 1,
                navOrPrice: nav,
                units,
                employerAmount: 0,
                remarks: "Imported from workbook ledger",
              });
            }
          }
        }
      }

      // Generic Portfolio Summary rows (PPF, Stocks, Chit, NPS, ESOP)
      const c2 = cellStr(row, 2);
      if (/^(PPF|Stocks|Chit|NPS|ESOP)\b/i.test(c2)) {
        const val = cleanNum(row[3]);
        if (val > 0) {
          const assetClass = /^PPF/i.test(c2)
            ? "ppf"
            : /^Stocks/i.test(c2)
              ? "stock"
              : /^Chit/i.test(c2)
                ? "chit"
                : /^NPS/i.test(c2)
                  ? "nps"
                  : "esop";
          const key = `summary_${assetClass}`;
          if (!holdingsMap.has(key)) {
            holdingsMap.set(key, {
              key,
              name: c2.replace(/\s*\(.*?\)/g, "").trim(),
              assetClass,
              currency: "INR",
              schemeCode: "",
              ticker: "",
              platform: "",
              plannedSip: 0,
              targetAmount: 0,
              investedAmount: val,
              currentValue: val,
              units: 0,
              avgNav: 0,
              currentNav: 0,
              interestRate: 0,
              startDate: "",
              maturityDate: "",
              tenureMonths: 0,
              isEmergencyFund: false,
              status: "active",
              notes: c2,
            });
          }
        }
      }

      // FD & RD rows
      const c1 = cellStr(row, 1);
      if (/^FD_\d+$/i.test(c1) && cleanNum(row[2]) > 0) {
        const amt = cleanNum(row[2]);
        const platform = cellStr(row, 3);
        const maturityDate = normalizeDate(row[4]);
        const rawRate = cleanNum(row[6]);
        const rate = rawRate * (rawRate > 0 && rawRate < 1 ? 100 : 1);
        const key = `fd_${c1.toLowerCase()}`;
        holdingsMap.set(key, {
          key,
          name: `${c1}${platform ? ` (${platform})` : ""}`,
          assetClass: "fd",
          currency: "INR",
          schemeCode: "",
          ticker: "",
          platform,
          plannedSip: 0,
          targetAmount: 0,
          investedAmount: amt,
          currentValue: amt,
          units: 0,
          avgNav: 0,
          currentNav: 0,
          interestRate: Number(rate.toFixed(2)),
          startDate: "",
          maturityDate,
          tenureMonths: 0,
          isEmergencyFund: true,
          status: "active",
          notes: "Fixed Deposit",
        });
      }
      if (/^RD_\d+$/i.test(c1) && cleanNum(row[2]) > 0) {
        const amt = cleanNum(row[2]);
        const platform = cellStr(row, 3);
        const sip = cleanNum(row[6]);
        const rawRate = cleanNum(row[7]);
        const rate = rawRate * (rawRate > 0 && rawRate < 1 ? 100 : 1);
        const key = `rd_${c1.toLowerCase()}`;
        holdingsMap.set(key, {
          key,
          name: `${c1}${platform ? ` (${platform})` : ""}`,
          assetClass: "rd",
          currency: "INR",
          schemeCode: "",
          ticker: "",
          platform,
          plannedSip: sip,
          targetAmount: 0,
          investedAmount: amt,
          currentValue: amt,
          units: 0,
          avgNav: 0,
          currentNav: 0,
          interestRate: Number(rate.toFixed(2)),
          startDate: "",
          maturityDate: "",
          tenureMonths: 0,
          isEmergencyFund: true,
          status: "active",
          notes: [cellStr(row, 4), cellStr(row, 5)].filter(Boolean).join(" | "),
        });
      }

      // Rental Properties & Payments (read dynamically from sheet rows, never hardcoded)
      if (cellStr(row, 1) === "Shop" && cellStr(row, 5) === "Shop") {
        let s1Advance = 0;
        let s1Rent = 0;
        let s2Advance = 0;
        let s2Rent = 0;
        for (let k = r + 1; k < Math.min(r + 5, allRows.length); k++) {
          const metaRow = allRows[k];
          if (/advance/i.test(cellStr(metaRow, 1))) {
            s1Advance = cleanNum(metaRow[2]);
            s2Advance = cleanNum(metaRow[6]);
          }
          if (/rent/i.test(cellStr(metaRow, 1))) {
            s1Rent = cleanNum(metaRow[2]);
            s2Rent = cleanNum(metaRow[6]);
          }
        }
        rentals.push(
          {
            key: "unit_1",
            name: "Rental Unit 1",
            tenantName: "Tenant 1",
            advancePaid: s1Advance,
            advancePending: 0,
            monthlyRent: s1Rent,
            status: "occupied",
            notes: "",
          },
          {
            key: "unit_2",
            name: "Rental Unit 2",
            tenantName: "Tenant 2",
            advancePaid: s2Advance,
            advancePending: 0,
            monthlyRent: s2Rent,
            status: "occupied",
            notes: "",
          }
        );

        for (let k = r + 4; k < Math.min(r + 30, allRows.length); k++) {
          const sRow = allRows[k];
          if (!sRow) break;
          const s1Date = normalizeDate(sRow[1]);
          const s1Amt = cleanNum(sRow[2]);
          if (s1Date && s1Amt > 0) {
            rentPayments.push({
              rentalKey: "unit_1",
              rentalName: "Rental Unit 1",
              billingMonth: s1Date.slice(0, 7),
              rentAmount: s1Amt,
              solarCharge: 0,
              deductions: 0,
              totalAmount: s1Amt,
              paidDate: cellStr(sRow, 3),
              paymentMode: "UPI",
              notes: "",
            });
          }
          const s2Date = normalizeDate(sRow[6]);
          const s2Solar = cleanNum(sRow[7]);
          const s2Amt = cleanNum(sRow[8]);
          const s2Total = cleanNum(sRow[9]);
          if (s2Date && s2Amt > 0) {
            rentPayments.push({
              rentalKey: "unit_2",
              rentalName: "Rental Unit 2",
              billingMonth: s2Date.slice(0, 7),
              rentAmount: s2Amt,
              solarCharge: s2Solar,
              deductions: 0,
              totalAmount: s2Total || s2Amt + s2Solar,
              paidDate: cellStr(sRow, 10),
              paymentMode: cellStr(sRow, 11).toLowerCase().includes("cash")
                ? "Cash"
                : "UPI",
              notes: cellStr(sRow, 11),
            });
          }
        }
      }

      // Generic Loan Statement Ledger (computed dynamically from ledger rows)
      if (cellStr(row, 2) === "Txn Date" && cellStr(row, 4) === "Description") {
        const loanKey = `loan_${loansList.length + 1}`;
        const loanName = `Imported Loan ${loansList.length + 1}`;
        const parsedTxns: ParsedImportData["loanTransactions"] = [];
        for (let k = r + 1; k < allRows.length; k++) {
          const lRow = allRows[k];
          if (!lRow) break;
          const d = normalizeDate(lRow[2]);
          if (!d) {
            if (k > r + 5 && cellStr(lRow, 2) === "" && cellStr(lRow, 4) === "")
              break;
            continue;
          }
          const desc = cellStr(lRow, 4);
          const debit = cleanNum(lRow[5]);
          const credit = cleanNum(lRow[6]);
          const bal = Math.abs(cleanNum(lRow[7]));
          const type = /prepay/i.test(desc)
            ? "prepayment"
            : /inter/i.test(desc)
              ? "interest"
              : debit > 0
                ? "disbursement"
                : "emi";
          parsedTxns.push({
            loanKey,
            loanName,
            txnDate: d,
            description: desc,
            type,
            debit,
            credit,
            balanceAfter: bal,
          });
        }
        if (parsedTxns.length > 0) {
          const sorted = [...parsedTxns].sort((a, b) =>
            a.txnDate.localeCompare(b.txnDate)
          );
          const lastBal = sorted[sorted.length - 1].balanceAfter;
          const totalDisbursed = parsedTxns
            .filter((t) => t.type === "disbursement")
            .reduce((s, t) => s + t.debit, 0);
          loansList.push({
            key: loanKey,
            name: loanName,
            lender: "",
            principalSanctioned: totalDisbursed,
            currentBalance: lastBal,
            interestRate: 0,
            emiAmount: 0,
            tenureMonths: 0,
            startDate: sorted[0].txnDate,
            closedDate: lastBal === 0 ? sorted[sorted.length - 1].txnDate : "",
            status: lastBal === 0 ? "closed" : "active",
            notes: "Imported from loan statement",
          });
          loanTransactions.push(...parsedTxns);
        }
      }

      // Insurance Rows
      const normC1 = normalizeDate(row[1]);
      const policyName = cellStr(row, 2);
      if (policyName && /insurance/i.test(policyName)) {
        const premium = cleanNum(row[3]);
        const policyType = /term/i.test(policyName)
          ? "term"
          : /health/i.test(policyName)
            ? "health"
            : "life_endowment";
        const freqText = cellStr(row, 4).toLowerCase();
        insurances.push({
          name: policyName,
          policyType,
          provider: "",
          premiumAmount: premium,
          premiumFrequency: freqText.includes("month") ? "monthly" : "annual",
          coverAmount: cellStr(row, 3) === "Unlimited Cover" ? "Unlimited" : "",
          startDate: "",
          expiryDate: normC1 || "",
          maturityDate: normC1 || c1,
          status: "active",
          notes: `${cellStr(row, 4)} ${cellStr(row, 5)}`.trim(),
        });
      }

      // Historical Net Worth Milestones (mark liabilities unknown unless explicitly provided)
      const snapDate = normalizeDate(row[7]);
      if (snapDate && cleanNum(row[8]) > 0) {
        const assetsVal = cleanNum(row[8]);
        const hasLiabCol = row[9] !== undefined && row[9] !== "";
        const liabVal = hasLiabCol ? cleanNum(row[9]) : null;
        snapshots.push({
          date: snapDate,
          totalAssets: assetsVal,
          totalLiabilities: liabVal,
          liabilitiesKnown: hasLiabCol,
          netWorth: hasLiabCol && liabVal !== null ? assetsVal - liabVal : null,
          source: "excel_import",
          notes: hasLiabCol
            ? "Historical Snapshot"
            : "Historical Assets Snapshot (liabilities not provided)",
        });
      }
    }
  }

  // Populate holding totals from parsed transactions when summary values are absent/zero
  for (const [key, holding] of holdingsMap.entries()) {
    const hTxns = transactions.filter((t) => t.holdingKey === key);
    if (hTxns.length === 0) continue;
    if (holding.investedAmount === 0 || holding.units === 0 || holding.currentValue === 0) {
      const computed = computeHoldingSummaryFromTransactions({
        currency: holding.currency,
        existingCurrentNav: holding.currentNav,
        transactions: hTxns,
      });
      if (holding.investedAmount === 0) holding.investedAmount = computed.investedAmount;
      if (holding.units === 0) holding.units = computed.units;
      if (holding.avgNav === 0) holding.avgNav = computed.avgNav;
      if (holding.currentNav === 0) holding.currentNav = computed.currentNav;
      if (holding.currentValue === 0) holding.currentValue = computed.currentValue;
    }
  }

  return {
    fileSha256,
    fileName,
    summary: {
      incomes: incomes.length,
      holdings: holdingsMap.size,
      transactions: transactions.length,
      rentals: rentals.length,
      rentPayments: rentPayments.length,
      loans: loansList.length,
      loanTransactions: loanTransactions.length,
      insurances: insurances.length,
      snapshots: snapshots.length,
      goals: goals.length,
      assets: assets.length,
    },
    incomes,
    holdings: Array.from(holdingsMap.values()),
    transactions,
    rentals,
    rentPayments,
    loans: loansList,
    loanTransactions,
    insurances,
    snapshots,
    goals,
    assets,
    rejected,
  };
}

export function computeImportDiffPreview(
  data: ParsedImportData
): ImportDiffPreview {
  const previousImports = db
    .select()
    .from(importHistory)
    .where(eq(importHistory.fileSha256, data.fileSha256))
    .all()
    .map((r) => ({
      id: r.id,
      fileName: r.fileName,
      createdAt: r.createdAt,
      mode: r.mode,
    }));

  const existingIncomes = db.select().from(incomeEntries).all();
  const incomeKeys = new Set(
    existingIncomes.map(
      (i) =>
        `${i.date}|${i.source.toLowerCase()}|${i.category}|${toMinorUnits(i.inhandAmount)}`
    )
  );

  const existingHoldings = db.select().from(investmentHoldings).all();
  const holdingByName = new Map(
    existingHoldings.map((h) => [`${h.assetClass}::${h.name.toLowerCase()}`, h])
  );
  const existingTxns = db.select().from(investmentTransactions).all();
  const txnKeys = new Set(
    existingTxns.map(
      (t) =>
        `${t.holdingId}|${t.date}|${t.type}|${toMinorUnits(t.amount, t.currency)}|${t.remarks}`
    )
  );

  const existingRentals = db.select().from(rentalProperties).all();
  const rentalByName = new Map(
    existingRentals.map((r) => [r.name.toLowerCase(), r])
  );
  const existingRentPays = db.select().from(rentalPayments).all();
  const rentPayKeys = new Set(
    existingRentPays.map(
      (rp) => `${rp.propertyId}|${rp.billingMonth}|${toMinorUnits(rp.rentAmount)}`
    )
  );

  const existingLoans = db.select().from(loans).all();
  const loanByName = new Map(existingLoans.map((l) => [l.name.toLowerCase(), l]));
  const existingLoanTxns = db.select().from(loanTransactions).all();
  const loanTxnKeys = new Set(
    existingLoanTxns.map(
      (lt) =>
        `${lt.loanId}|${lt.txnDate}|${lt.type}|${toMinorUnits(lt.debit)}|${toMinorUnits(lt.credit)}`
    )
  );

  const existingPolicies = db.select().from(insurancePolicies).all();
  const policyKeys = new Set(
    existingPolicies.map((p) => `${p.name.toLowerCase()}|${p.policyType}`)
  );

  const existingSnapshots = db.select().from(netWorthSnapshots).all();
  const snapshotKeys = new Set(
    existingSnapshots.map((s) => `${s.date}|${toMinorUnits(s.totalAssets)}`)
  );

  const existingGoals = db.select().from(financialGoals).all();
  const goalKeys = new Set(existingGoals.map((g) => g.name.toLowerCase()));

  const existingAssets = db.select().from(assetRegister).all();
  const assetKeys = new Set(
    existingAssets.map((a) => `${a.assetType}|${a.name.toLowerCase()}`)
  );

  const breakdown: Record<string, { add: number; update: number; skip: number }> = {
    incomes: { add: 0, update: 0, skip: 0 },
    holdings: { add: 0, update: 0, skip: 0 },
    transactions: { add: 0, update: 0, skip: 0 },
    rentals: { add: 0, update: 0, skip: 0 },
    rentPayments: { add: 0, update: 0, skip: 0 },
    loans: { add: 0, update: 0, skip: 0 },
    loanTransactions: { add: 0, update: 0, skip: 0 },
    insurances: { add: 0, update: 0, skip: 0 },
    snapshots: { add: 0, update: 0, skip: 0 },
    goals: { add: 0, update: 0, skip: 0 },
    assets: { add: 0, update: 0, skip: 0 },
  };

  for (const inc of data.incomes) {
    const k = `${inc.date}|${inc.source.toLowerCase()}|${inc.category}|${toMinorUnits(inc.inhandAmount)}`;
    if (incomeKeys.has(k)) breakdown.incomes.skip++;
    else breakdown.incomes.add++;
  }

  for (const h of data.holdings) {
    if (holdingByName.has(`${h.assetClass}::${h.name.toLowerCase()}`)) {
      breakdown.holdings.skip++;
    } else {
      breakdown.holdings.add++;
    }
  }

  for (const t of data.transactions) {
    const hMatch = existingHoldings.find(
      (eh) => eh.name.toLowerCase() === t.holdingName.toLowerCase()
    );
    const k = hMatch
      ? `${hMatch.id}|${t.date}|${t.type}|${toMinorUnits(t.amount, t.currency)}|${t.remarks}`
      : "";
    if (k && txnKeys.has(k)) breakdown.transactions.skip++;
    else breakdown.transactions.add++;
  }

  for (const r of data.rentals) {
    if (rentalByName.has(r.name.toLowerCase())) breakdown.rentals.skip++;
    else breakdown.rentals.add++;
  }

  for (const rp of data.rentPayments) {
    const rMatch = rentalByName.get(rp.rentalName.toLowerCase());
    const k = rMatch
      ? `${rMatch.id}|${rp.billingMonth}|${toMinorUnits(rp.rentAmount)}`
      : "";
    if (k && rentPayKeys.has(k)) breakdown.rentPayments.skip++;
    else breakdown.rentPayments.add++;
  }

  for (const l of data.loans) {
    if (loanByName.has(l.name.toLowerCase())) breakdown.loans.skip++;
    else breakdown.loans.add++;
  }

  for (const lt of data.loanTransactions) {
    const lMatch = loanByName.get(lt.loanName.toLowerCase());
    const k = lMatch
      ? `${lMatch.id}|${lt.txnDate}|${lt.type}|${toMinorUnits(lt.debit)}|${toMinorUnits(lt.credit)}`
      : "";
    if (k && loanTxnKeys.has(k)) breakdown.loanTransactions.skip++;
    else breakdown.loanTransactions.add++;
  }

  for (const ins of data.insurances) {
    if (policyKeys.has(`${ins.name.toLowerCase()}|${ins.policyType}`)) {
      breakdown.insurances.skip++;
    } else {
      breakdown.insurances.add++;
    }
  }

  for (const s of data.snapshots) {
    if (snapshotKeys.has(`${s.date}|${toMinorUnits(s.totalAssets)}`)) {
      breakdown.snapshots.skip++;
    } else {
      breakdown.snapshots.add++;
    }
  }

  for (const g of data.goals) {
    if (goalKeys.has(g.name.toLowerCase())) breakdown.goals.skip++;
    else breakdown.goals.add++;
  }

  for (const a of data.assets) {
    if (assetKeys.has(`${a.assetType}|${a.name.toLowerCase()}`)) {
      breakdown.assets.skip++;
    } else {
      breakdown.assets.add++;
    }
  }

  let toAdd = 0;
  let toUpdate = 0;
  let toSkip = 0;
  for (const b of Object.values(breakdown)) {
    toAdd += b.add;
    toUpdate += b.update;
    toSkip += b.skip;
  }

  return {
    alreadyImported: previousImports.length > 0,
    previousImports,
    counts: {
      toAdd,
      toUpdate,
      toSkip,
      rejected: data.rejected.length,
    },
    breakdown,
  };
}

export function applyParsedImport(
  data: ParsedImportData,
  replaceExisting = false
) {
  let addedCount = 0;
  const updatedCount = 0;
  let skippedCount = 0;

  const tx = sqlite.transaction(() => {
    if (replaceExisting) {
      db.delete(investmentTransactions).run();
      db.delete(investmentHoldings).run();
      db.delete(incomeEntries).run();
      db.delete(rentalPayments).run();
      db.delete(rentalProperties).run();
      db.delete(loanTransactions).run();
      db.delete(loans).run();
      db.delete(insurancePolicies).run();
      db.delete(netWorthSnapshots).run();
      db.delete(financialGoals).run();
      db.delete(assetRegister).run();
    }

    const existingIncomes = new Set(
      db
        .select()
        .from(incomeEntries)
        .all()
        .map(
          (i) =>
            `${i.date}|${i.source.toLowerCase()}|${i.category}|${toMinorUnits(i.inhandAmount)}`
        )
    );
    for (const inc of data.incomes) {
      const k = `${inc.date}|${inc.source.toLowerCase()}|${inc.category}|${toMinorUnits(inc.inhandAmount)}`;
      if (existingIncomes.has(k)) {
        skippedCount++;
        continue;
      }
      existingIncomes.add(k);
      db.insert(incomeEntries)
        .values({
          ...inc,
          grossMinor: toMinorUnits(inc.grossAmount),
          inhandMinor: toMinorUnits(inc.inhandAmount),
          tdsMinor: toMinorUnits(inc.tdsAmount),
        })
        .run();
      addedCount++;
    }

    const holdingIdMap = new Map<string, number>();
    const existingHoldings = db.select().from(investmentHoldings).all();
    const holdingByName = new Map(
      existingHoldings.map((h) => [
        `${h.assetClass}::${h.name.toLowerCase()}`,
        h.id,
      ])
    );
    for (const h of data.holdings) {
      const matchKey = `${h.assetClass}::${h.name.toLowerCase()}`;
      const existingId = holdingByName.get(matchKey);
      if (existingId) {
        holdingIdMap.set(h.key, existingId);
        skippedCount++;
        continue;
      }
      const inserted = db
        .insert(investmentHoldings)
        .values({
          name: h.name,
          assetClass: h.assetClass,
          currency: h.currency,
          schemeCode: h.schemeCode,
          ticker: h.ticker,
          platform: h.platform,
          plannedSip: h.plannedSip,
          targetAmount: h.targetAmount,
          investedAmount: h.investedAmount,
          currentValue: h.currentValue,
          plannedSipMinor: toMinorUnits(h.plannedSip, h.currency),
          targetAmountMinor: toMinorUnits(h.targetAmount, h.currency),
          investedMinor: toMinorUnits(h.investedAmount, h.currency),
          currentValueMinor: toMinorUnits(h.currentValue, h.currency),
          units: h.units,
          avgNav: h.avgNav,
          currentNav: h.currentNav,
          interestRate: h.interestRate,
          startDate: h.startDate,
          maturityDate: h.maturityDate,
          tenureMonths: h.tenureMonths,
          isEmergencyFund: h.isEmergencyFund,
          status: h.status,
          notes: h.notes,
        })
        .returning({ id: investmentHoldings.id })
        .get();
      holdingIdMap.set(h.key, inserted.id);
      holdingByName.set(matchKey, inserted.id);
      addedCount++;
    }

    const affectedHoldingIds = new Set<number>();
    const existingTxns = new Set(
      db
        .select()
        .from(investmentTransactions)
        .all()
        .map(
          (t) =>
            `${t.holdingId}|${t.date}|${t.type}|${toMinorUnits(t.amount, t.currency)}|${t.remarks}`
        )
    );
    for (const t of data.transactions) {
      const hid = holdingIdMap.get(t.holdingKey);
      if (!hid) continue;
      const k = `${hid}|${t.date}|${t.type}|${toMinorUnits(t.amount, t.currency)}|${t.remarks}`;
      if (existingTxns.has(k)) {
        skippedCount++;
        continue;
      }
      existingTxns.add(k);
      db.insert(investmentTransactions)
        .values({
          holdingId: hid,
          date: t.date,
          type: t.type,
          amount: t.amount,
          amountMinor: toMinorUnits(t.amount, t.currency),
          currency: t.currency,
          fxRate: t.fxRate,
          navOrPrice: t.navOrPrice,
          units: t.units,
          employerAmount: t.employerAmount,
          employerMinor: toMinorUnits(t.employerAmount, t.currency),
          remarks: t.remarks,
        })
        .run();
      affectedHoldingIds.add(hid);
      addedCount++;
    }

    // Recompute holding totals from authoritative transaction ledger for every updated holding
    for (const hid of affectedHoldingIds) {
      const h = db
        .select()
        .from(investmentHoldings)
        .where(eq(investmentHoldings.id, hid))
        .get();
      if (!h) continue;
      const hTxns = db
        .select()
        .from(investmentTransactions)
        .where(eq(investmentTransactions.holdingId, hid))
        .all();
      if (hTxns.length === 0) continue;

      const summary = computeHoldingSummaryFromTransactions({
        currency: h.currency,
        existingCurrentNav: h.currentNav,
        transactions: hTxns,
      });
      db.update(investmentHoldings)
        .set({
          units: summary.units,
          investedAmount: summary.investedAmount,
          investedMinor: summary.investedMinor,
          avgNav: summary.avgNav,
          currentNav: summary.currentNav,
          currentValue: summary.currentValue,
          currentValueMinor: summary.currentValueMinor,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(investmentHoldings.id, hid))
        .run();
    }

    const rentalIdMap = new Map<string, number>();
    const rentalByName = new Map(
      db
        .select()
        .from(rentalProperties)
        .all()
        .map((r) => [r.name.toLowerCase(), r.id])
    );
    for (const r of data.rentals) {
      const existingId = rentalByName.get(r.name.toLowerCase());
      if (existingId) {
        rentalIdMap.set(r.key, existingId);
        skippedCount++;
        continue;
      }
      const inserted = db
        .insert(rentalProperties)
        .values({
          name: r.name,
          tenantName: r.tenantName,
          advancePaid: r.advancePaid,
          advancePending: r.advancePending,
          monthlyRent: r.monthlyRent,
          advancePaidMinor: toMinorUnits(r.advancePaid),
          advancePendingMinor: toMinorUnits(r.advancePending),
          monthlyRentMinor: toMinorUnits(r.monthlyRent),
          status: r.status,
          notes: r.notes,
        })
        .returning({ id: rentalProperties.id })
        .get();
      rentalIdMap.set(r.key, inserted.id);
      rentalByName.set(r.name.toLowerCase(), inserted.id);
      addedCount++;
    }

    const existingRentPays = new Set(
      db
        .select()
        .from(rentalPayments)
        .all()
        .map(
          (rp) =>
            `${rp.propertyId}|${rp.billingMonth}|${toMinorUnits(rp.rentAmount)}`
        )
    );
    for (const rp of data.rentPayments) {
      const pid = rentalIdMap.get(rp.rentalKey);
      if (!pid) continue;
      const k = `${pid}|${rp.billingMonth}|${toMinorUnits(rp.rentAmount)}`;
      if (existingRentPays.has(k)) {
        skippedCount++;
        continue;
      }
      existingRentPays.add(k);
      db.insert(rentalPayments)
        .values({
          propertyId: pid,
          billingMonth: rp.billingMonth,
          rentAmount: rp.rentAmount,
          solarCharge: rp.solarCharge,
          deductions: rp.deductions,
          totalAmount: rp.totalAmount,
          rentMinor: toMinorUnits(rp.rentAmount),
          solarMinor: toMinorUnits(rp.solarCharge),
          deductionsMinor: toMinorUnits(rp.deductions),
          totalMinor: toMinorUnits(rp.totalAmount),
          paidDate: rp.paidDate,
          paymentMode: rp.paymentMode,
          notes: rp.notes,
        })
        .run();
      addedCount++;
    }

    const loanIdMap = new Map<string, number>();
    const loanByName = new Map(
      db
        .select()
        .from(loans)
        .all()
        .map((l) => [l.name.toLowerCase(), l.id])
    );
    for (const l of data.loans) {
      const existingId = loanByName.get(l.name.toLowerCase());
      if (existingId) {
        loanIdMap.set(l.key, existingId);
        skippedCount++;
        continue;
      }
      const inserted = db
        .insert(loans)
        .values({
          name: l.name,
          lender: l.lender,
          principalSanctioned: l.principalSanctioned,
          currentBalance: l.currentBalance,
          principalSanctionedMinor: toMinorUnits(l.principalSanctioned),
          currentBalanceMinor: toMinorUnits(l.currentBalance),
          interestRate: l.interestRate,
          emiAmount: l.emiAmount,
          emiMinor: toMinorUnits(l.emiAmount),
          tenureMonths: l.tenureMonths,
          startDate: l.startDate,
          closedDate: l.closedDate,
          status: l.status,
          notes: l.notes,
        })
        .returning({ id: loans.id })
        .get();
      loanIdMap.set(l.key, inserted.id);
      loanByName.set(l.name.toLowerCase(), inserted.id);
      addedCount++;
    }

    const existingLoanTxns = new Set(
      db
        .select()
        .from(loanTransactions)
        .all()
        .map(
          (lt) =>
            `${lt.loanId}|${lt.txnDate}|${lt.type}|${toMinorUnits(lt.debit)}|${toMinorUnits(lt.credit)}`
        )
    );
    for (const lt of data.loanTransactions) {
      const lid = loanIdMap.get(lt.loanKey);
      if (!lid) continue;
      const k = `${lid}|${lt.txnDate}|${lt.type}|${toMinorUnits(lt.debit)}|${toMinorUnits(lt.credit)}`;
      if (existingLoanTxns.has(k)) {
        skippedCount++;
        continue;
      }
      existingLoanTxns.add(k);
      db.insert(loanTransactions)
        .values({
          loanId: lid,
          txnDate: lt.txnDate,
          description: lt.description,
          type: lt.type,
          debit: lt.debit,
          credit: lt.credit,
          balanceAfter: lt.balanceAfter,
          debitMinor: toMinorUnits(lt.debit),
          creditMinor: toMinorUnits(lt.credit),
          balanceAfterMinor: toMinorUnits(lt.balanceAfter),
        })
        .run();
      addedCount++;
    }

    const existingPolicies = new Set(
      db
        .select()
        .from(insurancePolicies)
        .all()
        .map((p) => `${p.name.toLowerCase()}|${p.policyType}`)
    );
    for (const ins of data.insurances) {
      const k = `${ins.name.toLowerCase()}|${ins.policyType}`;
      if (existingPolicies.has(k)) {
        skippedCount++;
        continue;
      }
      existingPolicies.add(k);
      db.insert(insurancePolicies)
        .values({
          ...ins,
          premiumMinor: toMinorUnits(ins.premiumAmount),
        })
        .run();
      addedCount++;
    }

    const existingSnapshots = new Set(
      db
        .select()
        .from(netWorthSnapshots)
        .all()
        .map((s) => `${s.date}|${toMinorUnits(s.totalAssets)}`)
    );
    for (const snap of data.snapshots) {
      const k = `${snap.date}|${toMinorUnits(snap.totalAssets)}`;
      if (existingSnapshots.has(k)) {
        skippedCount++;
        continue;
      }
      existingSnapshots.add(k);
      db.insert(netWorthSnapshots)
        .values({
          date: snap.date,
          totalAssets: snap.totalAssets,
          totalLiabilities: snap.totalLiabilities,
          netWorth: snap.netWorth ?? snap.totalAssets,
          totalAssetsMinor: toMinorUnits(snap.totalAssets),
          totalLiabilitiesMinor:
            snap.totalLiabilities !== null
              ? toMinorUnits(snap.totalLiabilities)
              : null,
          liabilitiesKnown: snap.liabilitiesKnown,
          netWorthMinor:
            snap.netWorth !== null ? toMinorUnits(snap.netWorth) : null,
          source: snap.source,
          notes: snap.notes,
        })
        .run();
      addedCount++;
    }

    const existingGoals = new Set(
      db
        .select()
        .from(financialGoals)
        .all()
        .map((g) => g.name.toLowerCase())
    );
    for (const goal of data.goals) {
      if (existingGoals.has(goal.name.toLowerCase())) {
        skippedCount++;
        continue;
      }
      existingGoals.add(goal.name.toLowerCase());
      db.insert(financialGoals)
        .values({
          ...goal,
          targetMinor: toMinorUnits(goal.targetAmount),
          currentMinor: toMinorUnits(goal.currentAmount),
        })
        .run();
      addedCount++;
    }

    const existingAssets = new Set(
      db
        .select()
        .from(assetRegister)
        .all()
        .map((a) => `${a.assetType}|${a.name.toLowerCase()}`)
    );
    for (const asset of data.assets) {
      const k = `${asset.assetType}|${asset.name.toLowerCase()}`;
      if (existingAssets.has(k)) {
        skippedCount++;
        continue;
      }
      existingAssets.add(k);
      db.insert(assetRegister)
        .values({
          ...asset,
          currentValueMinor: toMinorUnits(asset.currentValue, asset.currency),
        })
        .run();
      addedCount++;
    }

    db.insert(importHistory)
      .values({
        fileName: data.fileName,
        fileSha256: data.fileSha256,
        mode: replaceExisting ? "replace" : "merge",
        status: "applied",
        addedCount,
        updatedCount,
        skippedCount,
        rejectedCount: data.rejected.length,
        summaryJson: JSON.stringify(data.summary),
      })
      .run();
  });

  tx();

  return {
    addedCount,
    updatedCount,
    skippedCount,
    rejectedCount: data.rejected.length,
  };
}
