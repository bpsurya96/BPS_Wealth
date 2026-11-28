CREATE TABLE IF NOT EXISTS esop_vesting_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  holding_id INTEGER NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  period INTEGER NOT NULL,
  vesting_date TEXT NOT NULL,
  options_vested INTEGER NOT NULL DEFAULT 0,
  cumulative_vested INTEGER NOT NULL DEFAULT 0,
  exercised INTEGER NOT NULL DEFAULT 0,
  exercise_quantity INTEGER NOT NULL DEFAULT 0,
  share_price REAL NOT NULL DEFAULT 0,
  strike_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  share_price_minor INTEGER NOT NULL DEFAULT 0,
  strike_price_minor INTEGER NOT NULL DEFAULT 0,
  total_price_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_esop_vesting_holding_period
  ON esop_vesting_entries(holding_id, period);
