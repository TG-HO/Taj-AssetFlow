'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Plus, 
  Trash2, 
  ChevronDown, 
  Loader2, 
  AlertTriangle, 
  AlertCircle,
  Building,
  Edit,
  ArrowLeft,
  Info,
  MoreVertical,
  UserPlus,
  Users,
  Shield,
  User,
  Eye,
  EyeOff,
  Palette,
  Bell,
  Check,
  Upload,
  Wifi,
  DollarSign,
  Activity
} from "lucide-react";
import { supabase } from '@/lib/supabase';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { toast } from '@/components/ui/toast';
import {
  getIspInventory,
  addIspRecord,
  updateIspRecord,
  deleteIspRecord
} from './isp-actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  addLocation, 
  addSubLocation, 
  addWarehouse, 
  deleteLocation, 
  deleteSubLocation, 
  deleteWarehouse,
  updateLocation,
  updateSubLocation,
  updateWarehouse
} from '../inventory/actions';
import { getUsers, createUser, deleteUser, updateUser } from '../users/actions';

// ─── Color Themes ───────────────────────────────────────────────────
const COLOR_THEMES = [
  {
    id: 'blue',
    name: 'Ocean Blue',
    primary: 'oklch(0.45 0.18 250)',
    primaryFg: 'oklch(0.985 0 0)',
    swatch: '#3b82f6',
  },
  {
    id: 'default',
    name: 'Crimson Red',
    primary: 'oklch(0.35 0.12 340)',
    primaryFg: 'oklch(0.985 0 0)',
    swatch: '#be123c',
  },
  {
    id: 'emerald',
    name: 'Emerald Green',
    primary: 'oklch(0.50 0.16 162)',
    primaryFg: 'oklch(0.985 0 0)',
    swatch: '#10b981',
  },
  {
    id: 'violet',
    name: 'Violet Purple',
    primary: 'oklch(0.48 0.22 292)',
    primaryFg: 'oklch(0.985 0 0)',
    swatch: '#7c3aed',
  },
  {
    id: 'amber',
    name: 'Amber Orange',
    primary: 'oklch(0.65 0.18 70)',
    primaryFg: 'oklch(0.145 0 0)',
    swatch: '#f59e0b',
  },
];

const LIMIT_OPTIONS = [
  { value: '50', label: '50 MB' },
  { value: '100', label: '100 MB' },
  { value: '250', label: '250 MB' },
  { value: '500', label: '500 MB' },
  { value: '1000', label: '1 GB' },
  { value: '2000', label: '2 GB' },
  { value: '5000', label: '5 GB' },
];

function applyTheme(themeId: string) {
  const theme = COLOR_THEMES.find(t => t.id === themeId);
  if (!theme) return;
  const root = document.documentElement;
  // Set directly as full oklch() values on :root
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-foreground', theme.primaryFg);
  // Also update the ring to match
  root.style.setProperty('--ring', theme.primary);
  localStorage.setItem('color_theme', themeId);
}

