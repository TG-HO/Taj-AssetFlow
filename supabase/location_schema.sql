-- 1. Primary Locations (Scoped to Company)
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    address TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_company_location UNIQUE (company_id, name)
);

-- 2. Sub-Locations / Departments (Scoped to Primary Location)
CREATE TABLE IF NOT EXISTS public.sub_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL, -- E.g., 'Finance', 'IT', 'Retail Sales'
    cost_center_code VARCHAR(100) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_location_sub_location UNIQUE (location_id, name)
);

-- 3. Warehouses / Storage Zones (Scoped to Primary Location)
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL, -- E.g., 'Main IT Storage Room', 'Depot Room C'
    rack_number VARCHAR(100) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_location_warehouse UNIQUE (location_id, name)
);

-- 4. Enable Row Level Security (RLS) on new tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

-- 5. Create permissive RLS Policies
DROP POLICY IF EXISTS "Allow all actions for authenticated users on locations" ON public.locations;
DROP POLICY IF EXISTS "Allow all actions for authenticated users on sub_locations" ON public.sub_locations;
DROP POLICY IF EXISTS "Allow all actions for authenticated users on warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Allow all actions for public on locations" ON public.locations;
DROP POLICY IF EXISTS "Allow all actions for public on sub_locations" ON public.sub_locations;
DROP POLICY IF EXISTS "Allow all actions for public on warehouses" ON public.warehouses;

CREATE POLICY "Allow all actions for public on locations" ON public.locations FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all actions for public on sub_locations" ON public.sub_locations FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow all actions for public on warehouses" ON public.warehouses FOR ALL TO public USING (true) WITH CHECK (true);

-- 6. Add references to assets table
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS sub_location_id UUID REFERENCES public.sub_locations(id) ON DELETE SET NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- 7. Data Migration: Parse flat text location strings and map to locations table
DO $$
DECLARE
  asset_rec RECORD;
  loc_id UUID;
  default_company_id UUID;
BEGIN
  -- Fetch default company ID
  SELECT id INTO default_company_id FROM public.companies WHERE code = 'TG' LIMIT 1;
  
  -- Iterate through distinct text locations from assets
  FOR asset_rec IN 
    SELECT DISTINCT COALESCE(company_id, default_company_id) AS comp_id, location 
    FROM public.assets 
    WHERE location IS NOT NULL AND location <> ''
  LOOP
    -- Insert primary location
    INSERT INTO public.locations (company_id, name)
    VALUES (asset_rec.comp_id, asset_rec.location)
    ON CONFLICT (company_id, name) DO NOTHING;
    
    -- Fetch its ID
    SELECT id INTO loc_id 
    FROM public.locations 
    WHERE company_id = asset_rec.comp_id AND name = asset_rec.location 
    LIMIT 1;
    
    -- Link assets
    UPDATE public.assets 
    SET location_id = loc_id 
    WHERE COALESCE(company_id, default_company_id) = asset_rec.comp_id AND location = asset_rec.location;
  END LOOP;
END $$;
