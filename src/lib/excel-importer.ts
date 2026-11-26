import * as XLSX from "xlsx";
import { db, sqlite } from "@/db";
import {
  financialGoals,
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
import { guessSchemeOrTicker } from "./market-data";

export interface ParsedImportData {
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
    totalLiabilities: number;
    netWorth: number;
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
}

function cleanNum(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val !== "string") return 0;
  const s = val.replace(/[₹$,\s]/g, "").trim();
  if (!s || s === "NaN" || s === "-") return 0;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(val: unknown): string {
  if (typeof val === "number" && val > 25000 && val < 70000) {
    // Excel serial date
    const utcDays = Math.floor(val - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof val !== "string") return "";
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return "";
}

function cellStr(row: unknown[], col: number): string {
  const v = row[col];
  return v == null ? "" : String(v).trim();
}

export function parseWorkbookBuffer(buffer: Buffer): ParsedImportData {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const allRows: unknown[][] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    allRows.push(...rows);
  }

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

  const seenIncomeMonths = new Set<string>();

  for (let r = 0; r < allRows.length; r++) {
    const row = allRows[r];
    if (!row || row.length === 0) continue;

    // 1. Income rows (Spends header followed by Income row)
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
                account: "ICICI",
                notes: "Imported from monthly sheet",
              });
            }
          }
        }
      }
    }

    // 2. Mutual Fund & US ETF Summary Table ("Mutual Fund" header at col 5)
    if (
      cellStr(row, 5) === "Mutual Fund" &&
      cellStr(row, 6) === "Total Invested"
    ) {
      for (let k = r + 1; k < Math.min(r + 20, allRows.length); k++) {
        const sub = allRows[k];
        const name = cellStr(sub, 5);
        if (!name || name === "ETF" || name === "GoldBees") continue;
        const totalInvested = cleanNum(sub[6]);
        if (totalInvested <= 0) continue;
        const sip = cleanNum(sub[8]);
        const units = cleanNum(sub[10]);
        const avgNav = cleanNum(sub[11]);
        const isUsEtf = /vanguard|invesco|qqq/i.test(name);
        const guessed = guessSchemeOrTicker(name);
        const key = `mf_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        holdingsMap.set(key, {
          key,
          name,
          assetClass: isUsEtf ? "etf_us" : "mutual_fund",
          currency: isUsEtf ? "USD" : "INR",
          schemeCode: guessed.schemeCode,
          ticker: guessed.ticker,
          platform: isUsEtf ? "INDmoney" : "Groww / Direct",
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

    // 3. Horizontal MF / ETF Transaction Blocks (row with "Date", "Days", "Amount", "NAV", "units")
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
    if (dateCols.length > 0 && r >= 2) {
      const titleRow = allRows[r - 2];
      for (const col of dateCols) {
        const blockTitle = cellStr(titleRow, col) || cellStr(titleRow, col - 1);
        if (!blockTitle) continue;

        // Match existing holding from summary or create one
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
            platform: isUsEtf ? "INDmoney" : "Groww / Direct",
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
          // Stop if we hit next major section
          if (cellStr(txRow, 1) === "Shop" || cellStr(txRow, 2) === "Txn Date") break;
          const d = normalizeDate(txRow[col]);
          const amt = cleanNum(txRow[col + 2]);
          const nav = cleanNum(txRow[col + 3]);
          const units = cleanNum(txRow[col + 4]);
          if (d && amt > 0) {
            transactions.push({
              holdingKey: matchedKey,
              date: d,
              type: "sip",
              amount: amt,
              currency: holding.currency,
              fxRate: holding.currency === "USD" ? 84.5 : 1,
              navOrPrice: nav,
              units,
              employerAmount: 0,
              remarks: "Imported from Excel ledger",
            });
          }
        }
      }
    }

    // 4. Portfolio Summary block (PPF, Stocks, Chit, NPS, Tiger ESOP)
    const c2 = cellStr(row, 2);
    if (
      /^PPF/i.test(c2) ||
      c2 === "Stocks" ||
      c2 === "Chit" ||
      /^NPS/i.test(c2) ||
      c2 === "Tiger ESOP"
    ) {
      const val = cleanNum(row[3]);
      if (val > 0) {
        const assetClass = /^PPF/i.test(c2)
          ? "ppf"
          : c2 === "Stocks"
          ? "stock"
          : c2 === "Chit"
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
            platform: assetClass === "esop" ? "Tiger Analytics" : "",
            plannedSip:
              assetClass === "ppf"
                ? 3600
                : assetClass === "nps"
                ? 13576
                : assetClass === "chit"
                ? 20000
                : 0,
            targetAmount: assetClass === "chit" ? 420000 : 0,
            investedAmount: val,
            currentValue: val,
            units: 0,
            avgNav: 0,
            currentNav: 0,
            interestRate: assetClass === "ppf" ? 7.1 : 0,
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

    // 5. FD & RD Emergency Fund rows
    const c1 = cellStr(row, 1);
    if (/^FD_\d+$/i.test(c1) && cleanNum(row[2]) > 0) {
      const amt = cleanNum(row[2]);
      const platform = cellStr(row, 3);
      const maturityDate = normalizeDate(row[4]);
      const rate = cleanNum(row[6]) * (cleanNum(row[6]) < 1 ? 100 : 1);
      const key = `fd_${c1.toLowerCase()}`;
      holdingsMap.set(key, {
        key,
        name: `${c1} (${platform || "FD"})`,
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
        notes: "Emergency Fund FD",
      });
    }
    if (/^RD_\d+$/i.test(c1) && cleanNum(row[2]) > 0) {
      const amt = cleanNum(row[2]);
      const platform = cellStr(row, 3);
      const sip = cleanNum(row[6]);
      const rate = cleanNum(row[7]) * (cleanNum(row[7]) < 1 ? 100 : 1);
      const key = `rd_${c1.toLowerCase()}`;
      holdingsMap.set(key, {
        key,
        name: `${c1} (${platform || "RD"})`,
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
        tenureMonths: 60,
        isEmergencyFund: true,
        status: "active",
        notes: `${cellStr(row, 4)} | ${cellStr(row, 5)} installments`,
      });
    }

    // 6. NPS Contribution Log (Sr. No. at col 7)
    if (
      cellStr(row, 7) === "Sr. No." &&
      cellStr(row, 8) === "Date" &&
      cellStr(row, 9).includes("Particulars")
    ) {
      const npsKey = "summary_nps";
      if (!holdingsMap.has(npsKey)) {
        holdingsMap.set(npsKey, {
          key: npsKey,
          name: "NPS",
          assetClass: "nps",
          currency: "INR",
          schemeCode: "",
          ticker: "",
          platform: "NSDL / Protean",
          plannedSip: 13566,
          targetAmount: 0,
          investedAmount: 304299.3,
          currentValue: 304299.3,
          units: 0,
          avgNav: 0,
          currentNav: 0,
          interestRate: 0,
          startDate: "",
          maturityDate: "",
          tenureMonths: 0,
          isEmergencyFund: false,
          status: "active",
          notes: "Imported NPS ledger",
        });
      }
      for (let k = r + 1; k < Math.min(r + 50, allRows.length); k++) {
        const nRow = allRows[k];
        const d = normalizeDate(nRow[8]);
        const selfAmt = cleanNum(nRow[10]);
        const empAmt = cleanNum(nRow[11]);
        const total = cleanNum(nRow[12]);
        if (d && total > 0) {
          transactions.push({
            holdingKey: npsKey,
            date: d,
            type: empAmt > 0 ? "employer_contribution" : "buy",
            amount: total,
            currency: "INR",
            fxRate: 1,
            navOrPrice: 0,
            units: 0,
            employerAmount: empAmt,
            remarks: `${cellStr(nRow, 9)} (Self: ${selfAmt}, Emp: ${empAmt})`,
          });
        }
      }
    }

    // 7. Shop 1 & Shop 2 Rental Sections
    if (cellStr(row, 1) === "Shop" && cellStr(row, 5) === "Shop") {
      rentals.push(
        {
          key: "shop_1",
          name: "Shop 1",
          tenantName: "Tenant 1",
          advancePaid: 400000,
          advancePending: 0,
          monthlyRent: 24000,
          status: "occupied",
          notes: "Advance 4L",
        },
        {
          key: "shop_2",
          name: "Shop 2",
          tenantName: "Tenant 2",
          advancePaid: 200000,
          advancePending: 100000,
          monthlyRent: 21000,
          status: "occupied",
          notes: "Advance 2L, Pending 1L",
        }
      );

      for (let k = r + 4; k < Math.min(r + 25, allRows.length); k++) {
        const sRow = allRows[k];
        // Shop 1 (cols 1..3)
        const s1Date = normalizeDate(sRow[1]);
        const s1Rent = cleanNum(sRow[2]);
        if (s1Date && s1Rent > 0) {
          rentPayments.push({
            rentalKey: "shop_1",
            billingMonth: s1Date.slice(0, 7),
            rentAmount: s1Rent,
            solarCharge: 0,
            deductions: 0,
            totalAmount: s1Rent,
            paidDate: cellStr(sRow, 3),
            paymentMode: "UPI",
            notes: "",
          });
        }
        // Shop 2 (cols 6..11)
        const s2Date = normalizeDate(sRow[6]);
        const s2Solar = cleanNum(sRow[7]);
        const s2Rent = cleanNum(sRow[8]);
        const s2Total = cleanNum(sRow[9]);
        if (s2Date && s2Rent > 0) {
          rentPayments.push({
            rentalKey: "shop_2",
            billingMonth: s2Date.slice(0, 7),
            rentAmount: s2Rent,
            solarCharge: s2Solar,
            deductions: 0,
            totalAmount: s2Total || s2Rent + s2Solar,
            paidDate: cellStr(sRow, 10),
            paymentMode: cellStr(sRow, 11).toLowerCase().includes("cash")
              ? "Cash"
              : "UPI",
            notes: cellStr(sRow, 11),
          });
        }
      }
    }

    // 8. SBI Home Loan Statement Ledger
    if (cellStr(row, 2) === "Txn Date" && cellStr(row, 4) === "Description") {
      const loanKey = "sbi_home_loan";
      loansList.push({
        key: loanKey,
        name: "SBI Home Loan",
        lender: "State Bank of India",
        principalSanctioned: 2659776,
        currentBalance: 0,
        interestRate: 8.8,
        emiAmount: 31000,
        tenureMonths: 64,
        startDate: "2021-08-06",
        closedDate: "2026-11-07",
        status: "closed",
        notes: "Closed via prepayments; total interest ₹7,90,735",
      });
      for (let k = r + 1; k < allRows.length; k++) {
        const lRow = allRows[k];
        const d = normalizeDate(lRow[2]);
        if (!d) {
          if (k > r + 5 && cellStr(lRow, 2) === "" && cellStr(lRow, 4) === "")
            break;
          continue;
        }
        const desc = cellStr(lRow, 4);
        const debit = cleanNum(lRow[5]);
        const credit = cleanNum(lRow[6]);
        const bal = cleanNum(lRow[7]);
        const type = /prepay/i.test(desc)
          ? "prepayment"
          : /inter/i.test(desc)
          ? "interest"
          : debit > 0
          ? "disbursement"
          : "emi";
        loanTransactions.push({
          loanKey,
          txnDate: d,
          description: desc,
          type,
          debit,
          credit,
          balanceAfter: Math.abs(bal),
        });
      }
    }

    // 9. Insurance Rows
    const normC1 = normalizeDate(row[1]);
    if (
      c1 === "Upto Age 69" ||
      c1 === "Upto Age 39 and Mature at 42" ||
      normC1
    ) {
      const name = cellStr(row, 2);
      if (name.includes("Insurance")) {
        const premium = cleanNum(row[3]);
        const policyType = /Term/i.test(name)
          ? "term"
          : /Health/i.test(name)
          ? "health"
          : "life_endowment";
        insurances.push({
          name,
          policyType,
          provider: policyType === "life_endowment" ? "Bajaj Allianz" : "",
          premiumAmount: premium,
          premiumFrequency: "annual",
          coverAmount: cellStr(row, 3) === "Unlimited Cover" ? "Unlimited" : "",
          startDate: "",
          expiryDate: normC1 || "",
          maturityDate: normC1 || c1,
          status: "active",
          notes: `${cellStr(row, 4)} ${cellStr(row, 5)}`.trim(),
        });
      }
    }

    // 10. Net Worth Timeline (2017-05-01 .. 2025-01-01)
    const snapDate = normalizeDate(row[7]);
    if (snapDate && cleanNum(row[8]) >= 100000) {
      const val = cleanNum(row[8]);
      snapshots.push({
        date: snapDate,
        totalAssets: val,
        totalLiabilities: 0,
        netWorth: val,
        notes: "Historical Net Worth Milestone",
      });
    }
  }

  // Add key financial goals detected from Excel
  const fdTotal = Array.from(holdingsMap.values())
    .filter((h) => h.assetClass === "fd" || h.assetClass === "rd")
    .reduce((acc, h) => acc + h.currentValue, 0);

  goals.push(
    {
      name: "Emergency Fund (FD/RD)",
      category: "emergency",
      targetAmount: 600000,
      currentAmount: fdTotal,
      targetDate: "2027-06-01",
      notes: "6L Emergency Fund target",
    },
    {
      name: "Chennai 3BHK Flat",
      category: "property",
      targetAmount: 15000000,
      currentAmount: 0,
      targetDate: "",
      notes: "Medavakkam / Keelkattalai (avoid water-logging zones)",
    },
    {
      name: "Car",
      category: "vehicle",
      targetAmount: 700000,
      currentAmount: 0,
      targetDate: "2027-01-08",
      notes: "6L - 7L target",
    }
  );

  return {
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
  };
}

export function applyParsedImport(
  data: ParsedImportData,
  replaceExisting = false
) {
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
    }

    for (const inc of data.incomes) {
      db.insert(incomeEntries).values(inc).run();
    }

    const holdingIdMap = new Map<string, number>();
    for (const h of data.holdings) {
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
    }

    for (const t of data.transactions) {
      const hid = holdingIdMap.get(t.holdingKey);
      if (!hid) continue;
      db.insert(investmentTransactions)
        .values({
          holdingId: hid,
          date: t.date,
          type: t.type,
          amount: t.amount,
          currency: t.currency,
          fxRate: t.fxRate,
          navOrPrice: t.navOrPrice,
          units: t.units,
          employerAmount: t.employerAmount,
          remarks: t.remarks,
        })
        .run();
    }

    const rentalIdMap = new Map<string, number>();
    for (const r of data.rentals) {
      const inserted = db
        .insert(rentalProperties)
        .values({
          name: r.name,
          tenantName: r.tenantName,
          advancePaid: r.advancePaid,
          advancePending: r.advancePending,
          monthlyRent: r.monthlyRent,
          status: r.status,
          notes: r.notes,
        })
        .returning({ id: rentalProperties.id })
        .get();
      rentalIdMap.set(r.key, inserted.id);
    }

    for (const rp of data.rentPayments) {
      const pid = rentalIdMap.get(rp.rentalKey);
      if (!pid) continue;
      db.insert(rentalPayments)
        .values({
          propertyId: pid,
          billingMonth: rp.billingMonth,
          rentAmount: rp.rentAmount,
          solarCharge: rp.solarCharge,
          deductions: rp.deductions,
          totalAmount: rp.totalAmount,
          paidDate: rp.paidDate,
          paymentMode: rp.paymentMode,
          notes: rp.notes,
        })
        .run();
    }

    const loanIdMap = new Map<string, number>();
    for (const l of data.loans) {
      const inserted = db
        .insert(loans)
        .values({
          name: l.name,
          lender: l.lender,
          principalSanctioned: l.principalSanctioned,
          currentBalance: l.currentBalance,
          interestRate: l.interestRate,
          emiAmount: l.emiAmount,
          tenureMonths: l.tenureMonths,
          startDate: l.startDate,
          closedDate: l.closedDate,
          status: l.status,
          notes: l.notes,
        })
        .returning({ id: loans.id })
        .get();
      loanIdMap.set(l.key, inserted.id);
    }

    for (const lt of data.loanTransactions) {
      const lid = loanIdMap.get(lt.loanKey);
      if (!lid) continue;
      db.insert(loanTransactions)
        .values({
          loanId: lid,
          txnDate: lt.txnDate,
          description: lt.description,
          type: lt.type,
          debit: lt.debit,
          credit: lt.credit,
          balanceAfter: lt.balanceAfter,
        })
        .run();
    }

    for (const ins of data.insurances) {
      db.insert(insurancePolicies).values(ins).run();
    }

    for (const snap of data.snapshots) {
      db.insert(netWorthSnapshots).values(snap).run();
    }

    for (const goal of data.goals) {
      db.insert(financialGoals).values(goal).run();
    }
  });

  tx();
}
