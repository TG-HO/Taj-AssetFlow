-- ================================================================
-- FEATURE 3: Item Classification Schema
-- Run this entire script in Supabase SQL Editor
-- ================================================================

-- 1. Item Categories (company-scoped)
CREATE TABLE IF NOT EXISTS item_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    classification VARCHAR(50) NOT NULL CHECK (classification IN ('Asset', 'Consumable', 'Software')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_company_category UNIQUE (company_id, name)
);

ALTER TABLE item_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for public on item_categories" ON item_categories;
CREATE POLICY "Allow all for public on item_categories"
    ON item_categories FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. Unified Inventory Items Table
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES item_categories(id),
    location_id UUID NOT NULL REFERENCES locations(id),
    sub_location_id UUID NULL REFERENCES sub_locations(id),
    warehouse_id UUID NULL REFERENCES warehouses(id),

    -- Base Properties
    name VARCHAR(255) NOT NULL,
    serial_number VARCHAR(150) NULL,
    part_number VARCHAR(100) NULL,
    model_number VARCHAR(100) NULL,
    status_state VARCHAR(50) DEFAULT 'New' NOT NULL 
        CHECK (status_state IN ('New', 'Used', 'Faulty', 'Damaged', 'Snatched')),

    -- Consumables Balance Mechanics
    quantity INT DEFAULT 1 NOT NULL CHECK (quantity >= 0),
    minimum_safety_stock INT DEFAULT 0 NOT NULL CHECK (minimum_safety_stock >= 0),

    -- Assignment
    assigned_to VARCHAR(255) NULL,

    -- Notes
    notes TEXT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,


    -- Uniqueness of serial numbers per company is enforced via partial index to allow multiple NULL serials (e.g. for Software/Consumables)
);

-- Drop the old constraint or index if they exist to prevent NULL serial conflicts
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS unique_serial_per_company;
DROP INDEX IF EXISTS unique_serial_per_company;

CREATE UNIQUE INDEX IF NOT EXISTS unique_serial_per_company ON inventory_items (company_id, serial_number) WHERE serial_number IS NOT NULL;

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for public on inventory_items" ON inventory_items;
CREATE POLICY "Allow all for public on inventory_items"
    ON inventory_items FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. Spec Matrix (dynamic key-value attributes per item)
CREATE TABLE IF NOT EXISTS inventory_specs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    spec_key VARCHAR(100) NOT NULL,
    spec_value TEXT NOT NULL
);

ALTER TABLE inventory_specs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for public on inventory_specs" ON inventory_specs;
CREATE POLICY "Allow all for public on inventory_specs"
    ON inventory_specs FOR ALL TO public USING (true) WITH CHECK (true);

-- ================================================================
-- DEFAULT CATEGORY SEED
-- Seeds default categories for ALL existing companies.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- ================================================================
INSERT INTO item_categories (company_id, name, classification)
SELECT c.id, cat.name, cat.classification
FROM companies c
CROSS JOIN (VALUES
    ('Laptop',           'Asset'),
    ('Desktop',          'Asset'),
    ('Server',           'Asset'),
    ('Monitor',          'Asset'),
    ('UPS / Battery',    'Asset'),
    ('Printer',          'Asset'),
    ('Switch / Router',  'Asset'),
    ('Mouse',            'Consumable'),
    ('Keyboard',         'Consumable'),
    ('USB Adapter',      'Consumable'),
    ('HDMI Cable',       'Consumable'),
    ('Charger / Adapter','Consumable'),
    ('Headset',          'Consumable'),
    ('Windows License',  'Software'),
    ('Office License',   'Software'),
    ('Antivirus License','Software'),
    ('Other Software',   'Software')
) AS cat(name, classification)
ON CONFLICT ON CONSTRAINT unique_company_category DO NOTHING;