// ─── Viewport-aware dropdown hook ───────────────────────────────────
interface DropdownPos { top: number; left: number; openUp: boolean }

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
        <span className="text-sm">Loading settings...</span>
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { company, profile, isLoading } = useTenantSession();
  const userRole = profile?.role || 'moderator';

  // Tabs
  const [activeTab, setActiveTab] = useState('locations');
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  // Locations state
  const [locations, setLocations] = useState<any[]>([]);
  const [isLocLoading, setIsLocLoading] = useState(false);

  // Viewport-aware dropdown state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<DropdownPos>({ top: 0, left: 0, openUp: false });
  const floatingMenuRef = useRef<HTMLDivElement>(null);
  // Header hover delay timer
  const headerHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Viewport-aware dropdown state
  const router = useRouter();
  const searchParams = useSearchParams();

  // Sub-view Level
  const [locView, setLocView] = useState<'list' | 'sub-locations' | 'warehouses' | 'isp'>('list');
  const [selectedLoc, setSelectedLoc] = useState<any | null>(null);

  // ISP connectivity state
  const [ispRecords, setIspRecords] = useState<any[]>([]);
  const [isIspLoading, setIsIspLoading] = useState(false);
  const [ispProvider, setIspProvider] = useState('');
  const [ispPackage, setIspPackage] = useState('');
  const [ispBandwidth, setIspBandwidth] = useState(10);
  const [ispCost, setIspCost] = useState(0);
  const [isAddingIsp, setIsAddingIsp] = useState(false);

  // Modal visibility
  const [isAddLocOpen, setIsAddLocOpen] = useState(false);
  const [isEditLocOpen, setIsEditLocOpen] = useState(false);
  const [isAddSubOpen, setIsAddSubOpen] = useState(false);
  const [isEditSubOpen, setIsEditSubOpen] = useState(false);
  const [isAddWhOpen, setIsAddWhOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; username: string } | null>(null);
  const [isEditWhOpen, setIsEditWhOpen] = useState(false);

  // Loc form
  const [newLocName, setNewLocName] = useState('');
  const [newLocAddress, setNewLocAddress] = useState('');
  const [isAddingLoc, setIsAddingLoc] = useState(false);
  const [editLocId, setEditLocId] = useState('');
  const [editLocName, setEditLocName] = useState('');
  const [editLocAddress, setEditLocAddress] = useState('');
  const [isEditingLoc, setIsEditingLoc] = useState(false);

  // Sub form
  const [newSubName, setNewSubName] = useState('');
  const [newSubCost, setNewSubCost] = useState('');
  const [isAddingSub, setIsAddingSub] = useState(false);
  const [editSubId, setEditSubId] = useState('');
  const [editSubName, setEditSubName] = useState('');
  const [editSubCost, setEditSubCost] = useState('');
  const [isEditingSub, setIsEditingSub] = useState(false);

  // Wh form
  const [newWhName, setNewWhName] = useState('');
  const [newWhRack, setNewWhRack] = useState('');
  const [isAddingWh, setIsAddingWh] = useState(false);
  const [editWhId, setEditWhId] = useState('');
  const [editWhName, setEditWhName] = useState('');
  const [editWhRack, setEditWhRack] = useState('');
  const [isEditingWh, setIsEditingWh] = useState(false);

  // Error / confirm dialogs
  const [isErrorOpen, setIsErrorOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deleteConfirmLoc, setDeleteConfirmLoc] = useState<any | null>(null);
  const [isDeletingLoc, setIsDeletingLoc] = useState(false);
  const [deleteConfirmSub, setDeleteConfirmSub] = useState<any | null>(null);
  const [deleteConfirmWh, setDeleteConfirmWh] = useState<any | null>(null);

  // Users
  const [users, setUsers] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState('moderator');
  const [newUserLocationId, setNewUserLocationId] = useState('');
  const [newUserLocationIds, setNewUserLocationIds] = useState<string[]>([]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newFullName, setNewFullName] = useState('');

  // Edit User states
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editUserRole, setEditUserRole] = useState('moderator');
  const [editUserLocationId, setEditUserLocationId] = useState('');
  const [editUserLocationIds, setEditUserLocationIds] = useState<string[]>([]);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [editUserFullName, setEditUserFullName] = useState('');

  // Appearance
  const [activeTheme, setActiveTheme] = useState('blue');

  // Upload limit settings
  const [uploadLimit, setUploadLimit] = useState('500');

  const tabParam = searchParams.get('tab');
  // Reactively read tab from URL — works on mount AND when URL changes within the page
  useEffect(() => {
    if (userRole === 'site_manager') {
      setActiveTab('appearance');
    } else if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [tabParam, userRole]);

  // Restore saved theme and settings on mount only
  useEffect(() => {
    const saved = localStorage.getItem('color_theme') || 'blue';
    setActiveTheme(saved);
    applyTheme(saved);

    const savedLimit = localStorage.getItem('software_upload_limit') || '500';
    setUploadLimit(savedLimit);
  }, []);

  const handleUploadLimitChange = (val: string) => {
    setUploadLimit(val);
    localStorage.setItem('software_upload_limit', val);
  };

  // Close dropdown on outside click — check ref so menu clicks don't self-close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (floatingMenuRef.current && floatingMenuRef.current.contains(e.target as Node)) return;
      setOpenMenuId(null);
    }
    if (openMenuId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [openMenuId]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsHeaderHovered(false);
    router.push(`/settings?tab=${tab}`, { scroll: false });
  };

  // ── Locations fetch ──────────────────────────────────────────────
  const fetchLocationsData = useCallback(async () => {
    setIsLocLoading(true);
    try {
      const [{ data: locs }, { data: subs }, { data: whs }] = await Promise.all([
        supabase.from('locations').select('*').order('name'),
        supabase.from('sub_locations').select('*').order('name'),
        supabase.from('warehouses').select('*').order('name'),
      ]);
      const mapped = (locs || []).map((loc: any) => ({
        ...loc,
        subLocations: subs?.filter((s: any) => s.location_id === loc.id) || [],
        warehouses: whs?.filter((w: any) => w.location_id === loc.id) || [],
      }));
      setLocations(mapped);
      if (selectedLoc) {
        const updated = mapped.find(l => l.id === selectedLoc.id);
        if (updated) setSelectedLoc(updated);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsErrorOpen(true);
    } finally {
      setIsLocLoading(false);
    }
  }, [selectedLoc]);

  const fetchUsersData = useCallback(async () => {
    setIsUsersLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err: any) {
      setErrorMsg(err.message);
      setIsErrorOpen(true);
    } finally {
      setIsUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'locations') fetchLocationsData();
    else if (activeTab === 'users' && userRole === 'admin') fetchUsersData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userRole]);

  // ── Viewport-aware menu trigger ──────────────────────────────────
  const handleMenuOpen = (e: React.MouseEvent<HTMLButtonElement>, locId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuHeight = 200; // approximate
    const openUp = spaceBelow < menuHeight;
    setMenuPos({
      top: openUp ? rect.top - menuHeight + window.scrollY : rect.bottom + window.scrollY + 4,
      left: rect.right - 192, // 192 = w-48
      openUp,
    });
    setOpenMenuId(prev => prev === locId ? null : locId);
  };

  // ── Location CRUD ────────────────────────────────────────────────
  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocName.trim()) return;
    setIsAddingLoc(true);
    const result = await addLocation(newLocName, newLocAddress);
    setIsAddingLoc(false);
    if (result.success) { setNewLocName(''); setNewLocAddress(''); setIsAddLocOpen(false); fetchLocationsData(); }
    else { setErrorMsg(result.error || 'Failed to add location'); setIsErrorOpen(true); }
  };

  const handleEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLocName.trim()) return;
    setIsEditingLoc(true);
    const result = await updateLocation(editLocId, editLocName, editLocAddress);
    setIsEditingLoc(false);
    if (result.success) { setIsEditLocOpen(false); fetchLocationsData(); }
    else { setErrorMsg(result.error || 'Failed to update location'); setIsErrorOpen(true); }
  };

  const handleConfirmDeleteLocation = async () => {
    if (!deleteConfirmLoc) return;
    setIsDeletingLoc(true);
    const result = await deleteLocation(deleteConfirmLoc.id);
    setIsDeletingLoc(false);
    setDeleteConfirmLoc(null);
    if (result.success) fetchLocationsData();
    else { setErrorMsg(result.error || 'Failed to delete location'); setIsErrorOpen(true); }
  };

  // ── Sub-location CRUD ────────────────────────────────────────────
  const handleAddSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoc || !newSubName.trim()) return;
    setIsAddingSub(true);
    const result = await addSubLocation(selectedLoc.id, newSubName, newSubCost);
    setIsAddingSub(false);
    if (result.success) { setNewSubName(''); setNewSubCost(''); setIsAddSubOpen(false); fetchLocationsData(); }
    else { setErrorMsg(result.error || 'Failed to add department'); setIsErrorOpen(true); }
  };

  const handleEditSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSubName.trim()) return;
    setIsEditingSub(true);
    const result = await updateSubLocation(editSubId, editSubName, editSubCost);
    setIsEditingSub(false);
    if (result.success) { setIsEditSubOpen(false); fetchLocationsData(); }
    else { setErrorMsg(result.error || 'Failed to update department'); setIsErrorOpen(true); }
  };

  const handleDeleteSub = async (sub: any) => {
    const result = await deleteSubLocation(sub.id);
    setDeleteConfirmSub(null);
    if (result.success) fetchLocationsData();
    else { setErrorMsg(result.error || 'Failed to delete department'); setIsErrorOpen(true); }
  };

  // ── Warehouse CRUD ───────────────────────────────────────────────
  const handleAddWh = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoc || !newWhName.trim()) return;
    setIsAddingWh(true);
    const result = await addWarehouse(selectedLoc.id, newWhName, newWhRack);
    setIsAddingWh(false);
    if (result.success) { setNewWhName(''); setNewWhRack(''); setIsAddWhOpen(false); fetchLocationsData(); }
    else { setErrorMsg(result.error || 'Failed to add warehouse'); setIsErrorOpen(true); }
  };

  const handleEditWh = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editWhName.trim()) return;
    setIsEditingWh(true);
    const result = await updateWarehouse(editWhId, editWhName, editWhRack);
    setIsEditingWh(false);
    if (result.success) { setIsEditWhOpen(false); fetchLocationsData(); }
    else { setErrorMsg(result.error || 'Failed to update warehouse'); setIsErrorOpen(true); }
  };

  const handleDeleteWh = async (wh: any) => {
    const result = await deleteWarehouse(wh.id);
    setDeleteConfirmWh(null);
    if (result.success) fetchLocationsData();
    else { setErrorMsg(result.error || 'Failed to delete warehouse'); setIsErrorOpen(true); }
  };

  // ── ISP connectivity CRUD ──────────────────────────────────────────
  const fetchIspRecords = useCallback(async (locationId: string) => {
    setIsIspLoading(true);
    const res = await getIspInventory(locationId);
    if (res.success) {
      setIspRecords(res.data);
    }
    setIsIspLoading(false);
  }, []);

  useEffect(() => {
    if (locView === 'isp' && selectedLoc) {
      fetchIspRecords(selectedLoc.id);
    }
  }, [locView, selectedLoc, fetchIspRecords]);

  const handleAddIsp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoc || !ispProvider.trim() || ispBandwidth < 1 || ispCost < 0) return;
    setIsAddingIsp(true);
    const res = await addIspRecord(selectedLoc.id, ispProvider.trim(), ispPackage.trim(), ispBandwidth, ispCost);
    setIsAddingIsp(false);
    if (res.success) {
      setIspProvider('');
      setIspPackage('');
      setIspBandwidth(10);
      setIspCost(0);
      fetchIspRecords(selectedLoc.id);
      toast('ISP connection recorded successfully.', 'success');
    } else {
      setErrorMsg(res.error || 'Failed to add ISP record');
      setIsErrorOpen(true);
    }
  };

  const handleDeleteIsp = async (id: string) => {
    const res = await deleteIspRecord(id);
    if (res.success) {
      if (selectedLoc) fetchIspRecords(selectedLoc.id);
      toast('ISP record removed.', 'success');
    } else {
      setErrorMsg(res.error || 'Failed to delete ISP record');
      setIsErrorOpen(true);
    }
  };

  // ── User CRUD ────────────────────────────────────────────────────
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim()) {
      setErrorMsg('Full Name is required.');
      setIsErrorOpen(true);
      return;
    }
    setIsCreatingUser(true);
    const firstLocId = newUserLocationIds[0] || null;
    const result = await createUser(newUsername, newPassword, newUserRole, firstLocId, newUserLocationIds, newFullName.trim());
    setIsCreatingUser(false);
    if (result.success) { 
      setNewUsername(''); 
      setNewPassword(''); 
      setNewFullName('');
      setNewUserRole('moderator'); 
      setNewUserLocationId('');
      setNewUserLocationIds([]);
      fetchUsersData(); 
    }
    else { setErrorMsg(result.error || 'Failed to create user'); setIsErrorOpen(true); }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!editUserFullName.trim()) {
      setErrorMsg('Full Name is required.');
      setIsErrorOpen(true);
      return;
    }
    setIsUpdatingUser(true);
    const firstLocId = editUserLocationIds[0] || null;
    const result = await updateUser(editingUser.id, editUserRole, firstLocId, editUserLocationIds, editUserFullName.trim());
    setIsUpdatingUser(false);
    if (result.success) {
      setEditingUser(null);
      setEditUserFullName('');
      fetchUsersData();
    } else {
      setErrorMsg(result.error || 'Failed to update user');
      setIsErrorOpen(true);
    }
  };

  const handleDeleteUser = async (id: string) => {
    const result = await deleteUser(id);
    if (result.success) fetchUsersData();
    else { setErrorMsg(result.error || 'Failed to delete user'); setIsErrorOpen(true); }
  };

  // ── Header labels ────────────────────────────────────────────────
  const TAB_LABELS: Record<string, string> = {
    locations: 'Location Settings',
    users: 'User Management',
    appearance: 'Appearance',
    notifications: 'Notifications',
    security: 'Security',
  };
  const TAB_DESCS: Record<string, string> = {
    locations: 'Configure organization branches, departments, and inventory warehouses.',
    users: 'Manage administrative roles and access keys for staff members.',
    appearance: 'Customize the interface color palette and visual preferences.',
    notifications: 'Manage alerts, reports, and critical warning preferences.',
    security: 'Review security audits and authentication policies.',
  };
  const ALL_TABS = userRole === 'site_manager' ? [
    { id: 'appearance', label: 'Appearance', icon: Palette },
  ] : [
    { id: 'locations', label: 'Location Settings', icon: MapPin },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
    ...(userRole === 'admin' ? [{ id: 'users', label: 'User Management', icon: Users }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">

      {/* Header with hover-dropdown tab switcher */}
      <div
        className="relative inline-block"
        onMouseEnter={() => {
          if (headerHoverTimer.current) clearTimeout(headerHoverTimer.current);
          setIsHeaderHovered(true);
        }}
        onMouseLeave={() => {
          headerHoverTimer.current = setTimeout(() => setIsHeaderHovered(false), 400);
        }}
      >
        <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-1.5 cursor-pointer hover:opacity-85 select-none py-1">
          {TAB_LABELS[activeTab] || 'Settings'}
          <ChevronDown className="h-6 w-6 text-primary mt-1 transition-transform duration-200" />
        </h2>
        {isHeaderHovered && (
          <div className="absolute left-0 mt-1 w-60 bg-white border border-border rounded-xl shadow-xl py-2 z-40 animate-in fade-in slide-in-from-top-1 duration-150">
            {ALL_TABS.map((tab, idx) => {
              const Icon = tab.icon;
              const isFirst = idx === 0;
              const needsDivider = tab.id === 'users';
              return (
                <div key={tab.id}>
                  {needsDivider && <div className="my-1.5 mx-3 border-t border-border/50" />}
                  <button
                    onClick={() => handleTabChange(tab.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon size={15} />
                    {tab.label}
                    {activeTab === tab.id && <Check size={13} className="ml-auto" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-muted-foreground text-sm mt-0.5">{TAB_DESCS[activeTab]}</p>
      </div>

      <div className="mt-6">

        {/* ──────────────────────────────────────────────────────── */}
        {/* TAB: LOCATIONS                                          */}
        {/* ──────────────────────────────────────────────────────── */}
        {activeTab === 'locations' && (
          <div className="space-y-6">

            {/* TIER 1 */}
            {locView === 'list' && (
              <Card className="shadow-sm border border-muted/50 overflow-visible">
                <CardHeader className="flex flex-row justify-between items-center space-y-0 border-b pb-4 bg-muted/5">
                  <div>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Building className="h-5 w-5 text-primary" /> Corporate Locations
                    </CardTitle>
                    <CardDescription>Primary business branches and offices.</CardDescription>
                  </div>
                  <Button onClick={() => setIsAddLocOpen(true)} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" /> Add Location
                  </Button>
                </CardHeader>
                <CardContent className="p-0 overflow-visible">
                  {isLocLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                      <span className="text-sm">Loading locations...</span>
                    </div>
                  ) : locations.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Building className="h-12 w-12 mx-auto text-muted/50 mb-3" />
                      <p className="font-semibold text-lg text-primary">No Locations Configured</p>
                      <p className="text-sm mb-4">Set up primary offices to get started.</p>
                      <Button onClick={() => setIsAddLocOpen(true)} variant="outline">Create First Location</Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto overflow-y-visible">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent bg-muted/10">
                            <TableHead className="font-semibold text-foreground py-3">Location Name</TableHead>
                            <TableHead className="font-semibold text-foreground py-3">Address</TableHead>
                            <TableHead className="font-semibold text-foreground py-3">Departments</TableHead>
                            <TableHead className="font-semibold text-foreground py-3">Warehouses</TableHead>
                            <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {locations.map((loc) => (
                            <TableRow key={loc.id} className="hover:bg-muted/10">
                              <TableCell className="font-bold text-foreground py-3.5">{loc.name}</TableCell>
                              <TableCell className="text-muted-foreground text-sm py-3.5">{loc.address || '—'}</TableCell>
                              <TableCell className="py-3.5">
                                <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-semibold">
                                  {loc.subLocations.length} Departments
                                </Badge>
                              </TableCell>
                              <TableCell className="py-3.5">
                                <Badge variant="secondary" className="bg-secondary/10 text-secondary-foreground border-none font-semibold">
                                  {loc.warehouses.length} Warehouses
                                </Badge>
                              </TableCell>
                              <TableCell className="py-3.5 text-right">
                                <div className="inline-block">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => handleMenuOpen(e, loc.id)}
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* TIER 2: DEPARTMENTS */}
            {locView === 'sub-locations' && selectedLoc && (
              <div className="space-y-4">
                <Button variant="ghost" onClick={() => setLocView('list')} className="gap-2 hover:bg-muted text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Back to Locations
                </Button>
                <Card className="shadow-sm border border-muted/50">
                  <CardHeader className="flex flex-row justify-between items-center space-y-0 border-b pb-4 bg-muted/5">
                    <div>
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Building className="h-5 w-5 text-primary" /> Departments — {selectedLoc.name}
                      </CardTitle>
                      <CardDescription>Sub-locations and cost-center groups.</CardDescription>
                    </div>
                    <Button onClick={() => setIsAddSubOpen(true)} className="gap-2 shrink-0">
                      <Plus className="h-4 w-4" /> Add Department
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {selectedLoc.subLocations.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <p className="font-semibold text-base mb-2">No Departments Added</p>
                        <Button onClick={() => setIsAddSubOpen(true)} variant="outline">Add First Department</Button>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent bg-muted/10">
                            <TableHead className="font-semibold text-foreground py-3">Department Name</TableHead>
                            <TableHead className="font-semibold text-foreground py-3">Cost Center Code</TableHead>
                            <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedLoc.subLocations.map((sub: any) => (
                            <TableRow key={sub.id} className="hover:bg-muted/10">
                              <TableCell className="font-semibold text-foreground py-3">{sub.name}</TableCell>
                              <TableCell className="py-3">
                                {sub.cost_center_code
                                  ? <Badge className="bg-primary/10 text-primary border-none font-mono text-[11px]">{sub.cost_center_code}</Badge>
                                  : <span className="text-muted-foreground text-sm">None</span>}
                              </TableCell>
                              <TableCell className="py-3 text-right space-x-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  onClick={() => { setEditSubId(sub.id); setEditSubName(sub.name); setEditSubCost(sub.cost_center_code || ''); setIsEditSubOpen(true); }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteConfirmSub(sub)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* TIER 3: WAREHOUSES */}
            {locView === 'warehouses' && selectedLoc && (
              <div className="space-y-4">
                <Button variant="ghost" onClick={() => setLocView('list')} className="gap-2 hover:bg-muted text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Back to Locations
                </Button>
                <Card className="shadow-sm border border-muted/50">
                  <CardHeader className="flex flex-row justify-between items-center space-y-0 border-b pb-4 bg-muted/5">
                    <div>
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Building className="h-5 w-5 text-primary" /> Warehouses — {selectedLoc.name}
                      </CardTitle>
                      <CardDescription>Physical storage zones and rack layouts.</CardDescription>
                    </div>
                    <Button onClick={() => setIsAddWhOpen(true)} className="gap-2 shrink-0">
                      <Plus className="h-4 w-4" /> Add Warehouse
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    {selectedLoc.warehouses.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <p className="font-semibold text-base mb-2">No Warehouses Configured</p>
                        <Button onClick={() => setIsAddWhOpen(true)} variant="outline">Add First Warehouse</Button>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent bg-muted/10">
                            <TableHead className="font-semibold text-foreground py-3">Warehouse / Zone Name</TableHead>
                            <TableHead className="font-semibold text-foreground py-3">Rack Number</TableHead>
                            <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedLoc.warehouses.map((wh: any) => (
                            <TableRow key={wh.id} className="hover:bg-muted/10">
                              <TableCell className="font-semibold text-foreground py-3">{wh.name}</TableCell>
                              <TableCell className="py-3">
                                {wh.rack_number
                                  ? <Badge className="bg-secondary/15 text-secondary-foreground border-none font-mono text-[11px]">Rack: {wh.rack_number}</Badge>
                                  : <span className="text-muted-foreground text-sm">None</span>}
                              </TableCell>
                              <TableCell className="py-3 text-right space-x-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                  onClick={() => { setEditWhId(wh.id); setEditWhName(wh.name); setEditWhRack(wh.rack_number || ''); setIsEditWhOpen(true); }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteConfirmWh(wh)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* TIER 4: ISP CONNECTIVITY */}
            {locView === 'isp' && selectedLoc && (
              <div className="space-y-4">
                <Button variant="ghost" onClick={() => setLocView('list')} className="gap-2 hover:bg-muted text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Back to Locations
                </Button>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Add ISP Record */}
                  <Card className="md:col-span-1 border border-muted/50 shadow-sm h-fit">
                    <CardHeader className="border-b pb-4 bg-muted/5">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Wifi className="h-5 w-5 text-primary" /> Add ISP Connection
                      </CardTitle>
                      <CardDescription>Record ISP details for {selectedLoc.name}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <form onSubmit={handleAddIsp} className="space-y-4">
                        <div className="space-y-1.5">
                          <Label>Provider Name</Label>
                          <Input placeholder="e.g. PTCL, StormFiber, Nayatel" value={ispProvider} onChange={e => setIspProvider(e.target.value)} required />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Bandwidth (Mbps)</Label>
                          <Input type="number" min={1} value={ispBandwidth} onChange={e => setIspBandwidth(Math.max(1, parseInt(e.target.value) || 1))} required />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Monthly Cost (PKR)</Label>
                          <Input type="number" min={0} value={ispCost} onChange={e => setIspCost(Math.max(0, parseFloat(e.target.value) || 0))} required />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Package Details (Optional)</Label>
                          <Input placeholder="e.g. 5 IP Block, Enterprise Fiber" value={ispPackage} onChange={e => setIspPackage(e.target.value)} />
                        </div>
                        <Button type="submit" className="w-full" disabled={isAddingIsp}>
                          {isAddingIsp ? 'Adding...' : 'Add ISP Connection'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* ISP Connections List */}
                  <Card className="md:col-span-2 border border-muted/50 overflow-hidden shadow-sm">
                    <CardHeader className="border-b pb-4 bg-muted/5">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-5 w-5 text-primary" /> ISP Connections
                      </CardTitle>
                      <CardDescription>ISP connections registered to this location.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {isIspLoading ? (
                        <div className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                        </div>
                      ) : ispRecords.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                          No ISP records found for this location.
                        </div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent bg-muted/10">
                              <TableHead className="font-semibold text-foreground py-3">ISP Provider</TableHead>
                              <TableHead className="font-semibold text-foreground py-3">Speed</TableHead>
                              <TableHead className="font-semibold text-foreground py-3">Cost</TableHead>
                              <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ispRecords.map((rec: any) => (
                              <TableRow key={rec.id} className="hover:bg-muted/10">
                                <TableCell className="font-semibold text-foreground py-3">
                                  {rec.provider_name}
                                  {rec.package_details && (
                                    <div className="text-[10px] text-muted-foreground font-normal">{rec.package_details}</div>
                                  )}
                                </TableCell>
                                <TableCell className="py-3">
                                  <Badge className="bg-primary/10 text-primary border-none text-[11px] font-semibold">
                                    {rec.bandwidth_mbps} Mbps
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-3 text-sm font-semibold">
                                  PKR {parseFloat(rec.recurring_cost).toLocaleString()} /mo
                                </TableCell>
                                <TableCell className="py-3 text-right">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeleteIsp(rec.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────── */}
        {/* TAB: APPEARANCE                                         */}
        {/* ──────────────────────────────────────────────────────── */}
        {activeTab === 'appearance' && (
          <Card className="shadow-sm border border-muted/50">
            <CardHeader className="border-b pb-4 bg-muted/5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Palette className="h-5 w-5 text-primary" /> Color Theme
              </CardTitle>
              <CardDescription>
                Choose a color palette for the interface. Changes apply immediately and are saved to this browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="py-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {COLOR_THEMES.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => { setActiveTheme(theme.id); applyTheme(theme.id); }}
                    className={`group relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 hover:scale-105 ${
                      activeTheme === theme.id
                        ? 'border-primary shadow-md shadow-primary/20 bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30 bg-background'
                    }`}
                  >
                    {/* Swatch */}
                    <div
                      className="w-14 h-14 rounded-full shadow-inner flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
                      style={{ backgroundColor: theme.swatch }}
                    >
                      {activeTheme === theme.id && (
                        <Check className="h-6 w-6 text-white drop-shadow" />
                      )}
                    </div>
                    {/* UI preview strips */}
                    <div className="w-full flex flex-col gap-1">
                      <div className="h-2 rounded-full w-full" style={{ backgroundColor: theme.swatch, opacity: 0.9 }} />
                      <div className="h-1.5 rounded-full w-3/4" style={{ backgroundColor: theme.swatch, opacity: 0.4 }} />
                      <div className="h-1.5 rounded-full w-1/2" style={{ backgroundColor: theme.swatch, opacity: 0.25 }} />
                    </div>
                    <span className="text-xs font-semibold text-foreground text-center leading-tight">{theme.name}</span>
                    {activeTheme === theme.id && (
                      <span className="text-[10px] text-primary font-bold uppercase tracking-wider">Active</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="mt-8 p-4 rounded-xl border border-muted bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Preview:</span> The selected color is applied to buttons, active sidebar items, badges, and interactive elements across the entire application.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ──────────────────────────────────────────────────────── */}
        {/* TAB: NOTIFICATIONS                                      */}
        {/* ──────────────────────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Manage your alerts, reports and critical warnings.</CardDescription>
            </CardHeader>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Notification preferences are managed by organizational administrative policies.
            </CardContent>
          </Card>
        )}

        {/* ──────────────────────────────────────────────────────── */}
        {/* TAB: SECURITY                                           */}
        {/* ──────────────────────────────────────────────────────── */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <Card className="shadow-sm border border-muted/50">
              <CardHeader className="border-b pb-4 bg-muted/5">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5 text-primary" /> Software Vault Settings
                </CardTitle>
                <CardDescription>
                  Configure security rules and upload limit settings for software installation binaries.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-6 space-y-4">
                <div className="max-w-md space-y-2">
                  <Label htmlFor="upload-limit">Maximum Software Upload Limit</Label>
                  <Select value={uploadLimit} onValueChange={handleUploadLimitChange} items={LIMIT_OPTIONS}>
                    <SelectTrigger id="upload-limit" className="w-full">
                      <SelectValue placeholder="Select upload limit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50 MB</SelectItem>
                      <SelectItem value="100">100 MB</SelectItem>
                      <SelectItem value="250">250 MB</SelectItem>
                      <SelectItem value="500">500 MB</SelectItem>
                      <SelectItem value="1000">1 GB</SelectItem>
                      <SelectItem value="2000">2 GB</SelectItem>
                      <SelectItem value="5000">5 GB</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allows you to set the maximum installer binary file size allowed in the intake wizard and software vault details page.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-muted/50">
              <CardHeader>
                <CardTitle>Security &amp; Sessions</CardTitle>
                <CardDescription>Review security audits and authentication policies.</CardDescription>
              </CardHeader>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                Single sign-on sessions are locked. Contact IT administrator to clear active logins.
              </CardContent>
            </Card>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────── */}
        {/* TAB: USER MANAGEMENT                                    */}
        {/* ──────────────────────────────────────────────────────── */}
        {activeTab === 'users' && userRole === 'admin' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="md:col-span-1 shadow-sm h-fit border border-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserPlus className="h-5 w-5 text-primary" /> Create User
                </CardTitle>
                <CardDescription>Assign email access and credentials to staff members.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullname">Full Name</Label>
                    <Input id="fullname" placeholder="John Doe" value={newFullName} onChange={e => setNewFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="username">Email Address</Label>
                    <Input id="username" type="email" placeholder="user@tajgasoline.com" value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="pr-10" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role">Role Permission</Label>
                    <Select value={newUserRole} onValueChange={val => { if (val) setNewUserRole(val); }} items={[
                      { value: 'moderator', label: 'Moderator (Read/Write)' },
                      { value: 'admin', label: 'Admin (Full Access)' },
                      { value: 'site_manager', label: 'Site Manager (Branch Restricted)' }
                    ]}>
                      <SelectTrigger id="role"><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="moderator">Moderator (Read/Write)</SelectItem>
                        <SelectItem value="admin">Admin (Full Access)</SelectItem>
                        <SelectItem value="site_manager">Site Manager (Branch Restricted)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newUserRole === 'site_manager' && (
                    <div className="space-y-2 animate-in fade-in duration-150 border rounded-lg p-3 bg-muted/10">
                      <Label className="font-semibold text-xs text-primary">Assigned Branches (Select Multiple)</Label>
                      <div className="space-y-2 mt-2 max-h-36 overflow-y-auto">
                        {locations.map(loc => {
                          const checked = newUserLocationIds.includes(loc.id);
                          return (
                            <label key={loc.id} className="flex items-center gap-2.5 text-sm font-normal cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={checked}
                                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setNewUserLocationIds([...newUserLocationIds, loc.id]);
                                  } else {
                                    setNewUserLocationIds(newUserLocationIds.filter(id => id !== loc.id));
                                  }
                                }}
                              />
                              <span>{loc.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={isCreatingUser}>
                    {isCreatingUser ? 'Creating...' : 'Create User'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 shadow-sm border border-muted/50 overflow-hidden">
              <CardHeader className="border-b pb-4 bg-muted/5">
                <CardTitle className="text-lg">System Users</CardTitle>
                <CardDescription>Staff accounts with authorization to view and manage assets.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/10">
                      <TableHead className="font-semibold text-foreground py-3">User Email</TableHead>
                      <TableHead className="font-semibold text-foreground py-3">System Role</TableHead>
                      <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isUsersLoading ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                        </TableCell>
                      </TableRow>
                    ) : users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No users found.</TableCell>
                      </TableRow>
                    ) : users.map(user => (
                      <TableRow key={user.id} className="hover:bg-muted/10">
                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                              {(user.full_name || user.username).slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground leading-snug">{user.full_name || user.username.split('@')[0]}</span>
                              <span className="text-[10px] text-muted-foreground">{user.username}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={user.role === 'admin' ? 'default' : user.role === 'site_manager' ? 'outline' : 'secondary'} className="w-fit gap-1 font-semibold">
                              {user.role === 'admin' && <Shield className="h-3 w-3" />}
                              {user.role}
                            </Badge>
                            {user.role === 'site_manager' && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {user.assigned_location_ids && user.assigned_location_ids.length > 0 ? (
                                  user.assigned_location_ids.map((locId: string) => {
                                    const name = locations.find(l => l.id === locId)?.name || 'Unknown';
                                    const isActive = user.assigned_location_id === locId;
                                    return (
                                      <Badge
                                        key={locId}
                                        variant={isActive ? 'default' : 'outline'}
                                        className="text-[9px] px-1 py-0 font-semibold"
                                      >
                                        {name} {isActive && '• active'}
                                      </Badge>
                                    );
                                  })
                                ) : (
                                  <span className="text-[10px] text-muted-foreground italic">No assigned sites</span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 text-right space-x-1.5">
                          <Button
                            variant="ghost" size="icon"
                            className="text-primary hover:bg-primary/10"
                            onClick={() => {
                              setEditingUser(user);
                              setEditUserRole(user.role);
                              setEditUserLocationId(user.assigned_location_id || '');
                              setEditUserLocationIds(user.assigned_location_ids || []);
                              setEditUserFullName(user.full_name || '');
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => setUserToDelete({ id: user.id, username: user.username })}
                            disabled={user.id === profile?.id}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* VIEWPORT-AWARE FLOATING DROPDOWN (portal-style)             */}
      {/* ──────────────────────────────────────────────────────────── */}
      {openMenuId && (
        <div
          ref={floatingMenuRef}
          className="fixed z-[9999] w-48 bg-white border border-border rounded-xl shadow-xl py-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {(() => {
            const loc = locations.find(l => l.id === openMenuId);
            if (!loc) return null;
            return (
              <>
                <button onClick={() => { setSelectedLoc(loc); setLocView('sub-locations'); setOpenMenuId(null); }}
                  className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors font-medium">
                  View Departments
                </button>
                <button onClick={() => { setSelectedLoc(loc); setLocView('warehouses'); setOpenMenuId(null); }}
                  className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors font-medium">
                  View Warehouses
                </button>
                <button onClick={() => { setSelectedLoc(loc); setLocView('isp'); setOpenMenuId(null); }}
                  className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors font-medium">
                  View ISP Connectivity
                </button>
                <div className="my-1 mx-3 border-t border-border/50" />
                <button onClick={() => { setEditLocId(loc.id); setEditLocName(loc.name); setEditLocAddress(loc.address || ''); setIsEditLocOpen(true); setOpenMenuId(null); }}
                  className="w-full text-left px-4 py-2 text-sm text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors font-medium">
                  Edit Location
                </button>
                <button onClick={() => { setDeleteConfirmLoc(loc); setOpenMenuId(null); }}
                  className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors font-medium">
                  Delete Location
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* MODALS                                                       */}
      {/* ──────────────────────────────────────────────────────────── */}

      {isAddLocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Add Primary Location</h3>
            <form onSubmit={handleAddLocation} className="space-y-4">
              <div className="space-y-2"><Label>Location Name</Label><Input placeholder="e.g. Karachi HQ" value={newLocName} onChange={e => setNewLocName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Address (Optional)</Label><Input placeholder="e.g. Main Boulevard, Block C" value={newLocAddress} onChange={e => setNewLocAddress(e.target.value)} /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsAddLocOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isAddingLoc}>{isAddingLoc ? 'Adding...' : 'Add Location'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditLocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Edit Location</h3>
            <form onSubmit={handleEditLocation} className="space-y-4">
              <div className="space-y-2"><Label>Location Name</Label><Input value={editLocName} onChange={e => setEditLocName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Address (Optional)</Label><Input value={editLocAddress} onChange={e => setEditLocAddress(e.target.value)} /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsEditLocOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isEditingLoc}>{isEditingLoc ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmLoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-destructive/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-destructive"><AlertTriangle className="h-6 w-6" /><h3 className="text-lg font-bold">Delete Location?</h3></div>
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/25 p-3 rounded space-y-1">
              <p className="font-semibold">This will permanently delete:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>{deleteConfirmLoc.subLocations.length} Associated Departments</li>
                <li>{deleteConfirmLoc.warehouses.length} Associated Warehouses</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmLoc(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleConfirmDeleteLocation} disabled={isDeletingLoc}>{isDeletingLoc ? 'Deleting...' : 'Confirm Delete'}</Button>
            </div>
          </div>
        </div>
      )}

      {isAddSubOpen && selectedLoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Add Department</h3>
            <form onSubmit={handleAddSub} className="space-y-4">
              <div className="space-y-2"><Label>Department Name</Label><Input placeholder="e.g. IT Support" value={newSubName} onChange={e => setNewSubName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Cost Center Code (Optional)</Label><Input placeholder="e.g. CC-101" value={newSubCost} onChange={e => setNewSubCost(e.target.value)} /></div>
              <div className="bg-primary/5 p-3 rounded-lg border border-primary/10 flex items-start gap-2.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div><span className="font-semibold text-primary block mb-0.5">What is a Cost Center?</span>A financial tracking code used to allocate IT hardware costs to a specific department for budgeting and accounting audits.</div>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsAddSubOpen(false)}>Cancel</Button><Button type="submit" disabled={isAddingSub}>{isAddingSub ? 'Adding...' : 'Add Department'}</Button></div>
            </form>
          </div>
        </div>
      )}

      {isEditSubOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Edit Department</h3>
            <form onSubmit={handleEditSub} className="space-y-4">
              <div className="space-y-2"><Label>Department Name</Label><Input value={editSubName} onChange={e => setEditSubName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Cost Center Code (Optional)</Label><Input value={editSubCost} onChange={e => setEditSubCost(e.target.value)} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsEditSubOpen(false)}>Cancel</Button><Button type="submit" disabled={isEditingSub}>{isEditingSub ? 'Saving...' : 'Save Changes'}</Button></div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-destructive/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-destructive"><AlertTriangle className="h-6 w-6" /><h3 className="text-lg font-bold">Delete Department?</h3></div>
            <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{deleteConfirmSub.name}</strong>?</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteConfirmSub(null)}>Cancel</Button><Button variant="destructive" onClick={() => handleDeleteSub(deleteConfirmSub)}>Delete</Button></div>
          </div>
        </div>
      )}

      {isAddWhOpen && selectedLoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Add Warehouse</h3>
            <form onSubmit={handleAddWh} className="space-y-4">
              <div className="space-y-2"><Label>Warehouse / Zone Name</Label><Input placeholder="e.g. Storage Room B" value={newWhName} onChange={e => setNewWhName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Rack Number (Optional)</Label><Input placeholder="e.g. Rack 4A" value={newWhRack} onChange={e => setNewWhRack(e.target.value)} /></div>
              <div className="bg-primary/5 p-3 rounded-lg border border-primary/10 flex items-start gap-2.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div><span className="font-semibold text-primary block mb-0.5">What is a Rack Number?</span>A locator code (shelf, aisle, or bin ID) within the storage zone to quickly pinpoint where hardware is placed.</div>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsAddWhOpen(false)}>Cancel</Button><Button type="submit" disabled={isAddingWh}>{isAddingWh ? 'Adding...' : 'Add Warehouse'}</Button></div>
            </form>
          </div>
        </div>
      )}

      {isEditWhOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-primary">Edit Warehouse</h3>
            <form onSubmit={handleEditWh} className="space-y-4">
              <div className="space-y-2"><Label>Warehouse / Zone Name</Label><Input value={editWhName} onChange={e => setEditWhName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Rack Number (Optional)</Label><Input value={editWhRack} onChange={e => setEditWhRack(e.target.value)} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setIsEditWhOpen(false)}>Cancel</Button><Button type="submit" disabled={isEditingWh}>{isEditingWh ? 'Saving...' : 'Save Changes'}</Button></div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmWh && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-destructive/20 p-6 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-destructive"><AlertTriangle className="h-6 w-6" /><h3 className="text-lg font-bold">Delete Warehouse?</h3></div>
            <p className="text-sm text-muted-foreground">Are you sure you want to delete <strong>{deleteConfirmWh.name}</strong>?</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteConfirmWh(null)}>Cancel</Button><Button variant="destructive" onClick={() => handleDeleteWh(deleteConfirmWh)}>Delete</Button></div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {isErrorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-destructive/20 p-6 rounded-xl shadow-xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-destructive"><AlertCircle className="h-6 w-6" /><h3 className="text-lg font-bold">Action Failed</h3></div>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <div className="flex justify-end"><Button variant="outline" className="border-destructive/30 hover:bg-destructive/10 hover:text-destructive" onClick={() => setIsErrorOpen(false)}>Close</Button></div>
          </div>
        </div>
      )}

      {/* Delete User Confirm */}
      <AlertDialog open={userToDelete !== null} onOpenChange={(open) => { if (!open) setUserToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete User Account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the user account <strong>{userToDelete?.username}</strong>? They will immediately lose access to Taj AssetFlow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => {
              if (userToDelete) {
                await handleDeleteUser(userToDelete.id);
                setUserToDelete(null);
              }
            }}>
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <Edit className="h-5 w-5 text-primary" /> Edit User Profile
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Modify permissions and site bindings for <strong>{editingUser.username}</strong></p>
            </div>
            
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-fullname">Full Name</Label>
                <Input id="edit-fullname" placeholder="John Doe" value={editUserFullName} onChange={e => setEditUserFullName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-user-role">Role Permission</Label>
                <Select value={editUserRole} onValueChange={val => { if (val) setEditUserRole(val); }} items={[
                  { value: 'moderator', label: 'Moderator (Read/Write)' },
                  { value: 'admin', label: 'Admin (Full Access)' },
                  { value: 'site_manager', label: 'Site Manager (Branch Restricted)' }
                ]}>
                  <SelectTrigger id="edit-user-role"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent className="z-[99999]">
                    <SelectItem value="moderator">Moderator (Read/Write)</SelectItem>
                    <SelectItem value="admin">Admin (Full Access)</SelectItem>
                    <SelectItem value="site_manager">Site Manager (Branch Restricted)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editUserRole === 'site_manager' && (
                <div className="space-y-2 border rounded-lg p-3 bg-muted/10">
                  <Label className="font-semibold text-xs text-primary">Assigned Branches (Select Multiple)</Label>
                  <div className="space-y-2 mt-2 max-h-36 overflow-y-auto">
                    {locations.map(loc => {
                      const checked = editUserLocationIds.includes(loc.id);
                      return (
                        <label key={loc.id} className="flex items-center gap-2.5 text-sm font-normal cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checked}
                            className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditUserLocationIds([...editUserLocationIds, loc.id]);
                              } else {
                                setEditUserLocationIds(editUserLocationIds.filter(id => id !== loc.id));
                              }
                            }}
                          />
                          <span>{loc.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)} disabled={isUpdatingUser}>Cancel</Button>
                <Button type="submit" disabled={isUpdatingUser}>
                  {isUpdatingUser ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
