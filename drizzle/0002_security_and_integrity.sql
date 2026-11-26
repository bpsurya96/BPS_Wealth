-- Security tables
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT DEFAULT '',
  last_attempt_at TEXT NOT NULL
);

-- Net worth asset register
CREATE TABLE IF NOT EXISTS asset_register (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'financial_cash',
  currency TEXT NOT NULL DEFAULT 'INR',
  current_value REAL NOT NULL DEFAULT 0,
  current_value_minor INTEGER NOT NULL DEFAULT 0,
  linked_loan_id INTEGER REFERENCES loans(id) ON DELETE SET NULL,
  valuation_date TEXT DEFAULT '',
  is_estimated INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

-- Workbook import audit & deduplication log
CREATE TABLE IF NOT EXISTS import_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  file_name TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'merge',
  status TEXT NOT NULL DEFAULT 'applied',
  added_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

-- Incremental minor-unit & metadata columns (executed idempotently by migrator)
ALTER TABLE documents ADD COLUMN sha256 TEXT NOT NULL DEFAULT '';

ALTER TABLE income_entries ADD COLUMN gross_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE income_entries ADD COLUMN inhand_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE income_entries ADD COLUMN tds_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE income_entries ADD COLUMN rental_payment_id INTEGER;

ALTER TABLE investment_holdings ADD COLUMN planned_sip_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE investment_holdings ADD COLUMN target_amount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE investment_holdings ADD COLUMN invested_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE investment_holdings ADD COLUMN current_value_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE investment_transactions ADD COLUMN amount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE investment_transactions ADD COLUMN employer_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rental_properties ADD COLUMN advance_paid_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rental_properties ADD COLUMN advance_pending_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rental_properties ADD COLUMN monthly_rent_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE rental_payments ADD COLUMN rent_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rental_payments ADD COLUMN solar_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rental_payments ADD COLUMN deductions_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rental_payments ADD COLUMN total_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE loans ADD COLUMN principal_sanctioned_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE loans ADD COLUMN current_balance_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE loans ADD COLUMN emi_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE loan_transactions ADD COLUMN debit_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE loan_transactions ADD COLUMN credit_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE loan_transactions ADD COLUMN balance_after_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE insurance_policies ADD COLUMN premium_minor INTEGER NOT NULL DEFAULT 0;

ALTER TABLE net_worth_snapshots ADD COLUMN total_assets_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE net_worth_snapshots ADD COLUMN total_liabilities_minor INTEGER;
ALTER TABLE net_worth_snapshots ADD COLUMN liabilities_known INTEGER NOT NULL DEFAULT 1;
ALTER TABLE net_worth_snapshots ADD COLUMN net_worth_minor INTEGER;
ALTER TABLE net_worth_snapshots ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE financial_goals ADD COLUMN target_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE financial_goals ADD COLUMN current_minor INTEGER NOT NULL DEFAULT 0;

-- Backfill integer minor units from existing REAL values without losing data
UPDATE income_entries
  SET gross_minor = CAST(ROUND(gross_amount * 100.0) AS INTEGER),
      inhand_minor = CAST(ROUND(inhand_amount * 100.0) AS INTEGER),
      tds_minor = CAST(ROUND(tds_amount * 100.0) AS INTEGER)
  WHERE gross_minor = 0 AND inhand_minor = 0 AND tds_minor = 0;

UPDATE investment_holdings
  SET planned_sip_minor = CAST(ROUND(planned_sip * 100.0) AS INTEGER),
      target_amount_minor = CAST(ROUND(target_amount * 100.0) AS INTEGER),
      invested_minor = CAST(ROUND(invested_amount * 100.0) AS INTEGER),
      current_value_minor = CAST(ROUND(current_value * 100.0) AS INTEGER)
  WHERE planned_sip_minor = 0 AND target_amount_minor = 0 AND invested_minor = 0 AND current_value_minor = 0;

UPDATE investment_transactions
  SET amount_minor = CAST(ROUND(amount * 100.0) AS INTEGER),
      employer_minor = CAST(ROUND(employer_amount * 100.0) AS INTEGER)
  WHERE amount_minor = 0 AND employer_minor = 0;

UPDATE rental_properties
  SET advance_paid_minor = CAST(ROUND(advance_paid * 100.0) AS INTEGER),
      advance_pending_minor = CAST(ROUND(advance_pending * 100.0) AS INTEGER),
      monthly_rent_minor = CAST(ROUND(monthly_rent * 100.0) AS INTEGER)
  WHERE advance_paid_minor = 0 AND advance_pending_minor = 0 AND monthly_rent_minor = 0;

UPDATE rental_payments
  SET rent_minor = CAST(ROUND(rent_amount * 100.0) AS INTEGER),
      solar_minor = CAST(ROUND(solar_charge * 100.0) AS INTEGER),
      deductions_minor = CAST(ROUND(deductions * 100.0) AS INTEGER),
      total_minor = CAST(ROUND(total_amount * 100.0) AS INTEGER)
  WHERE rent_minor = 0 AND solar_minor = 0 AND deductions_minor = 0 AND total_minor = 0;

UPDATE loans
  SET principal_sanctioned_minor = CAST(ROUND(principal_sanctioned * 100.0) AS INTEGER),
      current_balance_minor = CAST(ROUND(current_balance * 100.0) AS INTEGER),
      emi_minor = CAST(ROUND(emi_amount * 100.0) AS INTEGER)
  WHERE principal_sanctioned_minor = 0 AND current_balance_minor = 0 AND emi_minor = 0;

UPDATE loan_transactions
  SET debit_minor = CAST(ROUND(debit * 100.0) AS INTEGER),
      credit_minor = CAST(ROUND(credit * 100.0) AS INTEGER),
      balance_after_minor = CAST(ROUND(balance_after * 100.0) AS INTEGER)
  WHERE debit_minor = 0 AND credit_minor = 0 AND balance_after_minor = 0;

UPDATE insurance_policies
  SET premium_minor = CAST(ROUND(premium_amount * 100.0) AS INTEGER)
  WHERE premium_minor = 0;

UPDATE net_worth_snapshots
  SET total_assets_minor = CAST(ROUND(total_assets * 100.0) AS INTEGER),
      total_liabilities_minor = CASE WHEN total_liabilities IS NULL THEN NULL ELSE CAST(ROUND(total_liabilities * 100.0) AS INTEGER) END,
      net_worth_minor = CASE WHEN net_worth IS NULL THEN NULL ELSE CAST(ROUND(net_worth * 100.0) AS INTEGER) END
  WHERE total_assets_minor = 0;

UPDATE financial_goals
  SET target_minor = CAST(ROUND(target_amount * 100.0) AS INTEGER),
      current_minor = CAST(ROUND(current_amount * 100.0) AS INTEGER)
  WHERE target_minor = 0 AND current_minor = 0;
