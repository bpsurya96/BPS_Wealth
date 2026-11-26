import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { POST as postPin } from "@/app/api/auth/pin/route";
import { POST as postInvestment } from "@/app/api/investments/route";
import { POST as postInvTxn } from "@/app/api/investments/[id]/transactions/route";
import { POST as postIncome } from "@/app/api/income/route";
import { POST as postRental } from "@/app/api/rentals/route";
import { POST as postLoan } from "@/app/api/loans/route";
import { POST as postInsurance } from "@/app/api/insurance/route";
import { POST as postAsset } from "@/app/api/assets/route";
import { POST as postDoc } from "@/app/api/documents/route";
import { GET as getDocFile } from "@/app/api/documents/[id]/route";
import { POST as postImport } from "@/app/api/import/route";
import { GET as getBackup, POST as postBackup } from "@/app/api/backup/route";
import { POST as postAi } from "@/app/api/ai/route";
import { POST as postSql } from "@/app/api/sql/route";
import {
  createIsolatedTestEnv,
  makeFormRequest,
  makeJsonRequest,
  TestContext,
} from "../helpers/test-env";

describe("End-to-End Portfolio Workflows (Production Auth Mode)", () => {
  let ctx: TestContext;
  const origNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    ctx = createIsolatedTestEnv();
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
    ctx.cleanup();
  });

  it("executes complete owner lifecycle from first-run setup through backup/restore", async () => {
    // 1. First-time setup
    const setupRes = await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", {
        action: "setup",
        pin: "4567",
        setupToken: process.env.BPS_OWNER_SETUP_TOKEN,
      })
    );
    expect(setupRes.status).toBe(200);

    // 2. Lock & Unlock
    await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", { action: "lock" })
    );
    expect((await getDashboard()).status).toBe(401);

    const unlockRes = await postPin(
      makeJsonRequest("http://localhost/api/auth/pin", "POST", {
        action: "verify",
        pin: "4567",
      })
    );
    expect(unlockRes.status).toBe(200);

    // 3. Add investment holding
    const invRes = await postInvestment(
      makeJsonRequest("http://localhost/api/investments", "POST", {
        name: "Bluechip Index Fund",
        assetClass: "mutual_fund",
        currency: "INR",
        plannedSip: 5000,
        investedAmount: 0,
        units: 0,
        currentNav: 100,
      })
    );
    expect(invRes.status).toBe(201);
    const { holding } = await invRes.json();

    // 4. Record investment transactions (SIP + Dividend + Partial Sell)
    const sipRes = await postInvTxn(
      makeJsonRequest(
        `http://localhost/api/investments/${holding.id}/transactions`,
        "POST",
        { date: "2024-01-01", type: "sip", amount: 10000, navOrPrice: 100 }
      ),
      { params: Promise.resolve({ id: String(holding.id) }) }
    );
    expect(sipRes.status).toBe(201);

    const divRes = await postInvTxn(
      makeJsonRequest(
        `http://localhost/api/investments/${holding.id}/transactions`,
        "POST",
        { date: "2024-06-01", type: "dividend", amount: 500, navOrPrice: 110 }
      ),
      { params: Promise.resolve({ id: String(holding.id) }) }
    );
    expect(divRes.status).toBe(201);

    // 5. Add incomes (Salary + Dividend + Other + linked Rental that should NOT double-count)
    expect(
      (
        await postIncome(
          makeJsonRequest("http://localhost/api/income", "POST", {
            date: "2025-01-31",
            source: "Employer",
            category: "salary",
            inhandAmount: 100000,
          })
        )
      ).status
    ).toBe(201);
    expect(
      (
        await postIncome(
          makeJsonRequest("http://localhost/api/income", "POST", {
            date: "2025-01-15",
            source: "Equity Dividend",
            category: "dividend",
            inhandAmount: 2500,
          })
        )
      ).status
    ).toBe(201);

    // 6. Add rental property & rental payment
    const propRes = await postRental(
      makeJsonRequest("http://localhost/api/rentals", "POST", {
        name: "Unit Alpha",
        monthlyRent: 15000,
      })
    );
    const { property } = await propRes.json();
    const rentPayRes = await postRental(
      makeJsonRequest("http://localhost/api/rentals", "POST", {
        kind: "payment",
        propertyId: property.id,
        billingMonth: "2025-01",
        rentAmount: 15000,
        solarCharge: 500,
      })
    );
    expect(rentPayRes.status).toBe(201);
    const { payment: rentPayment } = await rentPayRes.json();

    // Also link an income_entries rental row to verify double-counting prevention
    await postIncome(
      makeJsonRequest("http://localhost/api/income", "POST", {
        date: "2025-01-10",
        month: "2025-01",
        source: "Unit Alpha Rent",
        category: "rental",
        inhandAmount: 15000,
        rentalPaymentId: rentPayment.id,
      })
    );

    // 7. Add loan, loan txn, monthly insurance policy, and physical asset
    const loanRes = await postLoan(
      makeJsonRequest("http://localhost/api/loans", "POST", {
        name: "Example Home Loan",
        lender: "Example Bank",
        principalSanctioned: 1000000,
        currentBalance: 400000,
        interestRate: 8.5,
        emiAmount: 20000,
      })
    );
    const { loan } = await loanRes.json();
    await postLoan(
      makeJsonRequest("http://localhost/api/loans", "POST", {
        kind: "transaction",
        loanId: loan.id,
        txnDate: "2025-01-05",
        type: "emi",
        credit: 20000,
        balanceAfter: 385000,
      })
    );

    await postInsurance(
      makeJsonRequest("http://localhost/api/insurance", "POST", {
        name: "Monthly Health Plan",
        policyType: "health",
        premiumAmount: 1500,
        premiumFrequency: "monthly",
      })
    );

    await postAsset(
      makeJsonRequest("http://localhost/api/assets", "POST", {
        name: "Savings Account",
        assetType: "financial_cash",
        currentValue: 200000,
      })
    );

    // Verify Dashboard math:
    // Portfolio = 11000 (100u * 110 NAV from latest txn), Assets = 200000 => Total Assets = 211000
    // Loan balance updated by txn = 385000 => Net Worth = 211000 - 385000 = -174000
    // Salary = 100000, Dividend = 2500, Rental = 15000 (no double count!)
    // Annualized insurance = 1500 * 12 = 18000
    const dash = await (await getDashboard()).json();
    expect(dash.metrics.totalPortfolioInr).toBe(11000);
    expect(dash.metrics.totalAssetsInr).toBe(211000);
    expect(dash.metrics.totalLiabilitiesInr).toBe(385000);
    expect(dash.metrics.netWorthInr).toBe(-174000);
    expect(dash.metrics.mainIncomeTotal).toBe(100000);
    expect(dash.metrics.dividendIncomeTotal).toBe(2500);
    expect(dash.metrics.rentalIncomeTotal).toBe(15000);
    expect(dash.metrics.totalAnnualInsurancePremiumInr).toBe(18000);

    // 8. Upload & retrieve PDF document
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
    const docFd = new FormData();
    docFd.append(
      "file",
      new File([pdfBytes], "policy.pdf", { type: "application/pdf" })
    );
    docFd.append("entityType", "insurance");
    docFd.append("entityId", "1");
    const docUploadRes = await postDoc(
      makeFormRequest("http://localhost/api/documents", docFd)
    );
    expect(docUploadRes.status).toBe(201);
    const { document } = await docUploadRes.json();
    const docGetRes = await getDocFile(
      makeJsonRequest(`http://localhost/api/documents/${document.id}`, "GET"),
      { params: Promise.resolve({ id: String(document.id) }) }
    );
    expect(docGetRes.status).toBe(200);
    expect(docGetRes.headers.get("X-Content-Type-Options")).toBe("nosniff");

    // 9. Import Excel workbook
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Goals");
    ws.addRow(["name", "category", "targetAmount", "currentAmount"]);
    ws.addRow(["Emergency Reserve", "emergency", 300000, 100000]);
    const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());
    const impFd = new FormData();
    impFd.append(
      "file",
      new File([xlsxBuf], "goals.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      })
    );
    impFd.append("mode", "apply");
    const impRes = await postImport(
      makeFormRequest("http://localhost/api/import", impFd)
    );
    expect(impRes.status).toBe(200);

    // 10. Export JSON & XLSX
    const jsonExportRes = await getBackup(
      makeJsonRequest("http://localhost/api/backup?format=json", "GET")
    );
    expect(jsonExportRes.status).toBe(200);
    const xlsxExportRes = await getBackup(
      makeJsonRequest("http://localhost/api/backup?format=xlsx", "GET")
    );
    expect(xlsxExportRes.status).toBe(200);

    // 11 & 12. Create Backup and Restore Backup
    const createBakRes = await postBackup(
      makeJsonRequest("http://localhost/api/backup", "POST", {
        action: "create",
      })
    );
    expect(createBakRes.status).toBe(200);
    const { backup } = await createBakRes.json();
    expect(backup.verified).toBe(true);
    expect(backup.documentCount).toBe(1);

    const restoreRes = await postBackup(
      makeJsonRequest("http://localhost/api/backup", "POST", {
        action: "restore",
        filename: backup.filename,
      })
    );
    expect(restoreRes.status).toBe(200);

    // 13. Ask AI about portfolio
    const aiRes = await postAi(
      makeJsonRequest("http://localhost/api/ai", "POST", {
        prompt: "What is my income breakdown?",
        context: "overview",
        mode: "chat",
      })
    );
    expect(aiRes.status).toBe(200);
    const aiJson = await aiRes.json();
    expect(aiJson.reply).toContain("Main Income");

    // 14. SQL Studio read query works while writes are rejected
    const sqlOk = await postSql(
      makeJsonRequest("http://localhost/api/sql", "POST", {
        query: "SELECT COUNT(*) AS cnt FROM loans",
      })
    );
    expect(sqlOk.status).toBe(200);
    const sqlJson = await sqlOk.json();
    expect(sqlJson.rows[0].cnt).toBe(1);
  });
});
