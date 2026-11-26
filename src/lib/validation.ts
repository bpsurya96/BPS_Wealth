import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const optionalDateSchema = z
  .string()
  .refine(
    (v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Date must be empty or YYYY-MM-DD"
  )
  .default("");

export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM");

export const currencySchema = z.enum(["INR", "USD"]);

export const pinActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits"),
  }),
  z.object({
    action: z.literal("lock"),
  }),
  z.object({
    action: z.literal("setup"),
    pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits"),
    setupToken: z.string().min(8, "Setup token is required"),
  }),
  z.object({
    action: z.literal("set"),
    pin: z.string().regex(/^\d{4,8}$/, "PIN must be 4 to 8 digits"),
    currentPin: z.string().optional(),
  }),
  z.object({
    action: z.literal("disable"),
    currentPin: z.string().optional(),
  }),
]);

export const createHoldingSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  assetClass: z.string().trim().min(1).max(60).default("mutual_fund"),
  currency: currencySchema.default("INR"),
  schemeCode: z.string().trim().max(32).default(""),
  ticker: z.string().trim().max(32).default(""),
  platform: z.string().trim().max(100).default(""),
  plannedSip: z.coerce.number().finite().min(0).default(0),
  targetAmount: z.coerce.number().finite().min(0).default(0),
  investedAmount: z.coerce.number().finite().min(0).default(0),
  currentValue: z.coerce.number().finite().min(0).optional(),
  units: z.coerce.number().finite().min(0).default(0),
  avgNav: z.coerce.number().finite().min(0).optional(),
  currentNav: z.coerce.number().finite().min(0).optional(),
  interestRate: z.coerce.number().finite().min(0).max(100).default(0),
  startDate: z.string().trim().max(20).default(""),
  maturityDate: z.string().trim().max(20).default(""),
  tenureMonths: z.coerce.number().int().min(0).max(1200).default(0),
  isEmergencyFund: z.boolean().default(false),
  status: z.enum(["active", "matured", "closed"]).default("active"),
  notes: z.string().trim().max(500).default(""),
});

export const patchHoldingSchema = z.object({
  id: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(160).optional(),
  schemeCode: z.string().trim().max(32).optional(),
  ticker: z.string().trim().max(32).optional(),
  plannedSip: z.coerce.number().finite().min(0).optional(),
  investedAmount: z.coerce.number().finite().min(0).optional(),
  currentValue: z.coerce.number().finite().min(0).optional(),
  units: z.coerce.number().finite().min(0).optional(),
  currentNav: z.coerce.number().finite().min(0).optional(),
  status: z.enum(["active", "matured", "closed"]).optional(),
});

export const investmentTxnTypeSchema = z.enum([
  "sip",
  "buy",
  "sell",
  "installment",
  "employer_contribution",
  "interest",
  "interest_payout",
  "dividend",
]);

export const createInvestmentTxnSchema = z.object({
  date: dateSchema.optional(),
  type: investmentTxnTypeSchema.default("sip"),
  amount: z.coerce.number().finite().positive("Amount must be greater than 0"),
  navOrPrice: z.coerce.number().finite().min(0).optional(),
  units: z.coerce.number().finite().min(0).optional(),
  fxRate: z.coerce.number().finite().positive().optional(),
  employerAmount: z.coerce.number().finite().min(0).default(0),
  remarks: z.string().trim().max(300).default(""),
});

export const createIncomeSchema = z.object({
  date: dateSchema.optional(),
  month: monthSchema.optional(),
  source: z.string().trim().min(1).max(120).default("Salary"),
  category: z.enum(["salary", "rental", "dividend", "other"]).default("salary"),
  grossAmount: z.coerce.number().finite().min(0).optional(),
  inhandAmount: z.coerce.number().finite().min(0),
  tdsAmount: z.coerce.number().finite().min(0).default(0),
  account: z.string().trim().max(80).default("Bank"),
  notes: z.string().trim().max(500).default(""),
  rentalPaymentId: z.coerce.number().int().positive().nullable().optional(),
});

export const createRentalPropertySchema = z.object({
  kind: z.literal("property").optional(),
  name: z.string().trim().min(1).max(120),
  tenantName: z.string().trim().max(120).default(""),
  advancePaid: z.coerce.number().finite().min(0).default(0),
  advancePending: z.coerce.number().finite().min(0).default(0),
  monthlyRent: z.coerce.number().finite().min(0),
  status: z.enum(["occupied", "vacant"]).default("occupied"),
  notes: z.string().trim().max(500).default(""),
});

export const createRentalPaymentSchema = z.object({
  kind: z.literal("payment"),
  propertyId: z.coerce.number().int().positive(),
  billingMonth: monthSchema.optional(),
  rentAmount: z.coerce.number().finite().min(0),
  solarCharge: z.coerce.number().finite().min(0).default(0),
  deductions: z.coerce.number().finite().min(0).default(0),
  totalAmount: z.coerce.number().finite().min(0).optional(),
  paidDate: z.string().trim().max(20).optional(),
  paymentMode: z.string().trim().max(40).default("UPI"),
  notes: z.string().trim().max(500).default(""),
});

