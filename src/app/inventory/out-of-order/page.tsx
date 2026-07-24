'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileDown, Eye, Edit, Trash2, ArrowUpDown, Check, ChevronDown, Truck, Loader2 } from "lucide-react";
import { deleteAsset, transferAsset } from '../actions';
import { cn } from "@/lib/utils";
import { useTenantSession } from '@/lib/TenantSessionContext';
import { Label } from "@/components/ui/label";
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

export default function OutOfOrderInventoryPage() {
  const { profile } = useTenantSession();
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [userRole, setUserRole] = useState<string>('moderator');

  const [locationFilter, setLocationFilter] = useState('All');
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [durationSort, setDurationSort] = useState('None');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  // Transfer modal state
  const [transferItem, setTransferItem] = useState<any | null>(null);
  const [transferTargetLocId, setTransferTargetLocId] = useState('');
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  useEffect(() => {
    fetchInventory();
    fetchUserRole();
    supabase.from('locations').select('id, name').order('name').then(({ data }) => setLocationsList(data || []));
  }, [profile]);

  const fetchUserRole = async () => {
    const { getCurrentUserRole } = await import('../actions');
    const role = await getCurrentUserRole();
    setUserRole(role);
  };

  const fetchInventory = async () => {
    setIsLoading(true);

    let assetQuery = supabase
      .from('assets')
      .select(`
        *,
        sub_locations ( name ),
        warehouses ( name )
      `)
      .order('created_at', { ascending: false });

    let itemQuery = supabase
      .from('inventory_items')
      .select(`
        *,
        locations ( name ),
        sub_locations ( name ),
        warehouses ( name )
      `)
      .order('created_at', { ascending: false });

    const role = profile?.role || 'moderator';
    if (role === 'site_manager' && profile?.assigned_location_ids && profile.assigned_location_ids.length > 0) {
      assetQuery = assetQuery.in('location_id', profile.assigned_location_ids);
      itemQuery = itemQuery.in('location_id', profile.assigned_location_ids);
    }

    const [{ data: assetsData }, { data: itemsData }] = await Promise.all([
      assetQuery,
      itemQuery
    ]);

    const combined: any[] = [];
    const seenKeys = new Set<string>();

    if (assetsData) {
      assetsData.forEach((item: any) => {
        const isOutOfOrder = item.status === 'Out of Order' || 
                             (item.details && (item.details.includes('[Out of Order]') || item.details.includes('[Status: Out of Order]')));
        if (isOutOfOrder) {
          const key = item.serial_number && item.serial_number.trim() ? item.serial_number.trim().toLowerCase() : item.id;
          seenKeys.add(key);
          combined.push({
            id: item.id,
            laptopName: item.laptop_name,
            serialNumber: item.serial_number || 'N/A',
            assignedTo: item.assigned_to || 'Unassigned',
            location: item.location,
            locationId: item.location_id,
            subLocationId: item.sub_location_id,
            subLocationName: item.sub_locations?.name || null,
            warehouseId: item.warehouse_id,
            warehouseName: item.warehouses?.name || null,
            status: 'Out of Order',
            issueDate: item.issue_date,
            updatedAt: item.updated_at
          });
        }
      });
    }

    if (itemsData) {
      itemsData.forEach((item: any) => {
        const isOutOfOrder = item.status_state === 'Out of Order' || 
                             (item.notes && (item.notes.includes('[Out of Order]') || item.notes.includes('[Status: Out of Order]')));
        if (isOutOfOrder) {
          const key = item.serial_number && item.serial_number.trim() ? item.serial_number.trim().toLowerCase() : item.id;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            combined.push({
              id: item.id,
              laptopName: item.name,
              serialNumber: item.serial_number || 'N/A',
              assignedTo: item.assigned_to || 'Unassigned',
              location: item.locations?.name || 'Unknown',
              locationId: item.location_id,
              subLocationId: item.sub_location_id,
              subLocationName: item.sub_locations?.name || null,
              warehouseId: item.warehouse_id,
              warehouseName: item.warehouses?.name || null,
              status: 'Out of Order',
              issueDate: item.created_at,
              updatedAt: item.last_modified_at || item.created_at
            });
          }
        }
      });
    }

    setInventory(combined);
    setIsLoading(false);
  };

  const handleExportToExcel = async () => {
    setIsExporting(true);
    try {
      if (inventory.length === 0) {
        alert("No assets found to export.");
        setIsExporting(false);
        return;
      }

      const headers = ['Laptop Name', 'Serial Number', 'Assigned To', 'Location', 'Status', 'Issue Date', 'Date Modified'];
      
      const csvContent = [
        headers.join(','),
        ...inventory.map(item => [
          `"${item.laptopName || ''}"`,
          `"${item.serialNumber || ''}"`,
          `"${item.assignedTo || ''}"`,
          `"${item.location || ''}"`,
          `"${item.status || ''}"`,
          `"${item.issueDate || ''}"`,
          `"${new Date(item.updatedAt).toLocaleString()}"`
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Out_Of_Order_Inventory_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteItemId(id);
  };

  const confirmDelete = async () => {
    if (!deleteItemId) return;
    const res = await deleteAsset(deleteItemId);
    if (res.success) {
      fetchInventory();
    } else {
      alert(res.error || 'Failed to delete asset');
    }
    setDeleteItemId(null);
  };

  const uniqueLocations = Array.from(new Set(inventory.map(i => i.location).filter(Boolean)));
  const filteredLocations = uniqueLocations.filter(loc => loc.toLowerCase().includes(locationSearch.toLowerCase()));

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredInventory = inventory
    .filter(item => {
      if (locationFilter !== 'All' && item.location !== locationFilter) return false;
      
      const searchLower = search.toLowerCase();
      return item.serialNumber.toLowerCase().includes(searchLower) ||
             item.laptopName.toLowerCase().includes(searchLower) ||
             item.assignedTo.toLowerCase().includes(searchLower) ||
             item.location.toLowerCase().includes(searchLower);
    })
    .sort((a, b) => {
      if (durationSort !== 'None') {
        const timeA = new Date(a.updatedAt).getTime();
        const timeB = new Date(b.updatedAt).getTime();
        return durationSort === 'Oldest' ? timeA - timeB : timeB - timeA;
      }

      if (!sortConfig) return 0;
      
      let aVal = a[sortConfig.key] || '';
      let bVal = b[sortConfig.key] || '';
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            Out of Order Inventory
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of items marked as Out of Order at your site.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={handleExportToExcel} disabled={isExporting}>
            <FileDown className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export Excel'}
          </Button>
          <Link href="/inventory/add" className={buttonVariants({ variant: "default", className: "gap-2" })}>
            Add Out of Order Asset
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-4 bg-card p-4 rounded-xl border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by serial number, device name, assigned user, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[18%] font-semibold cursor-pointer select-none" onClick={() => handleSort('laptopName')}>
                <div className="flex items-center gap-1">
                  Device Name
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="w-[15%] font-semibold cursor-pointer select-none" onClick={() => handleSort('serialNumber')}>
                <div className="flex items-center gap-1">
                  Serial Number
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="w-[15%] font-semibold cursor-pointer select-none" onClick={() => handleSort('assignedTo')}>
                <div className="flex items-center gap-1">
                  Assigned To
                  <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="w-[15%] font-semibold">
                <div className="relative inline-block text-left">
                  <button 
                    onClick={() => setIsLocationOpen(!isLocationOpen)} 
                    className="flex items-center gap-1 font-semibold hover:text-primary transition-colors focus:outline-none"
                  >
                    Location {locationFilter !== 'All' && `(${locationFilter})`}
                    <ChevronDown className="h-3 w-3" />
                  </button>

                  {isLocationOpen && (
                    <div className="absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-popover border border-border z-50 p-2 animate-in fade-in-80 duration-100">
                      <Input
                        placeholder="Search location..."
                        value={locationSearch}
                        onChange={(e) => setLocationSearch(e.target.value)}
                        className="h-8 text-xs mb-2 bg-background"
                      />
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        <button
                          onClick={() => { setLocationFilter('All'); setIsLocationOpen(false); }}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between hover:bg-accent",
                            locationFilter === 'All' && "bg-accent font-medium text-accent-foreground"
                          )}
                        >
                          All Locations
                          {locationFilter === 'All' && <Check className="h-3 w-3" />}
                        </button>
                        {filteredLocations.map((loc) => (
                          <button
                            key={loc}
                            onClick={() => { setLocationFilter(loc); setIsLocationOpen(false); }}
                            className={cn(
                              "w-full text-left px-2 py-1.5 text-xs rounded-sm flex items-center justify-between hover:bg-accent",
                              locationFilter === loc && "bg-accent font-medium text-accent-foreground"
                            )}
                          >
                            <span className="truncate">{loc}</span>
                            {locationFilter === loc && <Check className="h-3 w-3" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </TableHead>
              <TableHead className="w-[12%] font-semibold">Status</TableHead>
              <TableHead className="w-[12%] font-semibold">
                <Select onValueChange={(val) => setDurationSort(val || 'None')} value={durationSort}>
                  <SelectTrigger className="border-0 shadow-none bg-transparent p-0 h-auto font-semibold focus:ring-0">
                    <SelectValue placeholder="Duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">Default</SelectItem>
                    <SelectItem value="Oldest">Oldest First</SelectItem>
                    <SelectItem value="Newest">Newest First</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[13%] text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading Out of Order inventory...
                </TableCell>
              </TableRow>
            ) : filteredInventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No Out of Order assets found.
                </TableCell>
              </TableRow>
            ) : (
              filteredInventory.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{item.laptopName}</TableCell>
                  <TableCell className="font-mono text-xs">{item.serialNumber}</TableCell>
                  <TableCell>{item.assignedTo}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{item.location}</span>
                      {(item.subLocationName || item.warehouseName) && (
                        <span className="text-[11px] text-muted-foreground">
                          {[item.subLocationName, item.warehouseName].filter(Boolean).join(' • ')}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                      Out of Order
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(item.updatedAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-1">
                    <Link href={`/inventory/${item.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">View</span>
                    </Link>
                    <Link href={`/inventory/${item.id}/edit`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Link>
                    <button
                      type="button"
                      title="Transfer Asset"
                      onClick={() => { setTransferItem(item); setTransferTargetLocId(''); setTransferError(''); }}
                      className="p-1.5 rounded-md text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <Truck className="h-3.5 w-3.5" />
                    </button>
                    {userRole === 'admin' && (
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteItemId !== null} onOpenChange={(open) => { if (!open) setDeleteItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Asset?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this asset? This action is permanent and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transfer Asset Modal */}
      {transferItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2"><Truck className="h-5 w-5 text-amber-600" />Transfer Asset Location</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Transferring <strong>{transferItem.laptopName}</strong> ({transferItem.serialNumber})</p>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-muted/40 border border-muted/50 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Location:</span>
                  <span className="font-bold">{transferItem.location}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-target">Target Location <span className="text-destructive">*</span></Label>
                <Select value={transferTargetLocId} onValueChange={setTransferTargetLocId}>
                  <SelectTrigger id="tr-target">
                    <SelectValue placeholder="Select target location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locationsList
                      .filter(loc => loc.id !== transferItem.locationId && loc.name !== transferItem.location)
                      .filter(loc => {
                        if (userRole === 'site_manager') {
                          const assignedIds = [
                            ...(profile?.assigned_location_ids || []),
                            ...(profile?.assigned_location_id ? [profile.assigned_location_id] : [])
                          ];
                          const isHo = loc.name.toLowerCase().includes('head office') || loc.name.toLowerCase().includes('ho');
                          if (assignedIds.length > 0) {
                            return assignedIds.includes(loc.id) || isHo;
                          }
                          return true;
                        }
                        return true;
                      })
                      .map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {userRole === 'site_manager' ? 'You can transfer back to HO or another branch assigned to you.' : 'Select the destination site location.'}
                </p>
              </div>
            </div>
            {transferError && <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">{transferError}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setTransferItem(null)} disabled={isTransferring}>Cancel</Button>
              <Button disabled={isTransferring || !transferTargetLocId} onClick={async () => {
                if (!transferTargetLocId) { setTransferError('Please select a target location.'); return; }
                setIsTransferring(true); setTransferError('');
                const r = await transferAsset(transferItem.id, transferTargetLocId);
                setIsTransferring(false);
                if (r.success) { setTransferItem(null); fetchInventory(); }
                else setTransferError(r.error || 'Transfer failed.');
              }}>
                {isTransferring ? <><Loader2 size={14} className="animate-spin mr-2" />Transferring...</> : <><Truck size={14} className="mr-2" />Confirm Transfer</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
