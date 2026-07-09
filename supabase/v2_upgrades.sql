-- ================================================================
-- TAJ ASSETFLOW V2.0 DATABASE SCHEMA MIGRATION
-- Run this script in the Supabase SQL Editor
-- ================================================================

-- 1. Modify profiles check constraint and columns
-- Drop the existing role check constraint if it exists to allow 'site_manager'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'moderator', 'site_manager'));

-- Add nullable assigned_location_id column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

-- 2. Create employees table
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    designation VARCHAR(255) NULL,
    department VARCHAR(255) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_company_employee_email UNIQUE (company_id, email)
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all actions for public on employees" ON public.employees;
CREATE POLICY "Allow all actions for public on employees" ON public.employees FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. Create stock_allocations table
CREATE TABLE IF NOT EXISTS public.stock_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    item_type VARCHAR(100) NOT NULL,
    quantity_allocated INT NOT NULL CHECK (quantity_allocated > 0),
    target_location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Reconciled', 'Mismatch')) DEFAULT 'Pending',
    reconciled_quantity INT NULL CHECK (reconciled_quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    reconciled_at TIMESTAMP WITH TIME ZONE NULL,
    reconciled_by VARCHAR(150) NULL
);

ALTER TABLE public.stock_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all actions for public on stock_allocations" ON public.stock_allocations;
CREATE POLICY "Allow all actions for public on stock_allocations" ON public.stock_allocations FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Create site_requests table
CREATE TABLE IF NOT EXISTS public.site_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    item_type VARCHAR(100) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    details TEXT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
    created_by VARCHAR(150) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.site_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all actions for public on site_requests" ON public.site_requests;
CREATE POLICY "Allow all actions for public on site_requests" ON public.site_requests FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE NOT NULL,
    is_important BOOLEAN DEFAULT FALSE NOT NULL,
    redirect_url VARCHAR(255) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all actions for public on notifications" ON public.notifications;
CREATE POLICY "Allow all actions for public on notifications" ON public.notifications FOR ALL TO public USING (true) WITH CHECK (true);

-- 6. Create isp_inventory table
CREATE TABLE IF NOT EXISTS public.isp_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    provider_name VARCHAR(150) NOT NULL,
    package_details TEXT NULL,
    bandwidth_mbps INT NOT NULL CHECK (bandwidth_mbps > 0),
    recurring_cost DECIMAL(12, 2) NOT NULL CHECK (recurring_cost >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_location_isp UNIQUE (location_id, provider_name)
);

ALTER TABLE public.isp_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all actions for public on isp_inventory" ON public.isp_inventory;
CREATE POLICY "Allow all actions for public on isp_inventory" ON public.isp_inventory FOR ALL TO public USING (true) WITH CHECK (true);

-- 7. Secure logging tables at database query layer (segregation)
-- audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow select on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Segregate audit_logs by company" ON public.audit_logs;
CREATE POLICY "Segregate audit_logs by company" ON public.audit_logs
  FOR SELECT TO public
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- admin_logs
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.admin_logs;
DROP POLICY IF EXISTS "Segregate admin_logs by company" ON public.admin_logs;
CREATE POLICY "Segregate admin_logs by company" ON public.admin_logs
  FOR SELECT TO public
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Enable public write access on profiles to allow Admin user creation to succeed
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all actions for public on profiles" ON public.profiles;
CREATE POLICY "Allow all actions for public on profiles" ON public.profiles FOR ALL TO public USING (true) WITH CHECK (true);

-- Enable public insert access on logging tables so actions can write audit logs
DROP POLICY IF EXISTS "Allow public insert on admin_logs" ON public.admin_logs;
CREATE POLICY "Allow public insert on admin_logs" ON public.admin_logs FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public insert on audit_logs" ON public.audit_logs;
CREATE POLICY "Allow public insert on audit_logs" ON public.audit_logs FOR INSERT TO public WITH CHECK (true);

-- Add location_id column to employees table to support location-filtering directory
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

-- 8. Seed default mock employees for both TG and TC companies
DO $$
DECLARE
  tg_id UUID;
  tc_id UUID;
BEGIN
  SELECT id INTO tg_id FROM public.companies WHERE code = 'TG' LIMIT 1;
  SELECT id INTO tc_id FROM public.companies WHERE code = 'TC' LIMIT 1;

  IF tg_id IS NOT NULL THEN
    INSERT INTO public.employees (company_id, name, email, designation, department) VALUES
    (tg_id, 'Muhammad Dawood', 'muhammad.dawood@tajcorporation.com', 'Director IT', 'Administration'),
    (tg_id, 'Ali Raza', 'ali.raza@tajgasoline.com', 'Senior Software Engineer', 'IT Department'),
    (tg_id, 'Aisha Khan', 'aisha.khan@tajgasoline.com', 'HR Specialist', 'Human Resources'),
    (tg_id, 'Zainab Bibi', 'zainab.bibi@tajgasoline.com', 'Finance Associate', 'Finance & Accounts')
    ON CONFLICT (company_id, email) DO NOTHING;
  END IF;

  IF tc_id IS NOT NULL THEN
    INSERT INTO public.employees (company_id, name, email, designation, department) VALUES
    (tc_id, 'Dawood Muhammad', 'dawood.m@tajcorporation.com', 'General Manager', 'Administration'),
    (tc_id, 'Bilal Ahmed', 'bilal.ahmed@tajcorporation.com', 'Network Administrator', 'IT Support'),
    (tc_id, 'Fatima Sana', 'fatima.sana@tajcorporation.com', 'Accounts Lead', 'Finance')
    ON CONFLICT (company_id, email) DO NOTHING;
  END IF;
END $$;

-- Alter notifications table to add location_id column if it doesn't already exist
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE;

-- Alter profiles table to add assigned_location_ids array if it doesn't already exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assigned_location_ids UUID[] DEFAULT '{}';

-- Migrate existing site manager location bindings
UPDATE public.profiles 
SET assigned_location_ids = ARRAY[assigned_location_id] 
WHERE assigned_location_id IS NOT NULL AND (assigned_location_ids IS NULL OR cardinality(assigned_location_ids) = 0);

-- Alter site_requests table to add items JSONB column if it doesn't already exist
ALTER TABLE public.site_requests ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;
