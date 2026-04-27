-- Taj AssetFlow - PostgreSQL Schema for Supabase

-- 1. Create enum for asset status
CREATE TYPE asset_status AS ENUM ('New', 'Refub', 'Used', 'Faulty');

-- 2. Create assets table
CREATE TABLE public.assets (
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

-- 3. Create a function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Create trigger to call the function
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON public.assets
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 5. Row Level Security (RLS)
-- Note: Enable this if you have user authentication set up. 
-- For a purely internal IT system, you might leave it open or restrict to authenticated users.
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users (or anon if public)
CREATE POLICY "Enable read access for all users" ON public.assets FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.assets FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.assets FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.assets FOR DELETE USING (true);

-- Insert Mock Data
INSERT INTO public.assets (laptop_name, serial_number, ram, storage_type, storage_capacity, assigned_to, location, status, purchase_date)
VALUES 
('Dell Latitude 5420', 'SN-DELL-001', '16GB', 'SSD', '512GB', 'john.doe', 'Karachi Office', 'New', '2023-01-15'),
('HP EliteBook 840', 'SN-HP-002', '8GB', 'SSD', '256GB', 'jane.smith', 'Lahore Office', 'Used', '2022-05-20'),
('Lenovo ThinkPad T14', 'SN-LEN-003', '32GB', 'SSD', '1TB', 'admin', 'Islamabad Office', 'New', '2023-11-01'),
('Apple MacBook Pro M1', 'SN-MAC-004', '16GB', 'SSD', '512GB', 'marketing.head', 'Karachi Office', 'New', '2022-08-10'),
('Dell OptiPlex 3080', 'SN-DELL-005', '8GB', 'HDD', '1TB', NULL, 'IT Store', 'Refub', '2021-03-12'),
('Lenovo IdeaPad 3', 'SN-LEN-006', '4GB', 'HDD', '500GB', 'sales.rep1', 'Multan Office', 'Faulty', '2020-11-25');
