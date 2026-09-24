ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS filters JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE saved_reports
SET filters = jsonb_build_array(jsonb_build_object('field', filter_field, 'value', filter_value))
WHERE filter_field <> '' AND filters = '[]'::jsonb;
