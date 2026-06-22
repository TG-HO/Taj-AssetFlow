'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  PackagePlus, 
  List, 
  Settings, 
  Laptop, 
  LogOut, 
  ChevronUp, 
  User, 
  Download, 
  Database,
  MapPin,
  Users,
  Palette,
  Bell,
  Shield,
  Code2,
  Package
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { logout } from '@/app/login/actions';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

const SETTINGS_NAV = [
  { label: 'Location Settings', tab: 'locations', icon: MapPin },
  { label: 'Appearance', tab: 'appearance', icon: Palette },
  { label: 'Notifications', tab: 'notifications', icon: Bell },
  { label: 'Security', tab: 'security', icon: Shield },
];

export function Sidebar({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, company, isLoading } = useTenantSession();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsFlyout, setShowSettingsFlyout] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoPassports, setAutoPassports] = useState(true);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  // Timer ref for 500ms delay on settings flyout close
  const settingsLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem('pref_email_alerts');
    const savedPassports = localStorage.getItem('pref_auto_passports');
    if (savedEmail !== null) setEmailAlerts(savedEmail === 'true');
    if (savedPassports !== null) setAutoPassports(savedPassports === 'true');
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSettingsMouseEnter = () => {
    if (settingsLeaveTimer.current) clearTimeout(settingsLeaveTimer.current);
    setShowSettingsFlyout(true);
  };

  const handleSettingsMouseLeave = () => {
    settingsLeaveTimer.current = setTimeout(() => {
      setShowSettingsFlyout(false);
    }, 500);
  };

  const handleSavePreferences = () => {
    localStorage.setItem('pref_email_alerts', String(emailAlerts));
    localStorage.setItem('pref_auto_passports', String(autoPassports));
    setShowProfileModal(false);
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.from('assets').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        alert('No assets found to export.');
        setIsExporting(false);
        return;
      }

      const headers = ['Laptop Name', 'Serial Number', 'RAM', 'Storage Type', 'Storage Capacity', 'Assigned To', 'Location', 'Status', 'Old Username', 'Purchase Date', 'Issue Date', 'Details'];
      const csvContent = [
        headers.join(','),
        ...data.map(item => [
          `"${item.laptop_name || ''}"`,
          `"${item.serial_number || ''}"`,
          `"${item.ram || ''}"`,
          `"${item.storage_type || ''}"`,
          `"${item.storage_capacity || ''}"`,
          `"${item.assigned_to || ''}"`,
          `"${item.location || ''}"`,
          `"${item.status || ''}"`,
          `"${item.old_username || ''}"`,
          `"${item.purchase_date || ''}"`,
          `"${item.issue_date || ''}"`,
          `"${(item.details || '').replace(/"/g, '""')}"`,
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `taj_inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert('Error exporting data: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('tenant_session');
      localStorage.removeItem('tenant_company');
      await supabase.auth.signOut();
    } catch (_) {}
    await logout();
    router.push('/login');
  };

  const links = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'View Inventory', href: '/inventory', icon: List },
    { name: 'Consumables', href: '/inventory/consumables', icon: Package },
    { name: 'Faulty / Damaged', href: '/inventory/faulty', icon: List },
    { name: 'Add Asset', href: '/inventory/add', icon: PackagePlus },
    { name: 'Software Vault', href: '/software-vault', icon: Code2 },
  ];

  if (userRole === 'admin') {
    links.push({ name: 'Admin Logs', href: '/admin-logs', icon: List });
  }

  const profileName = profile?.full_name || profile?.email?.split('@')[0] || '';

  return (
    <>
      <aside className="w-64 h-screen bg-white border-r border-border flex flex-col fixed left-0 top-0 z-40 shadow-sm">
        {/* Logo */}
        <div className="p-6 flex items-center gap-3 border-b border-border/50">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-md">
            <Laptop size={24} />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-primary">Taj AssetFlow</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">IT Inventory</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = link.href === '/'
              ? pathname === '/'
              : pathname.startsWith(link.href);

            return (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                )}
              >
                <Icon size={18} />
                <span>{link.name}</span>
              </Link>
            );
          })}

          {/* Settings nav item with hover flyout */}
          <div
            className="relative"
            onMouseEnter={handleSettingsMouseEnter}
            onMouseLeave={handleSettingsMouseLeave}
          >
            <button
              type="button"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm font-medium w-full',
                pathname.startsWith('/settings')
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
              )}
              onClick={handleSettingsMouseEnter}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>

            {/* Settings Flyout Submenu */}
            {showSettingsFlyout && (
              <div
                className="absolute left-full top-0 ml-2 w-52 bg-white border border-border rounded-xl shadow-xl py-2 z-50 animate-in slide-in-from-left-2 fade-in duration-150"
                onMouseEnter={handleSettingsMouseEnter}
                onMouseLeave={handleSettingsMouseLeave}
              >
                <p className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  Settings
                </p>
                {SETTINGS_NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.tab}
                      href={`/settings?tab=${item.tab}`}
                      onClick={() => setShowSettingsFlyout(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md mx-1 transition-colors font-medium"
                      style={{ width: 'calc(100% - 8px)' }}
                    >
                      <Icon size={15} />
                      {item.label}
                    </Link>
                  );
                })}
                {userRole === 'admin' && (
                  <>
                    <div className="my-1.5 mx-3 border-t border-border/50" />
                    <Link
                      href="/settings?tab=users"
                      onClick={() => setShowSettingsFlyout(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md mx-1 transition-colors font-medium"
                      style={{ width: 'calc(100% - 8px)' }}
                    >
                      <Users size={15} />
                      User Management
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* User Profile Card */}
        <div className="p-4 border-t border-border/50 relative" ref={profileMenuRef}>
          {showProfileMenu && (
            <div className="absolute bottom-[4.5rem] left-4 right-4 bg-white border border-border rounded-xl shadow-xl p-1.5 z-50 animate-in slide-in-from-bottom-2 duration-150 flex flex-col gap-0.5">
              <button
                onClick={() => { setShowProfileMenu(false); setShowProfileModal(true); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors text-left font-medium"
              >
                <User size={15} />
                <span>Profile Settings</span>
              </button>
              <div className="border-t border-border/50 my-0.5" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors text-left font-medium"
              >
                <LogOut size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          )}

          <div
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center justify-between p-2.5 rounded-xl border border-border/50 hover:bg-muted/50 cursor-pointer transition-all duration-200 select-none bg-muted/20"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0 border border-primary/20">
                {profileName ? profileName.slice(0, 2).toUpperCase() : 'U'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">
                  {profileName || 'Loading...'}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  {profile?.role || 'Moderator'}
                </span>
              </div>
            </div>
            <ChevronUp
              size={15}
              className={cn(
                'text-muted-foreground transition-transform duration-200 shrink-0',
                showProfileMenu ? 'rotate-180' : ''
              )}
            />
          </div>
        </div>
      </aside>

      {/* ─── Global Profile Settings Dialog ─── */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="sm:max-w-[480px] p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-primary flex items-center gap-2">
              <User className="h-5 w-5" /> Profile Settings
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 my-4">
            {/* Org Profile */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                Organization Profile
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name" className="text-xs">Organization Name</Label>
                  <Input id="org-name" value={isLoading ? 'Loading...' : (company?.name || 'Unknown Company')} disabled className="bg-muted/50" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email" className="text-xs">User Email</Label>
                  <Input id="admin-email" value={isLoading ? 'Loading...' : (profile?.email || '')} disabled className="bg-muted/50" type="email" />
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                System Preferences
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/10">
                  <div className="flex flex-col space-y-0.5">
                    <Label className="text-sm font-medium">Email Alerts</Label>
                    <span className="text-xs text-muted-foreground">Receive weekly inventory summary reports.</span>
                  </div>
                  <Checkbox checked={emailAlerts} onCheckedChange={(c) => setEmailAlerts(!!c)} className="h-5 w-5" />
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/10">
                  <div className="flex flex-col space-y-0.5">
                    <Label className="text-sm font-medium">Auto-generate Passports</Label>
                    <span className="text-xs text-muted-foreground">Automatically format passport views for printing.</span>
                  </div>
                  <Checkbox checked={autoPassports} onCheckedChange={(c) => setAutoPassports(!!c)} className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Data Management */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                Data Management
              </h4>
              <div className="p-4 border border-primary/10 rounded-lg bg-primary/5 flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <Database className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Export all asset details, serial numbers, allocation histories, and status logs into a single CSV spreadsheet.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 bg-background border-primary/20 hover:bg-primary/10 hover:text-primary text-xs"
                  onClick={handleExportCSV}
                  disabled={isExporting}
                >
                  <Download className="h-3.5 w-3.5" />
                  {isExporting ? 'Generating CSV...' : 'Export Inventory as CSV'}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6 flex gap-2">
            <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
            <Button type="button" onClick={handleSavePreferences}>Save Settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
