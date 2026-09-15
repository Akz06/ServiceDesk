CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  work_item_id TEXT REFERENCES work_items(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  provider TEXT NOT NULL DEFAULT 'mock',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_customer_id ON notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_work_item_id ON notifications(work_item_id);

CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity TEXT NOT NULL,
  columns TEXT[] NOT NULL,
  filter_field TEXT NOT NULL DEFAULT '',
  filter_value TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by ON saved_reports(created_by);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS labor_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parts_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS diagnostic_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS labor_estimate NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS parts_estimate NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS diagnostic_fee NUMERIC(12, 2) NOT NULL DEFAULT 0;
