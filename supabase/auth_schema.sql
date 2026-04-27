-- Run this in your Supabase SQL Editor to enable Authentication and Roles

CREATE TABLE public.app_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'subadmin' -- 'superadmin' or 'subadmin'
);

-- Insert the default super admin account
INSERT INTO public.app_users (username, password, role) 
VALUES ('admin', 'admin123', 'superadmin');

-- Set up basic RLS (optional, for security)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable full access to app_users for everyone" ON public.app_users FOR ALL USING (true);
