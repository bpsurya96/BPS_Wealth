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

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  role: text("role").notNull().default("owner"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastSeenAt: text("last_seen_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: text("locked_until").default(""),
  lastAttemptAt: text("last_attempt_at").notNull(),
});

export const incomeEntries = sqliteTable("income_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull(), // YYYY-MM
  date: text("date").notNull(), // YYYY-MM-DD
  source: text("source").notNull(),
  category: text("category").notNull().default("salary"), // salary | rental | dividend | other
  grossAmount: real("gross_amount").notNull().default(0),
  inhandAmount: real("inhand_amount").notNull().default(0),
  tdsAmount: real("tds_amount").notNull().default(0),
  grossMinor: integer("gross_minor").notNull().default(0),
  inhandMinor: integer("inhand_minor").notNull().default(0),
  tdsMinor: integer("tds_minor").notNull().default(0),
  rentalPaymentId: integer("rental_payment_id"),
  account: text("account").default("Bank"),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const investmentHoldings = sqliteTable("investment_holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull(),
  currency: text("currency").notNull().default("INR"), // INR | USD
  schemeCode: text("scheme_code").default(""),
  ticker: text("ticker").default(""),
  platform: text("platform").default(""),
  plannedSip: real("planned_sip").notNull().default(0),
  targetAmount: real("target_amount").notNull().default(0),
  investedAmount: real("invested_amount").notNull().default(0),
  currentValue: real("current_value").notNull().default(0),
  plannedSipMinor: integer("planned_sip_minor").notNull().default(0),
  targetAmountMinor: integer("target_amount_minor").notNull().default(0),
  investedMinor: integer("invested_minor").notNull().default(0),
  currentValueMinor: integer("current_value_minor").notNull().default(0),
  units: real("units").notNull().default(0),
  avgNav: real("avg_nav").notNull().default(0),
  currentNav: real("current_nav").notNull().default(0),
  interestRate: real("interest_rate").notNull().default(0),
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
  date: text("date").notNull(),
  type: text("type").notNull().default("sip"), // sip | buy | sell | installment | employer_contribution | interest | interest_payout | dividend
  amount: real("amount").notNull(),
  amountMinor: integer("amount_minor").notNull().default(0),
  currency: text("currency").notNull().default("INR"),
  fxRate: real("fx_rate").notNull().default(1),
  navOrPrice: real("nav_or_price").notNull().default(0),
  units: real("units").notNull().default(0),
  employerAmount: real("employer_amount").notNull().default(0),
  employerMinor: integer("employer_minor").notNull().default(0),
  remarks: text("remarks").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const rentalProperties = sqliteTable("rental_properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  tenantName: text("tenant_name").default(""),
  advancePaid: real("advance_paid").notNull().default(0),
  advancePending: real("advance_pending").notNull().default(0),
  monthlyRent: real("monthly_rent").notNull().default(0),
  advancePaidMinor: integer("advance_paid_minor").notNull().default(0),
  advancePendingMinor: integer("advance_pending_minor").notNull().default(0),
  monthlyRentMinor: integer("monthly_rent_minor").notNull().default(0),
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
  rentMinor: integer("rent_minor").notNull().default(0),
  solarMinor: integer("solar_minor").notNull().default(0),
  deductionsMinor: integer("deductions_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
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
  principalSanctionedMinor: integer("principal_sanctioned_minor")
    .notNull()
    .default(0),
  currentBalanceMinor: integer("current_balance_minor").notNull().default(0),
  interestRate: real("interest_rate").notNull().default(0),
  emiAmount: real("emi_amount").notNull().default(0),
  emiMinor: integer("emi_minor").notNull().default(0),
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
  type: text("type").notNull().default("emi"),
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
  balanceAfter: real("balance_after").notNull().default(0),
  debitMinor: integer("debit_minor").notNull().default(0),
  creditMinor: integer("credit_minor").notNull().default(0),
  balanceAfterMinor: integer("balance_after_minor").notNull().default(0),
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
  premiumMinor: integer("premium_minor").notNull().default(0),
  premiumFrequency: text("premium_frequency").notNull().default("annual"), // annual | monthly
  coverAmount: text("cover_amount").default(""),
  startDate: text("start_date").default(""),
  expiryDate: text("expiry_date").default(""),
  maturityDate: text("maturity_date").default(""),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const assetRegister = sqliteTable("asset_register", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  assetType: text("asset_type").notNull().default("financial_cash"), // financial_cash | financial_other | physical_property | physical_vehicle | physical_other
  currency: text("currency").notNull().default("INR"),
  currentValue: real("current_value").notNull().default(0),
  currentValueMinor: integer("current_value_minor").notNull().default(0),
  linkedLoanId: integer("linked_loan_id").references(() => loans.id, {
    onDelete: "set null",
  }),
  valuationDate: text("valuation_date").default(""),
  isEstimated: integer("is_estimated", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes").default(""),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const netWorthSnapshots = sqliteTable("net_worth_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  totalAssets: real("total_assets").notNull().default(0),
  totalLiabilities: real("total_liabilities").default(0),
  netWorth: real("net_worth").notNull().default(0),
  totalAssetsMinor: integer("total_assets_minor").notNull().default(0),
  totalLiabilitiesMinor: integer("total_liabilities_minor"),
  liabilitiesKnown: integer("liabilities_known", { mode: "boolean" })
    .notNull()
    .default(true),
  netWorthMinor: integer("net_worth_minor"),
  source: text("source").notNull().default("manual"), // manual | excel_import | computed
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const financialGoals = sqliteTable("financial_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull().default("wealth"),
  description: text("description").notNull().default(""),
  targetAmount: real("target_amount").notNull().default(0),
  currentAmount: real("current_amount").notNull().default(0),
  targetMinor: integer("target_minor").notNull().default(0),
  currentMinor: integer("current_minor").notNull().default(0),
  targetDate: text("target_date").default(""),
  priority: text("priority").notNull().default("medium"), // high | medium | low
  expectedAnnualReturn: real("expected_annual_return").notNull().default(10),
  inflationRate: real("inflation_rate").notNull().default(6),
  monthlyContribution: real("monthly_contribution").notNull().default(0),
  monthlyContributionMinor: integer("monthly_contribution_minor")
    .notNull()
    .default(0),
  status: text("status").notNull().default("active"), // active | paused | completed | archived
  notes: text("notes").default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const goalInvestmentAllocations = sqliteTable(
  "goal_investment_allocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    goalId: integer("goal_id")
      .notNull()
      .references(() => financialGoals.id, { onDelete: "cascade" }),
    holdingId: integer("holding_id")
      .notNull()
      .references(() => investmentHoldings.id, { onDelete: "cascade" }),
    allocationType: text("allocation_type").notNull().default("amount"), // amount | percentage
    allocatedAmount: real("allocated_amount").notNull().default(0),
    allocatedMinor: integer("allocated_minor").notNull().default(0),
    allocationPct: real("allocation_pct").notNull().default(0),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  }
);

export const goalContributions = sqliteTable("goal_contributions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id")
    .notNull()
    .references(() => financialGoals.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  amount: real("amount").notNull().default(0),
  amountMinor: integer("amount_minor").notNull().default(0),
  source: text("source").notNull().default("manual"), // manual | sip | lump_sum
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const goalSnapshots = sqliteTable("goal_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id")
    .notNull()
    .references(() => financialGoals.id, { onDelete: "cascade" }),
  snapshotDate: text("snapshot_date").notNull(),
  standaloneMinor: integer("standalone_minor").notNull().default(0),
  allocatedMinor: integer("allocated_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
  targetMinor: integer("target_minor").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const planningProfiles = sqliteTable("planning_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileKey: text("profile_key").notNull().unique(),
  currentAge: integer("current_age"),
  plannedRetirementAge: integer("planned_retirement_age").notNull().default(50),
  lifeExpectancy: integer("life_expectancy").notNull().default(85),
  monthlyExpenses: real("monthly_expenses").notNull().default(0),
  monthlyExpensesMinor: integer("monthly_expenses_minor").notNull().default(0),
  expenseInflationPct: real("expense_inflation_pct").notNull().default(6),
  expectedReturnPct: real("expected_return_pct").notNull().default(11),
  safeWithdrawalRatePct: real("safe_withdrawal_rate_pct").notNull().default(3.5),
  otherRetirementIncome: real("other_retirement_income").notNull().default(0),
  otherRetirementIncomeMinor: integer("other_retirement_income_minor")
    .notNull()
    .default(0),
  taxDragPct: real("tax_drag_pct").notNull().default(10),
  includePrimaryResidence: integer("include_primary_residence", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  emergencyMonthsTarget: integer("emergency_months_target")
    .notNull()
    .default(6),
  concentrationHoldingWarnPct: real("concentration_holding_warn_pct")
    .notNull()
    .default(25),
  concentrationCategoryWarnPct: real("concentration_category_warn_pct")
    .notNull()
    .default(45),
  concentrationCurrencyWarnPct: real("concentration_currency_warn_pct")
    .notNull()
    .default(35),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const financialScenarios = sqliteTable("financial_scenarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  configJson: text("config_json").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const monthlyWealthSnapshots = sqliteTable("monthly_wealth_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull().unique(),
  salaryMinor: integer("salary_minor").notNull().default(0),
  rentalMinor: integer("rental_minor").notNull().default(0),
  dividendMinor: integer("dividend_minor").notNull().default(0),
  otherIncomeMinor: integer("other_income_minor").notNull().default(0),
  totalIncomeMinor: integer("total_income_minor").notNull().default(0),
  emiMinor: integer("emi_minor").notNull().default(0),
  insuranceMinor: integer("insurance_minor").notNull().default(0),
  trackedExpensesMinor: integer("tracked_expenses_minor"),
  totalExpensesMinor: integer("total_expenses_minor"),
  invContributionsMinor: integer("inv_contributions_minor").notNull().default(0),
  employerContributionsMinor: integer("employer_contributions_minor")
    .notNull()
    .default(0),
  sipCommitmentMinor: integer("sip_commitment_minor").notNull().default(0),
  marketGainMinor: integer("market_gain_minor").notNull().default(0),
  portfolioValueMinor: integer("portfolio_value_minor").notNull().default(0),
  totalAssetsMinor: integer("total_assets_minor").notNull().default(0),
  totalLiabilitiesMinor: integer("total_liabilities_minor").notNull().default(0),
  netWorthMinor: integer("net_worth_minor").notNull().default(0),
  savingsRatePct: real("savings_rate_pct"),
  investmentRatePct: real("investment_rate_pct"),
  debtToAssetPct: real("debt_to_asset_pct"),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const netWorthMilestones = sqliteTable("net_worth_milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  targetAmount: real("target_amount").notNull().default(0),
  targetMinor: integer("target_minor").notNull().default(0),
  isPreset: integer("is_preset", { mode: "boolean" }).notNull().default(false),
  achievedDate: text("achieved_date").notNull().default(""),
  notes: text("notes").notNull().default(""),
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
  entityType: text("entity_type").notNull().default("insurance"),
  entityId: integer("entity_id").notNull().default(0),
  title: text("title").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  filePath: text("file_path").notNull(),
  sha256: text("sha256").notNull().default(""),
  aiSummary: text("ai_summary").default(""),
  uploadedAt: text("uploaded_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const importHistory = sqliteTable("import_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  fileSha256: text("file_sha256").notNull(),
  mode: text("mode").notNull().default("merge"), // merge | replace
  status: text("status").notNull().default("applied"), // applied | failed | rolled_back
  addedCount: integer("added_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  summaryJson: text("summary_json").notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const esopVestingEntries = sqliteTable("esop_vesting_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id")
    .notNull()
    .references(() => investmentHoldings.id, { onDelete: "cascade" }),
  period: integer("period").notNull(),
  vestingDate: text("vesting_date").notNull(), // YYYY-MM-DD
  optionsVested: integer("options_vested").notNull().default(0),
  cumulativeVested: integer("cumulative_vested").notNull().default(0),
  exercised: integer("exercised", { mode: "boolean" })
    .notNull()
    .default(false),
  exerciseQuantity: integer("exercise_quantity").notNull().default(0),
  sharePrice: real("share_price").notNull().default(0),
  strikePrice: real("strike_price").notNull().default(0),
  totalPrice: real("total_price").notNull().default(0),
  sharePriceMinor: integer("share_price_minor").notNull().default(0),
  strikePriceMinor: integer("strike_price_minor").notNull().default(0),
  totalPriceMinor: integer("total_price_minor").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
