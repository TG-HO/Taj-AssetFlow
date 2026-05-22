-- ================================================================
-- FIX: Software Binaries Upload + Auth Compatibility
-- 
-- Run this ENTIRE script in the Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/wvvhrlbaeoajxnqovcap/sql/new
-- 
-- ALSO DO THIS FIRST (or upload will fail with size errors):
--   Go to: Supabase Dashboard → Storage → Settings
--   Set "Upload file size limit" to 500 MB (or higher)
--   Save. Then run this SQL.
-- 
-- This script is safe to run multiple times (idempotent).
-- ================================================================

-- ── 1. Fix serial number constraint (allow multiple NULL serials) ──
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS unique_serial_per_company;
DROP INDEX IF EXISTS unique_serial_per_company;
CREATE UNIQUE INDEX IF NOT EXISTS unique_serial_per_company
    ON inventory_items (company_id, serial_number)
    WHERE serial_number IS NOT NULL;

-- ── 2. Fix software_installers.uploaded_by ────────────────────────
-- The app uses custom cookie-based auth, not Supabase Auth.
-- Drop the FK to auth.users and make it a plain VARCHAR.
ALTER TABLE software_installers
    DROP CONSTRAINT IF EXISTS software_installers_uploaded_by_fkey;

ALTER TABLE software_installers
    ALTER COLUMN uploaded_by TYPE VARCHAR(150)
    USING uploaded_by::text;

-- ── 3. Fix audit_logs.user_id ─────────────────────────────────────
ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;

ALTER TABLE audit_logs
    ALTER COLUMN user_id TYPE VARCHAR(150)
    USING user_id::text;

-- ── 4. Create the software-binaries storage bucket ────────────────
-- IMPORTANT: file_size_limit = NULL means "use the project-level limit"
-- Set that in: Dashboard → Storage → Settings → Upload file size limit
-- Do NOT put a number here unless you know your plan's exact limit.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'software-binaries',
    'software-binaries',
    false,
    NULL,      -- No bucket-level cap; controlled by Dashboard → Storage → Settings
    NULL       -- No MIME type restriction; accept all installer file types
)
ON CONFLICT (id) DO UPDATE
    SET file_size_limit = NULL,
        allowed_mime_types = NULL;

-- ── 5. Storage RLS policies for software-binaries ─────────────────
DROP POLICY IF EXISTS "Allow public select for software-binaries" ON storage.objects;
CREATE POLICY "Allow public select for software-binaries"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public insert for software-binaries" ON storage.objects;
CREATE POLICY "Allow public insert for software-binaries"
    ON storage.objects FOR INSERT TO public
    WITH CHECK (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public update for software-binaries" ON storage.objects;
CREATE POLICY "Allow public update for software-binaries"
    ON storage.objects FOR UPDATE TO public
    USING  (bucket_id = 'software-binaries')
    WITH CHECK (bucket_id = 'software-binaries');

DROP POLICY IF EXISTS "Allow public delete for software-binaries" ON storage.objects;
CREATE POLICY "Allow public delete for software-binaries"
    ON storage.objects FOR DELETE TO public
    USING (bucket_id = 'software-binaries');

-- ── Done ──────────────────────────────────────────────────────────
-- Verify bucket was created:
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'software-binaries';
