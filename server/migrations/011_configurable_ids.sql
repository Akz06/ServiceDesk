ALTER TABLE organizations ADD COLUMN IF NOT EXISTS work_item_id_prefix TEXT NOT NULL DEFAULT 'WI';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS invoice_id_prefix TEXT NOT NULL DEFAULT 'INV';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS sequence_number INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sequence_number INTEGER;

-- Backfill sequence numbers for any rows that already exist (seed/demo data from before this
-- column existed), ordered by creation time within each organization.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id) AS rn
  FROM work_items
  WHERE sequence_number IS NULL
)
UPDATE work_items SET sequence_number = numbered.rn
FROM numbered WHERE work_items.id = numbered.id;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY issued_at, id) AS rn
  FROM invoices
  WHERE sequence_number IS NULL
)
UPDATE invoices SET sequence_number = numbered.rn
FROM numbered WHERE invoices.id = numbered.id;

ALTER TABLE work_items ALTER COLUMN sequence_number SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN sequence_number SET NOT NULL;