export const createLoanSchema = z.object({
  name: z.string().trim().min(1).max(120),
  lender: z.string().trim().max(120).default(""),
  principalSanctioned: z.coerce.number().finite().min(0).default(0),
  currentBalance: z.coerce.number().finite().min(0).default(0),
  interestRate: z.coerce.number().finite().min(0).max(100).default(0),
  emiAmount: z.coerce.number().finite().min(0).default(0),
  tenureMonths: z.coerce.number().int().min(0).max(600).default(0),
  startDate: z.string().trim().max(20).default(""),
  closedDate: z.string().trim().max(20).default(""),
  status: z.enum(["active", "closed"]).default("active"),
  notes: z.string().trim().max(500).default(""),
});

export const createLoanTxnSchema = z.object({
  kind: z.literal("transaction"),
  loanId: z.coerce.number().int().positive(),
  txnDate: dateSchema,
  description: z.string().trim().max(240).default(""),
  type: z
    .enum(["emi", "prepayment", "interest", "charge", "disbursement"])
    .default("emi"),
  debit: z.coerce.number().finite().min(0).default(0),
  credit: z.coerce.number().finite().min(0).default(0),
  balanceAfter: z.coerce.number().finite().min(0),
});

export const createInsuranceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  policyType: z.enum(["term", "health", "life_endowment"]).default("term"),
  provider: z.string().trim().max(120).default(""),
  premiumAmount: z.coerce.number().finite().min(0),
  premiumFrequency: z.enum(["annual", "monthly"]).default("annual"),
  coverAmount: z.string().trim().max(80).default(""),
  startDate: z.string().trim().max(40).default(""),
  expiryDate: z.string().trim().max(40).default(""),
  maturityDate: z.string().trim().max(40).default(""),
  status: z.enum(["active", "lapsed", "matured"]).default("active"),
  notes: z.string().trim().max(500).default(""),
});

export const createAssetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  assetType: z.enum([
    "financial_cash",
    "financial_other",
    "physical_property",
    "physical_vehicle",
    "physical_other",
  ]),
  currency: currencySchema.default("INR"),
  currentValue: z.coerce.number().finite().min(0),
  linkedLoanId: z.coerce.number().int().positive().nullable().optional(),
  valuationDate: z.string().trim().max(20).default(""),
  isEstimated: z.boolean().default(false),
  notes: z.string().trim().max(500).default(""),
});

export const updateSettingsSchema = z.object({
  usdInrRate: z.coerce.number().finite().positive().max(10000).optional(),
  emergencyFundTarget: z.coerce.number().finite().min(0).optional(),
});

export const aiChatSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(4000),
  context: z.string().trim().max(60).default("overview"),
  mode: z.enum(["chat", "planning"]).default("chat"),
  allowRemoteEgress: z.boolean().default(false),
});

export const aiExtractedInsuranceSchema = z.object({
  name: z.string().nullable().optional(),
  policyType: z.enum(["term", "health", "life_endowment"]).nullable().optional(),
  provider: z.string().nullable().optional(),
  premiumAmount: z.number().finite().min(0).nullable().optional(),
  premiumFrequency: z.enum(["annual", "monthly"]).nullable().optional(),
  coverAmount: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const aiExtractedInvestmentSchema = z.object({
  name: z.string().nullable().optional(),
  assetClass: z
    .enum([
      "mutual_fund",
      "stock",
      "etf_us",
      "etf_in",
      "nps",
      "ppf",
      "fd",
      "rd",
      "chit",
      "esop",
      "gold_silver",
      "bond",
    ])
    .nullable()
    .optional(),
  date: z.string().nullable().optional(),
  amount: z.number().finite().min(0).nullable().optional(),
  navOrPrice: z.number().finite().min(0).nullable().optional(),
  units: z.number().finite().min(0).nullable().optional(),
  remarks: z.string().nullable().optional(),
});

export const aiExtractedIncomeSchema = z.object({
  date: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  category: z.enum(["salary", "rental", "dividend", "other"]).nullable().optional(),
  inhandAmount: z.number().finite().min(0).nullable().optional(),
  account: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const aiExtractedLoanSchema = z.object({
  name: z.string().nullable().optional(),
  lender: z.string().nullable().optional(),
  principalSanctioned: z.number().finite().min(0).nullable().optional(),
  currentBalance: z.number().finite().min(0).nullable().optional(),
  interestRate: z.number().finite().min(0).max(100).nullable().optional(),
  emiAmount: z.number().finite().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const aiExtractedReceiptOrBankSchema = z.object({
  documentKind: z.enum(["receipt", "bank_statement", "financial_document"]).nullable().optional(),
  date: z.string().nullable().optional(),
  merchantOrInstitution: z.string().nullable().optional(),
  totalAmount: z.number().finite().min(0).nullable().optional(),
  currency: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
