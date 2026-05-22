-- ================================================================
-- FEATURE 4: Software Vault Schema
-- Prerequisites: Feature 3 schema (inventory_items) must be applied first
-- Run this entire script in Supabase SQL Editor
-- ================================================================

-- 1. Software Installer Binaries (uploaded to Supabase Storage)
CREATE TABLE IF NOT EXISTS software_installers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,           -- Path inside the 'software-binaries' bucket
    file_size_bytes BIGINT NOT NULL,
    version VARCHAR(50) NOT NULL,
    download_count INT DEFAULT 0 NOT NULL,
    uploaded_by VARCHAR(150) NOT NULL,  -- custom session user ID (not auth.users)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE software_installers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for public on software_installers" ON software_installers;
CREATE POLICY "Allow all for public on software_installers"
    ON software_installers FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. License Seat Allocations
CREATE TABLE IF NOT EXISTS software_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    software_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    allocated_user_id VARCHAR(150) NOT NULL,   -- Name or username of assigned person
    assigned_asset_id UUID NULL REFERENCES inventory_items(id) ON DELETE SET NULL,
    allocated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE software_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for public on software_allocations" ON software_allocations;
CREATE POLICY "Allow all for public on software_allocations"
    ON software_allocations FOR ALL TO public USING (true) WITH CHECK (true);

-- ================================================================
-- Supabase Storage Bucket Setup
-- ================================================================

-- 1. Create the 'software-binaries' bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('software-binaries', 'software-binaries', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable/Define RLS Policies on storage.objects for the 'software-binaries' bucket
DROP POLICY IF EXISTS "Allow public select for software-binaries" ON storage.objects;
CREATE POLICY "Allow public select for software-binaries"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public insert for software-binaries" ON storage.objects;
CREATE POLICY "Allow public insert for software-binaries"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public delete for software-binaries" ON storage.objects;
CREATE POLICY "Allow public delete for software-binaries"
ON storage.objects FOR DELETE TO public
USING (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public update for software-binaries" ON storage.objects;
CREATE POLICY "Allow public update for software-binaries"
ON storage.objects FOR UPDATE TO public
USING (bucket_id = 'software-binaries')
WITH CHECK (bucket_id = 'software-binaries');
