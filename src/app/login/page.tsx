'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Laptop, ShieldAlert, Mail, Lock, Building2, Eye, EyeOff, Search, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSession } from './actions';
import { supabase } from '@/lib/supabase';

interface Company {
  id: string;
  name: string;
  code: string;
  logo_url?: string | null;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCompanyOpen, setIsCompanyOpen] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function fetchCompanies() {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name, code, logo_url')
          .eq('is_active', true)
          .order('name', { ascending: true });
        
        if (!error && data) {
          setCompanies(data);
          if (data.length > 0) {
            setSelectedCompanyId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load companies:", err);
      }
    }
    fetchCompanies();
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    try {
      // 1. Authenticate credentials via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !authData.user) {
        setError(authError?.message || 'Invalid email or password');
        setIsLoading(false);
        return;
      }

      // 2. Fetch profile from the database
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, company_id, role, full_name')
        .eq('id', authData.user.id)
        .single();

      if (profileError || !profile) {
        // Redirection for missing user profiles
        router.push('/login/setup-error');
        setIsLoading(false);
        return;
      }

      // 3. Cross-Validation: Match chosen company ID
      if (profile.company_id !== selectedCompanyId) {
        // Log out immediately
        await supabase.auth.signOut();
        triggerToast("Access Denied: You do not belong to the selected company.");
        setIsLoading(false);
        return;
      }

      // 4. Session Locking & Success flow
      const selectedCompany = companies.find(c => c.id === selectedCompanyId);
      
      localStorage.setItem('tenant_session', JSON.stringify(profile));
      if (selectedCompany) {
        localStorage.setItem('tenant_company', JSON.stringify(selectedCompany));
      }

      const sessionResult = await createSession({
        id: profile.id,
        username: profile.full_name || profile.email,
        role: profile.role,
        company_id: profile.company_id
      });

      if (sessionResult.success) {
        // Redirect to dashboard
        router.push('/');
        router.refresh();
      } else {
        setError(sessionResult.error || 'Failed to establish local session');
        await supabase.auth.signOut();
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted/20 absolute inset-0 z-[100] px-4">
      {/* Floating alert toast */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 bg-destructive text-destructive-foreground rounded-xl shadow-xl animate-in fade-in slide-in-from-top-5 duration-300 max-w-md w-full sm:w-auto mx-4">
          <ShieldAlert className="h-5 w-5 text-destructive-foreground/90 flex-shrink-0 animate-pulse" />
          <span className="text-sm font-semibold tracking-wide">{toastMessage}</span>
        </div>
      )}

      <Card className="w-full max-w-md shadow-lg border-primary/10 bg-card text-card-foreground overflow-hidden relative">
        <CardHeader className="space-y-4 items-center text-center pb-6 border-b border-border/50">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md">
            <Laptop size={26} />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight text-primary">
              Taj AssetFlow
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium">
              V2.0 Multi-Tenant IT Inventory
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <Building2 size={14} className="text-primary" />
                Select Tenant Company
              </Label>
              <div className="relative">
                <button
                  id="company"
                  type="button"
                  onClick={() => setIsCompanyOpen(!isCompanyOpen)}
                  disabled={companies.length === 0}
                  className="w-full flex items-center justify-between rounded-lg border border-input bg-card text-card-foreground px-3 py-2 text-sm shadow-sm transition-colors focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 h-10 font-medium text-left cursor-pointer"
                >
                  <span className="truncate">
                    {companies.find(c => c.id === selectedCompanyId) 
                      ? `${companies.find(c => c.id === selectedCompanyId)?.name} (${companies.find(c => c.id === selectedCompanyId)?.code})`
                      : (companies.length === 0 ? "Loading companies..." : "Select Company")}
                  </span>
                  <ChevronDown size={16} className="text-muted-foreground ml-2 flex-shrink-0" />
                </button>

                {isCompanyOpen && (
                  <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => { setIsCompanyOpen(false); setCompanySearch(''); }} />
                    
                    {/* Popover content */}
                    <div className="absolute left-0 right-0 mt-1 rounded-lg border bg-popover text-popover-foreground shadow-md z-50 p-2 space-y-2 max-h-60 overflow-hidden flex flex-col font-normal">
                      <div className="relative flex-shrink-0">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                          placeholder="Search company..."
                          value={companySearch}
                          onChange={(e) => setCompanySearch(e.target.value)}
                          className="pl-8 h-8 text-xs focus-visible:ring-primary/50"
                          autoFocus
                        />
                      </div>
                      
                      <div className="overflow-y-auto space-y-0.5 text-xs flex-1 max-h-40">
                        {companies
                          .filter(company => 
                            company.name.toLowerCase().includes(companySearch.toLowerCase()) || 
                            company.code.toLowerCase().includes(companySearch.toLowerCase())
                          )
                          .map((company) => (
                            <button
                              key={company.id}
                              type="button"
                              onClick={() => {
                                setSelectedCompanyId(company.id);
                                setIsCompanyOpen(false);
                                setCompanySearch('');
                              }}
                              className={cn(
                                "w-full text-left px-2.5 py-2 rounded-md transition-colors flex items-center justify-between truncate",
                                selectedCompanyId === company.id ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-muted"
                              )}
                            >
                              <span className="truncate">{company.name} ({company.code})</span>
                              {selectedCompanyId === company.id && <Check size={14} className="text-primary flex-shrink-0 ml-2" />}
                            </button>
                          ))
                        }
                        {companies.filter(company => 
                          company.name.toLowerCase().includes(companySearch.toLowerCase()) || 
                          company.code.toLowerCase().includes(companySearch.toLowerCase())
                        ).length === 0 && (
                          <div className="text-muted-foreground text-center py-2">No companies found</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <Mail size={14} className="text-primary" />
                Email Address
              </Label>
              <Input 
                id="email" 
                type="email"
                placeholder="name@company.com"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                className="focus:ring-primary/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-muted-foreground text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <Lock size={14} className="text-primary" />
                Password
              </Label>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••"
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  className="focus:ring-primary/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <ShieldAlert size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full mt-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold shadow-sm transition-colors py-5 rounded-lg"
              disabled={isLoading || companies.length === 0}
            >
              {isLoading ? 'Verifying Session...' : 'Secure Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
