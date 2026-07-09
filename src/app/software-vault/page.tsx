'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Code2, Search, AlertTriangle, Loader2,
  ExternalLink, Key, Users, Calendar, ShieldAlert
} from 'lucide-react';
import { getSoftwareItems } from './actions';
import { useTenantSession } from '@/lib/TenantSessionContext';

function getSpec(specs: any[], key: string) {
  return specs?.find((s: any) => s.spec_key === key)?.spec_value || null;
}

function daysUntilExpiry(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function SoftwareVaultPage() {
  const { profile } = useTenantSession();
  const userRole = profile?.role || 'moderator';

  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userRole === 'site_manager') {
      setIsLoading(false);
      return;
    }
    async function load() {
      setIsLoading(true);
      try {
        const data = await getSoftwareItems();
        setItems(data);
      } catch (e: any) {
        setError(e.message || 'Failed to load software items.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [userRole]);

  if (userRole === 'site_manager') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4 animate-in fade-in duration-300">
        <div className="h-16 w-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-primary">Restricted Access</h2>
        <p className="text-muted-foreground max-w-md">
          The Software Vault is restricted to IT administrators and moderators. You do not have permission to view or manage software licenses.
        </p>
      </div>
    );
  }

  const filtered = items.filter(item =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.item_categories?.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2.5">
            <Code2 className="h-8 w-8" /> Software Vault
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage software licenses, seat allocations, and installer binaries.
          </p>
        </div>
        <Link href="/inventory/add">
          <Button className="gap-2 shrink-0">
            <Code2 className="h-4 w-4" /> Register Software
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search software by name or type..."
          className="pl-10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Error / Loading / Grid */}
      {error && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-4 rounded-xl text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Setup Required</p>
            <p className="text-xs">Run <code className="bg-amber-100 px-1 rounded">supabase/feature3_schema.sql</code> and <code className="bg-amber-100 px-1 rounded">feature4_schema.sql</code> first.</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
          <p>Loading software vault...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Code2 className="h-14 w-14 text-muted/40 mb-4" />
          <p className="text-xl font-bold text-primary mb-2">
            {search ? 'No Matches Found' : 'No Software Registered'}
          </p>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm">
            {search
              ? 'Try a different search term.'
              : 'Add items with "Software" classification via the Add Asset wizard.'}
          </p>
          {!search && (
            <Link href="/inventory/add">
              <Button variant="outline">Register First Software</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(item => {
            const specs = item.inventory_specs || [];
            const licenseKey = getSpec(specs, 'License_Key');
            const expiryRaw = getSpec(specs, 'Expiry_Date');
            const totalSeats = item.quantity || 1;
            const version = getSpec(specs, 'Version');
            const days = daysUntilExpiry(expiryRaw);
            const isExpired = days !== null && days < 0;
            const isExpiringSoon = days !== null && days >= 0 && days <= 30;

            return (
              <Card key={item.id} className={`border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group ${isExpired ? 'border-destructive/40' : 'border-muted/50'}`}>
                <CardHeader className={`pb-3 pt-4 px-5 ${isExpired ? 'bg-destructive/5' : 'bg-muted/5'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isExpired ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                        <Code2 className={`h-5 w-5 ${isExpired ? 'text-destructive' : 'text-primary'}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.item_categories?.name}</p>
                      </div>
                    </div>
                    {isExpired && (
                      <Badge className="bg-destructive/10 text-destructive border-none shrink-0 gap-1">
                        <ShieldAlert size={11} /> Expired
                      </Badge>
                    )}
                    {isExpiringSoon && !isExpired && (
                      <Badge className="bg-amber-100 text-amber-700 border-none shrink-0">
                        Expiring Soon
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="px-5 pt-4 pb-5 space-y-4">
                  {/* Seat Utilization Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground flex items-center gap-1"><Users size={11} />Seat Utilization</span>
                      <span className="font-semibold">— / {totalSeats}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: '0%' }} />
                    </div>
                  </div>

                  {/* Meta info */}
                  <div className="space-y-1.5 text-xs">
                    {licenseKey && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Key size={11} />
                        <span className="font-mono">••••••••••</span>
                        <span className="text-muted-foreground/60">(key stored)</span>
                      </div>
                    )}
                    {version && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Code2 size={11} />
                        <span>v{version}</span>
                      </div>
                    )}
                    {expiryRaw && (
                      <div className={`flex items-center gap-2 ${isExpired ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                        <Calendar size={11} />
                        <span>
                          {isExpired ? 'Expired' : 'Expires'}: {new Date(expiryRaw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {days !== null && !isExpired && <span className="ml-1 text-amber-600">({days}d left)</span>}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className={`text-xs font-semibold border-none ${item.status_state === 'New' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                      {item.status_state}
                    </Badge>
                    <Link href={`/software-vault/${item.id}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs hover:bg-primary hover:text-primary-foreground">
                        Open Passport <ExternalLink size={11} />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
