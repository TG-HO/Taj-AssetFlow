-- ================================================================
-- FEATURE 5: Custody Ledger Schema
-- Prerequisites: Feature 3 schema (inventory_items) must be applied first
-- Run this entire script in Supabase SQL Editor
-- ================================================================

CREATE TABLE IF NOT EXISTS custody_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (
        action_type IN ('ISSUANCE', 'RETURN', 'FAULT_DEPOSIT', 'SNATCH_REPORT', 'DISPOSAL')
    ),

    -- Handover Details
    recipient_name VARCHAR(200) NOT NULL,
    recipient_department_id UUID NULL REFERENCES sub_locations(id) ON DELETE SET NULL,

    -- Condition at time of event
    handover_condition TEXT NOT NULL,

    -- Who performed the action
    admin_id UUID NOT NULL REFERENCES auth.users(id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for fast per-item lookups
CREATE INDEX IF NOT EXISTS idx_custody_ledger_item_id ON custody_ledger(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custody_ledger_company_id ON custody_ledger(company_id, created_at DESC);

ALTER TABLE custody_ledger ENABLE ROW LEVEL SECURITY;

-- Allow INSERT and SELECT but NOT UPDATE or DELETE (append-only ledger)
DROP POLICY IF EXISTS "Allow insert for public on custody_ledger" ON custody_ledger;
CREATE POLICY "Allow insert for public on custody_ledger"
    ON custody_ledger FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for public on custody_ledger" ON custody_ledger;
CREATE POLICY "Allow select for public on custody_ledger"
    ON custody_ledger FOR SELECT TO public USING (true);
