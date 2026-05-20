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
  role: 'admin' | 'moderator';
  full_name?: string | null;
}

interface TenantSessionContextType {
  profile: Profile | null;
  company: Company | null;
  companyId: string | null;
  role: 'admin' | 'moderator' | null;
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
    const loadSession = async () => {
      try {
        const storedProfile = localStorage.getItem('tenant_session');
        const storedCompany = localStorage.getItem('tenant_company');
        
        if (storedProfile && storedCompany) {
          setProfile(JSON.parse(storedProfile));
          setCompany(JSON.parse(storedCompany));
          setIsLoading(false);
          return;
        }

        // If not in localStorage, verify via Supabase Session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: prof, error: profError } = await supabase
            .from('profiles')
            .select('id, email, company_id, role, full_name')
            .eq('id', session.user.id)
            .single();

          if (!profError && prof) {
            // Fetch company details
            const { data: comp, error: compError } = await supabase
              .from('companies')
              .select('id, name, code, logo_url')
              .eq('id', prof.company_id)
              .single();

            if (!compError && comp) {
              localStorage.setItem('tenant_session', JSON.stringify(prof));
              localStorage.setItem('tenant_company', JSON.stringify(comp));
              setProfile(prof as Profile);
              setCompany(comp as Company);
            } else {
              setProfile(prof as Profile);
            }
          } else {
            // Profile missing: Redirect to setup-error
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
