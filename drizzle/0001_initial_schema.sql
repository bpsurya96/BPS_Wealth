CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS income_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  month TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'salary',
  gross_amount REAL NOT NULL DEFAULT 0,
  inhand_amount REAL NOT NULL DEFAULT 0,
  tds_amount REAL NOT NULL DEFAULT 0,
  account TEXT DEFAULT 'Bank',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investment_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  scheme_code TEXT DEFAULT '',
  ticker TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  planned_sip REAL NOT NULL DEFAULT 0,
  target_amount REAL NOT NULL DEFAULT 0,
  invested_amount REAL NOT NULL DEFAULT 0,
  current_value REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  avg_nav REAL NOT NULL DEFAULT 0,
  current_nav REAL NOT NULL DEFAULT 0,
  interest_rate REAL NOT NULL DEFAULT 0,
  start_date TEXT DEFAULT '',
  maturity_date TEXT DEFAULT '',
  tenure_months INTEGER NOT NULL DEFAULT 0,
  is_emergency_fund INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  holding_id INTEGER NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'sip',
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  fx_rate REAL NOT NULL DEFAULT 1,
  nav_or_price REAL NOT NULL DEFAULT 0,
  units REAL NOT NULL DEFAULT 0,
  employer_amount REAL NOT NULL DEFAULT 0,
  remarks TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rental_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  tenant_name TEXT DEFAULT '',
  advance_paid REAL NOT NULL DEFAULT 0,
  advance_pending REAL NOT NULL DEFAULT 0,
  monthly_rent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'occupied',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rental_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  property_id INTEGER NOT NULL REFERENCES rental_properties(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,
  rent_amount REAL NOT NULL DEFAULT 0,
  solar_charge REAL NOT NULL DEFAULT 0,
  deductions REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_date TEXT DEFAULT '',
  payment_mode TEXT DEFAULT 'UPI',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  lender TEXT DEFAULT '',
  principal_sanctioned REAL NOT NULL DEFAULT 0,
  current_balance REAL NOT NULL DEFAULT 0,
  interest_rate REAL NOT NULL DEFAULT 0,
  emi_amount REAL NOT NULL DEFAULT 0,
  tenure_months INTEGER NOT NULL DEFAULT 0,
  start_date TEXT DEFAULT '',
  closed_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  txn_date TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'emi',
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  balance_after REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  policy_type TEXT NOT NULL DEFAULT 'term',
  provider TEXT DEFAULT '',
  premium_amount REAL NOT NULL DEFAULT 0,
  premium_frequency TEXT NOT NULL DEFAULT 'annual',
  cover_amount TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  expiry_date TEXT DEFAULT '',
  maturity_date TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  date TEXT NOT NULL,
  total_assets REAL NOT NULL DEFAULT 0,
  total_liabilities REAL NOT NULL DEFAULT 0,
  net_worth REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'wealth',
  target_amount REAL NOT NULL DEFAULT 0,
  current_amount REAL NOT NULL DEFAULT 0,
  target_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investment_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  supports_sip INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'insurance',
  entity_id INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL,
  ai_summary TEXT DEFAULT '',
  uploaded_at TEXT NOT NULL
);
