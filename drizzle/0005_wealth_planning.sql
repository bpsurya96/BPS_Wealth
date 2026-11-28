-- Extend financial_goals cleanly without touching legacy data
ALTER TABLE financial_goals ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE financial_goals ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE financial_goals ADD COLUMN expected_annual_return REAL NOT NULL DEFAULT 10;
ALTER TABLE financial_goals ADD COLUMN inflation_rate REAL NOT NULL DEFAULT 6;
ALTER TABLE financial_goals ADD COLUMN monthly_contribution REAL NOT NULL DEFAULT 0;
ALTER TABLE financial_goals ADD COLUMN monthly_contribution_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE financial_goals ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE financial_goals ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

-- Goal to holding investment allocations (prevents double counting via server-side validation)
CREATE TABLE IF NOT EXISTS goal_investment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  goal_id INTEGER NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  holding_id INTEGER NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  allocation_type TEXT NOT NULL DEFAULT 'amount',
  allocated_amount REAL NOT NULL DEFAULT 0,
  allocated_minor INTEGER NOT NULL DEFAULT 0,
  allocation_pct REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goal_alloc_goal_holding
  ON goal_investment_allocations(goal_id, holding_id);
CREATE INDEX IF NOT EXISTS idx_goal_alloc_holding
  ON goal_investment_allocations(holding_id);

-- Goal contribution log
CREATE TABLE IF NOT EXISTS goal_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  goal_id INTEGER NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal_date
  ON goal_contributions(goal_id, date);

-- Historical goal value snapshots
CREATE TABLE IF NOT EXISTS goal_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  goal_id INTEGER NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  standalone_minor INTEGER NOT NULL DEFAULT 0,
  allocated_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  target_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goal_snap_goal_date
  ON goal_snapshots(goal_id, snapshot_date);

-- Wealth planning profile (FIRE, Retirement, Emergency Fund, Concentration thresholds)
CREATE TABLE IF NOT EXISTS planning_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  profile_key TEXT NOT NULL UNIQUE,
  current_age INTEGER,
  planned_retirement_age INTEGER NOT NULL DEFAULT 50,
  life_expectancy INTEGER NOT NULL DEFAULT 85,
  monthly_expenses REAL NOT NULL DEFAULT 0,
  monthly_expenses_minor INTEGER NOT NULL DEFAULT 0,
  expense_inflation_pct REAL NOT NULL DEFAULT 6,
  expected_return_pct REAL NOT NULL DEFAULT 11,
  safe_withdrawal_rate_pct REAL NOT NULL DEFAULT 3.5,
  other_retirement_income REAL NOT NULL DEFAULT 0,
  other_retirement_income_minor INTEGER NOT NULL DEFAULT 0,
  tax_drag_pct REAL NOT NULL DEFAULT 10,
  include_primary_residence INTEGER NOT NULL DEFAULT 0,
  emergency_months_target INTEGER NOT NULL DEFAULT 6,
  concentration_holding_warn_pct REAL NOT NULL DEFAULT 25,
  concentration_category_warn_pct REAL NOT NULL DEFAULT 45,
  concentration_currency_warn_pct REAL NOT NULL DEFAULT 35,
  updated_at TEXT NOT NULL
);

-- What-if financial scenarios (isolated from real financial records)
CREATE TABLE IF NOT EXISTS financial_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Monthly wealth creation scorecard snapshots
CREATE TABLE IF NOT EXISTS monthly_wealth_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  month TEXT NOT NULL UNIQUE,
  salary_minor INTEGER NOT NULL DEFAULT 0,
  rental_minor INTEGER NOT NULL DEFAULT 0,
  dividend_minor INTEGER NOT NULL DEFAULT 0,
  other_income_minor INTEGER NOT NULL DEFAULT 0,
  total_income_minor INTEGER NOT NULL DEFAULT 0,
  emi_minor INTEGER NOT NULL DEFAULT 0,
  insurance_minor INTEGER NOT NULL DEFAULT 0,
  tracked_expenses_minor INTEGER,
  total_expenses_minor INTEGER,
  inv_contributions_minor INTEGER NOT NULL DEFAULT 0,
  employer_contributions_minor INTEGER NOT NULL DEFAULT 0,
  sip_commitment_minor INTEGER NOT NULL DEFAULT 0,
  market_gain_minor INTEGER NOT NULL DEFAULT 0,
  portfolio_value_minor INTEGER NOT NULL DEFAULT 0,
  total_assets_minor INTEGER NOT NULL DEFAULT 0,
  total_liabilities_minor INTEGER NOT NULL DEFAULT 0,
  net_worth_minor INTEGER NOT NULL DEFAULT 0,
  savings_rate_pct REAL,
  investment_rate_pct REAL,
  debt_to_asset_pct REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_monthly_wealth_month
  ON monthly_wealth_snapshots(month);

-- Net worth milestones (presets + custom)
CREATE TABLE IF NOT EXISTS net_worth_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  label TEXT NOT NULL,
  target_amount REAL NOT NULL DEFAULT 0,
  target_minor INTEGER NOT NULL DEFAULT 0,
  is_preset INTEGER NOT NULL DEFAULT 0,
  achieved_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

INSERT INTO net_worth_milestones (label, target_amount, target_minor, is_preset, achieved_date, notes, created_at)
SELECT '₹10 Lakh', 1000000, 100000000, 1, '', 'First major milestone', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM net_worth_milestones WHERE target_minor = 100000000 AND is_preset = 1);

INSERT INTO net_worth_milestones (label, target_amount, target_minor, is_preset, achieved_date, notes, created_at)
SELECT '₹25 Lakh', 2500000, 250000000, 1, '', 'Quarter-crore milestone', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM net_worth_milestones WHERE target_minor = 250000000 AND is_preset = 1);

INSERT INTO net_worth_milestones (label, target_amount, target_minor, is_preset, achieved_date, notes, created_at)
SELECT '₹50 Lakh', 5000000, 500000000, 1, '', 'Half-crore milestone', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM net_worth_milestones WHERE target_minor = 500000000 AND is_preset = 1);

INSERT INTO net_worth_milestones (label, target_amount, target_minor, is_preset, achieved_date, notes, created_at)
SELECT '₹1 Crore', 10000000, 1000000000, 1, '', 'Crorepati milestone', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM net_worth_milestones WHERE target_minor = 1000000000 AND is_preset = 1);

INSERT INTO net_worth_milestones (label, target_amount, target_minor, is_preset, achieved_date, notes, created_at)
SELECT '₹2 Crore', 20000000, 2000000000, 1, '', 'Two-crore milestone', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM net_worth_milestones WHERE target_minor = 2000000000 AND is_preset = 1);
