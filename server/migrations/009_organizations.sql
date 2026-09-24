CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'System'
);

INSERT INTO organizations (id, name, slug, created_by)
VALUES ('org-default', 'Default Organization', 'default', 'System')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_technicians_org ON technicians(organization_id);

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_work_items_org ON work_items(organization_id);

ALTER TABLE inventory_parts ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_inventory_parts_org ON inventory_parts(organization_id);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);

ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS organization_id TEXT NOT NULL DEFAULT 'org-default' REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_org ON saved_reports(organization_id);

-- inventory SKUs are admin-typed, not generated, so two different orgs can plausibly
-- pick the same SKU. Make the primary key composite so that no longer collides.
ALTER TABLE inventory_parts DROP CONSTRAINT IF EXISTS inventory_parts_pkey;
ALTER TABLE inventory_parts ADD PRIMARY KEY (organization_id, sku);
