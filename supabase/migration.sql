-- Taj AssetFlow - PostgreSQL Schema for Supabase with Multi-Tenant Support

-- 1. Create enum for asset status if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_status') THEN
        CREATE TYPE asset_status AS ENUM ('New', 'Refub', 'Used', 'Faulty', 'Snatched', 'Damaged');
    END IF;
END $$;

-- 2. Create Companies Table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(50) NOT NULL UNIQUE, -- E.g., 'TG' for Taj Gasoline, 'TC' for Taj Corporation
    logo_url TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

-- Seed Initial Companies
INSERT INTO public.companies (name, code) VALUES 
('Taj Gasoline', 'TG'),
('Taj Corporation', 'TC')
ON CONFLICT (code) DO NOTHING;

-- 3. Create profiles table linked to Supabase Auth users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'moderator' NOT NULL CHECK (role IN ('admin', 'moderator')),
    full_name VARCHAR(150) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users can view their own profile'
    ) THEN
        CREATE POLICY "Users can view their own profile" 
            ON public.profiles FOR SELECT 
            USING (auth.uid() = id);
    END IF;
END $$;

-- 4. Create assets table
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    laptop_name TEXT NOT NULL,
    serial_number TEXT UNIQUE NOT NULL,
    ram TEXT NOT NULL,
    storage_type TEXT NOT NULL, -- 'SSD' or 'HDD'
    storage_capacity TEXT NOT NULL,
    assigned_to TEXT, -- Username
    old_username TEXT, -- Mandatory if status is 'Used'
    location TEXT NOT NULL,
    status asset_status NOT NULL DEFAULT 'New',
    purchase_date DATE,
    issue_date DATE,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add company_id foreign key column to assets
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 5. Create trigger function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_assets_updated_at') THEN
        CREATE TRIGGER update_assets_updated_at
            BEFORE UPDATE ON public.assets
            FOR EACH ROW
            EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- Enable RLS on assets
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Recreate assets policies to enable access controls
DROP POLICY IF EXISTS "Enable read access for all users" ON public.assets;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.assets;
DROP POLICY IF EXISTS "Enable update for all users" ON public.assets;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.assets;

CREATE POLICY "Enable read access for all users" ON public.assets FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.assets FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.assets FOR DELETE USING (true);

-- 6. Create admin_logs table
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    target_serial_number TEXT,
    details JSONB,
    changes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add company_id foreign key column to admin_logs
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Enable RLS on admin_logs
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.admin_logs;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.admin_logs;

CREATE POLICY "Enable read access for all users" ON public.admin_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.admin_logs FOR INSERT WITH CHECK (true);

-- Map existing records to the default company 'Taj Gasoline' (code: 'TG')
DO $$
DECLARE
  tg_id UUID;
BEGIN
  SELECT id INTO tg_id FROM public.companies WHERE code = 'TG' LIMIT 1;
  IF tg_id IS NOT NULL THEN
    UPDATE public.assets SET company_id = tg_id WHERE company_id IS NULL;
    UPDATE public.admin_logs SET company_id = tg_id WHERE company_id IS NULL;
  END IF;
END $$;

-- Insert Mock Data if table is empty
DO $$
DECLARE
  tg_id UUID;
BEGIN
  SELECT id INTO tg_id FROM public.companies WHERE code = 'TG' LIMIT 1;
  IF tg_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.assets) THEN
    INSERT INTO public.assets (laptop_name, serial_number, ram, storage_type, storage_capacity, assigned_to, location, status, purchase_date, company_id)
    VALUES 
    ('Dell Latitude 5420', 'SN-DELL-001', '16GB', 'SSD', '512GB', 'john.doe', 'Karachi Office', 'New', '2023-01-15', tg_id),
    ('HP EliteBook 840', 'SN-HP-002', '8GB', 'SSD', '256GB', 'jane.smith', 'Lahore Office', 'Used', '2022-05-20', tg_id),
    ('Lenovo ThinkPad T14', 'SN-LEN-003', '32GB', 'SSD', '1TB', 'admin', 'Islamabad Office', 'New', '2023-11-01', tg_id);
  END IF;
END $$;
