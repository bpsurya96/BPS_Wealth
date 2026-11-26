CREATE INDEX IF NOT EXISTS idx_inv_txns_holding_date ON investment_transactions(holding_id, date);
CREATE INDEX IF NOT EXISTS idx_income_month_cat ON income_entries(month, category);
CREATE INDEX IF NOT EXISTS idx_rent_pay_prop_month ON rental_payments(property_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_loan_txns_loan_date ON loan_transactions(loan_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_docs_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_import_sha256 ON import_history(file_sha256);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
