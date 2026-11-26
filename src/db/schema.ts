import {
  sqliteTable,
  text,
  integer,
  real,
} from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const incomeEntries = sqliteTable("income_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull(), // YYYY-MM
  date: text("date").notNull(), // YYYY-MM-DD
  source: text("source").notNull(), // e.g. "Salary", "Shop 1 Rent", "Bonus"
  category: text("category").notNull().default("salary"), // salary | rental | dividend | other
  grossAmount: real("gross_amount").notNull().default(0),
  inhandAmount: real("inhand_amount").notNull().default(0),
  tdsAmount: real("tds_amount").notNull().default(0),
  account: text("account").default("ICICI"),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const investmentHoldings = sqliteTable("investment_holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull(), // mutual_fund | etf_us | etf_in | stock | esop | ppf | nps | fd | rd | chit | gold_silver | bond
  currency: text("currency").notNull().default("INR"), // INR | USD
  schemeCode: text("scheme_code").default(""), // AMFI code for Indian MF
  ticker: text("ticker").default(""), // Yahoo Finance ticker (e.g. VOO, QQQ, GOLDBEES.NS)
  platform: text("platform").default(""), // Groww, INDmoney, Stable Money, Zerodha, etc.
  plannedSip: real("planned_sip").notNull().default(0),
  targetAmount: real("target_amount").notNull().default(0),
  investedAmount: real("invested_amount").notNull().default(0), // In holding currency
  currentValue: real("current_value").notNull().default(0), // In holding currency
  units: real("units").notNull().default(0),
  avgNav: real("avg_nav").notNull().default(0),
  currentNav: real("current_nav").notNull().default(0),
  interestRate: real("interest_rate").notNull().default(0), // e.g., 8.75 for FD/RD
  startDate: text("start_date").default(""),
  maturityDate: text("maturity_date").default(""),
  tenureMonths: integer("tenure_months").notNull().default(0),
  isEmergencyFund: integer("is_emergency_fund", { mode: "boolean" })
    .notNull()
    .default(false),
  status: text("status").notNull().default("active"), // active | matured | closed
  notes: text("notes").default(""),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const investmentTransactions = sqliteTable("investment_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id")
    .notNull()
    .references(() => investmentHoldings.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // YYYY-MM-DD
  type: text("type").notNull().default("sip"), // sip | buy | sell | installment | employer_contribution | interest | dividend
  amount: real("amount").notNull(), // In holding currency
  currency: text("currency").notNull().default("INR"),
  fxRate: real("fx_rate").notNull().default(1), // INR per 1 unit of currency
  navOrPrice: real("nav_or_price").notNull().default(0),
  units: real("units").notNull().default(0),
  employerAmount: real("employer_amount").notNull().default(0),
  remarks: text("remarks").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const rentalProperties = sqliteTable("rental_properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // Shop 1, Shop 2
  tenantName: text("tenant_name").default(""),
  advancePaid: real("advance_paid").notNull().default(0),
  advancePending: real("advance_pending").notNull().default(0),
  monthlyRent: real("monthly_rent").notNull().default(0),
  status: text("status").notNull().default("occupied"), // occupied | vacant
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const rentalPayments = sqliteTable("rental_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  propertyId: integer("property_id")
    .notNull()
    .references(() => rentalProperties.id, { onDelete: "cascade" }),
  billingMonth: text("billing_month").notNull(), // YYYY-MM
  rentAmount: real("rent_amount").notNull().default(0),
  solarCharge: real("solar_charge").notNull().default(0),
  deductions: real("deductions").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  paidDate: text("paid_date").default(""),
  paymentMode: text("payment_mode").default("UPI"),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const loans = sqliteTable("loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  lender: text("lender").default(""),
  principalSanctioned: real("principal_sanctioned").notNull().default(0),
  currentBalance: real("current_balance").notNull().default(0),
  interestRate: real("interest_rate").notNull().default(0),
  emiAmount: real("emi_amount").notNull().default(0),
  tenureMonths: integer("tenure_months").notNull().default(0),
  startDate: text("start_date").default(""),
  closedDate: text("closed_date").default(""),
  status: text("status").notNull().default("active"), // active | closed
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const loanTransactions = sqliteTable("loan_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loanId: integer("loan_id")
    .notNull()
    .references(() => loans.id, { onDelete: "cascade" }),
  txnDate: text("txn_date").notNull(),
  description: text("description").default(""),
  type: text("type").notNull().default("emi"), // emi | prepayment | interest | charge | disbursement
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
  balanceAfter: real("balance_after").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const insurancePolicies = sqliteTable("insurance_policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  policyType: text("policy_type").notNull().default("term"), // term | health | life_endowment
  provider: text("provider").default(""),
  premiumAmount: real("premium_amount").notNull().default(0),
  premiumFrequency: text("premium_frequency").notNull().default("annual"), // annual | monthly
  coverAmount: text("cover_amount").default(""), // e.g. "1 Cr" or "Unlimited"
  startDate: text("start_date").default(""),
  expiryDate: text("expiry_date").default(""),
  maturityDate: text("maturity_date").default(""),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const netWorthSnapshots = sqliteTable("net_worth_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  totalAssets: real("total_assets").notNull().default(0),
  totalLiabilities: real("total_liabilities").notNull().default(0),
  netWorth: real("net_worth").notNull().default(0),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const financialGoals = sqliteTable("financial_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull().default("wealth"), // emergency | property | vehicle | retirement | wealth
  targetAmount: real("target_amount").notNull().default(0),
  currentAmount: real("current_amount").notNull().default(0),
  targetDate: text("target_date").default(""),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const investmentCategories = sqliteTable("investment_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  color: text("color").notNull().default("#6366f1"),
  supportsSip: integer("supports_sip", { mode: "boolean" })
    .notNull()
    .default(true),
  isSystem: integer("is_system", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull().default("insurance"), // insurance | loan | investment | general
  entityId: integer("entity_id").notNull().default(0),
  title: text("title").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  filePath: text("file_path").notNull(), // filename inside DOCS_DIR
  aiSummary: text("ai_summary").default(""),
  uploadedAt: text("uploaded_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
