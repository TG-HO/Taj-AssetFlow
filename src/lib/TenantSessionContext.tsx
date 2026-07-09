'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export interface Company {
  id: string;
  name: string;
  code: string;
  logo_url?: string | null;
}

export interface Profile {
  id: string;
  email: string;
  company_id: string;
  role: 'admin' | 'moderator' | 'site_manager';
  full_name?: string | null;
  assigned_location_id?: string | null;
  assigned_location_ids?: string[] | null;
}

interface TenantSessionContextType {
  profile: Profile | null;
  company: Company | null;
  companyId: string | null;
  role: 'admin' | 'moderator' | 'site_manager' | null;
  isLoading: boolean;
}

const TenantSessionContext = createContext<TenantSessionContextType>({
  profile: null,
  company: null,
  companyId: null,
  role: null,
  isLoading: true,
});

export function TenantSessionProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('color_theme') || 'blue';
      const themes: Record<string, string> = {
        blue: 'oklch(0.45 0.18 250)',
        default: 'oklch(0.35 0.12 340)',
        emerald: 'oklch(0.50 0.16 162)',
        violet: 'oklch(0.48 0.22 292)',
        amber: 'oklch(0.65 0.18 70)',
      };
      const fgs: Record<string, string> = {
        blue: 'oklch(0.985 0 0)',
        default: 'oklch(0.985 0 0)',
        emerald: 'oklch(0.985 0 0)',
        violet: 'oklch(0.985 0 0)',
        amber: 'oklch(0.145 0 0)',
      };
      const theme = themes[saved];
      const fg = fgs[saved];
      if (theme) {
        document.documentElement.style.setProperty('--primary', theme);
        document.documentElement.style.setProperty('--primary-foreground', fg);
        document.documentElement.style.setProperty('--ring', theme);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const storedProfile = localStorage.getItem('tenant_session');
        const storedCompany = localStorage.getItem('tenant_company');
        
        if (storedProfile && storedCompany) {
          setProfile(JSON.parse(storedProfile));
          setCompany(JSON.parse(storedCompany));
          setIsLoading(false);
        }

        // Verify and sync via Supabase Database and Auth Session in the background
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: prof, error: profError } = await supabase
            .from('profiles')
            .select('id, email, company_id, role, full_name, assigned_location_id, assigned_location_ids')
            .eq('id', session.user.id)
            .single();

          if (!profError && prof) {
            // Fetch company details if not already stored
            let comp = null;
            if (storedCompany) {
              comp = JSON.parse(storedCompany);
            } else {
              const { data: cData } = await supabase
                .from('companies')
                .select('id, name, code, logo_url')
                .eq('id', prof.company_id)
                .single();
              comp = cData;
            }

            // Detect if anything changed
            let needsUpdate = false;
            if (storedProfile) {
              const parsed = JSON.parse(storedProfile);
              if (
                parsed.role !== prof.role ||
                parsed.full_name !== prof.full_name ||
                parsed.assigned_location_id !== prof.assigned_location_id ||
                JSON.stringify(parsed.assigned_location_ids) !== JSON.stringify(prof.assigned_location_ids)
              ) {
                needsUpdate = true;
              }
            } else {
              needsUpdate = true;
            }

            if (needsUpdate) {
              localStorage.setItem('tenant_session', JSON.stringify(prof));
              if (comp) localStorage.setItem('tenant_company', JSON.stringify(comp));
              setProfile(prof as Profile);
              if (comp) setCompany(comp as Company);

              // Dynamically call server action to update cookied session token
              const { syncSessionCookie } = await import('@/app/users/actions');
              await syncSessionCookie();
            }
          } else if (profError && !storedProfile) {
            router.push('/login/setup-error');
          }
        } else {
          setProfile(null);
          setCompany(null);
        }
      } catch (e) {
        console.error("Error loading tenant session:", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [router]);

  return (
    <TenantSessionContext.Provider value={{
      profile,
      company,
      companyId: profile?.company_id || null,
      role: profile?.role || null,
      isLoading
    }}>
      {children}
    </TenantSessionContext.Provider>
  );
}

export function useTenantSession() {
  return useContext(TenantSessionContext);
}
