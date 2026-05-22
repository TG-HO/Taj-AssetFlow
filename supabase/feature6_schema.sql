-- ================================================================
-- FEATURE 6: Audit Logs Schema
-- Run this entire script in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id VARCHAR(150) NOT NULL,           -- custom session user ID (not auth.users)
    user_email VARCHAR(255) NOT NULL,
    action_type VARCHAR(100) NOT NULL,       -- E.g. 'ADD_ASSET', 'DELETE_LOCATION'
    target_identifier VARCHAR(150) NULL,     -- E.g. serial number or item name

    -- JSON state snapshots for diff view
    previous_state JSONB NULL,
    new_state JSONB NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for fast admin lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(company_id, action_type);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- INSERT allowed (for server actions to write logs)
DROP POLICY IF EXISTS "Allow insert on audit_logs" ON audit_logs;
CREATE POLICY "Allow insert on audit_logs"
    ON audit_logs FOR INSERT TO public WITH CHECK (true);

-- SELECT allowed (filtered in application layer to admin only)
DROP POLICY IF EXISTS "Allow select on audit_logs" ON audit_logs;
CREATE POLICY "Allow select on audit_logs"
    ON audit_logs FOR SELECT TO public USING (true);

-- Explicitly NO UPDATE or DELETE policies = these operations are blocked
