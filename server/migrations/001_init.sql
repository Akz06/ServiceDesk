CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  source TEXT NOT NULL,
  device_type TEXT NOT NULL,
  device_model TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  issue_summary TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_technician_id TEXT NOT NULL,
  analysis TEXT NOT NULL,
  required_changes TEXT NOT NULL,
  estimated_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  approved_by_customer BOOLEAN NOT NULL DEFAULT FALSE,
  parts_required TEXT[] NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  promised_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_item_updates (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  message TEXT NOT NULL,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_parts (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  compatible_with TEXT[] NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_work_items_customer_id ON work_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_items_technician_id ON work_items(assigned_technician_id);
CREATE INDEX IF NOT EXISTS idx_updates_work_item_id ON work_item_updates(work_item_id);
