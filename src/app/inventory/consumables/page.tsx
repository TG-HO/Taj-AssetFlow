'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Search, 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  ArrowUpDown, 
  Check, 
  Loader2, 
  AlertCircle, 
  Info, 
  MapPin, 
  Package, 
  AlertTriangle 
} from "lucide-react";
import { updateInventoryItem, deleteInventoryItem, getCategories } from '../item-actions';
import { getCurrentUserRole } from '../actions';
import { cn } from "@/lib/utils";
import { toast } from '@/components/ui/toast';

interface ConsumableItem {
  id: string;
  name: string;
  category_id: string;
  location_id: string;
  sub_location_id: string | null;
  warehouse_id: string | null;
  status_state: string;
  quantity: number;
  minimum_safety_stock: number;
  notes: string | null;
  created_at: string;
  item_categories: { name: string; classification: string } | null;
  locations: { name: string } | null;
  sub_locations: { name: string } | null;
  warehouses: { name: string } | null;
}

export default function ConsumablesPage() {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<ConsumableItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('moderator');

  // Modal States
  const [editingItem, setEditingItem] = useState<ConsumableItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ConsumableItem | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Edit Form Fields
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editLocationId, setEditLocationId] = useState('');
  const [editSubLocationId, setEditSubLocationId] = useState('');
  const [editWarehouseId, setEditWarehouseId] = useState('');
  const [editStatusState, setEditStatusState] = useState('New');
  const [editQuantity, setEditQuantity] = useState(1);
  const [editMinSafetyStock, setEditMinSafetyStock] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  
  // Dropdown list options
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [subLocations, setSubLocations] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetchConsumables();
    fetchUserRole();
    loadDropdowns();
  }, []);

  // Fetch nested options when edit location changes
  useEffect(() => {
    if (!editLocationId) {
      setSubLocations([]);
      setWarehouses([]);
      return;
    }
    async function loadNested() {
      const [{ data: subs }, { data: whs }] = await Promise.all([
        supabase.from('sub_locations').select('*').eq('location_id', editLocationId).order('name'),
        supabase.from('warehouses').select('*').eq('location_id', editLocationId).order('name'),
      ]);
      setSubLocations(subs || []);
      setWarehouses(whs || []);
    }
    loadNested();
  }, [editLocationId]);

  const fetchUserRole = async () => {
    const role = await getCurrentUserRole();
    setUserRole(role);
  };

  const loadDropdowns = async () => {
    try {
      const cats = await getCategories();
      setCategories(cats.filter((c: any) => c.classification === 'Consumable'));
      
      const { data: locs } = await supabase.from('locations').select('*').order('name');
      setLocations(locs || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConsumables = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inventory_items')
      .select(`
        *,
        item_categories!inner ( name, classification ),
        locations ( name ),
        sub_locations ( name ),
        warehouses ( name )
      `)
      .eq('item_categories.classification', 'Consumable')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setItems(data as unknown as ConsumableItem[]);
    }
    setIsLoading(false);
  };

  const openEditModal = (item: ConsumableItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategoryId(item.category_id);
    setEditLocationId(item.location_id);
    setEditSubLocationId(item.sub_location_id || 'none');
    setEditWarehouseId(item.warehouse_id || 'none');
    setEditStatusState(item.status_state || 'New');
    setEditQuantity(item.quantity);
    setEditMinSafetyStock(item.minimum_safety_stock);
    setEditNotes(item.notes || '');
    setFormError('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editName.trim()) { setFormError('Name is required.'); return; }
    if (!editCategoryId) { setFormError('Sub Category is required.'); return; }
    if (!editLocationId) { setFormError('Primary Location is required.'); return; }
    if (editQuantity < 0) { setFormError('Quantity cannot be negative.'); return; }
    if (editMinSafetyStock < 0) { setFormError('Minimum Safety Stock cannot be negative.'); return; }

    setIsActionLoading(true);
    setFormError('');

    const res = await updateInventoryItem({
      id: editingItem.id,
      name: editName.trim(),
      category_id: editCategoryId,
      location_id: editLocationId,
      sub_location_id: editSubLocationId === 'none' ? null : editSubLocationId,
      warehouse_id: editWarehouseId === 'none' ? null : editWarehouseId,
      status_state: editStatusState,
      quantity: editQuantity,
      minimum_safety_stock: editMinSafetyStock,
      notes: editNotes || null
    });

    setIsActionLoading(false);
    if (res.success) {
      toast('Consumable updated successfully!', 'success');
      setEditingItem(null);
      fetchConsumables();
    } else {
      setFormError(res.error || 'Failed to update consumable.');
    }
  };

  const handleDeleteSubmit = async () => {
    if (!deletingItem) return;
    setIsActionLoading(true);
    
    const res = await deleteInventoryItem(deletingItem.id);
    setIsActionLoading(false);
    if (res.success) {
      toast('Consumable deleted successfully!', 'success');
      setDeletingItem(null);
      fetchConsumables();
    } else {
      alert(res.error || 'Failed to delete consumable.');
    }
  };

  const filteredItems = items.filter(item => {
    const searchLower = search.toLowerCase();
    return item.name.toLowerCase().includes(searchLower) ||
           (item.item_categories?.name || '').toLowerCase().includes(searchLower) ||
           (item.locations?.name || '').toLowerCase().includes(searchLower);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Package className="h-8 w-8 text-primary" /> {userRole === 'site_manager' ? 'Available in Stock' : 'Consumables Inventory'}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {userRole === 'site_manager' 
              ? 'View hardware, peripherals, and stock received at your location.' 
              : 'Manage organizational office supplies, peripheral components, and storage stocks.'}
          </p>
        </div>
        {userRole !== 'site_manager' && (
          <Link href="/inventory/add" className={buttonVariants({ variant: "default", className: "gap-2 shrink-0" })}>
            <Plus className="h-4 w-4" /> Add Consumable
          </Link>
        )}
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Name, Category, or Location..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card w-full overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/10">
              <TableHead className="font-semibold text-foreground py-3">Item Name</TableHead>
              <TableHead className="font-semibold text-foreground py-3">Category</TableHead>
              <TableHead className="font-semibold text-foreground py-3">Primary Location</TableHead>
              <TableHead className="font-semibold text-foreground py-3">Location Details</TableHead>
              <TableHead className="font-semibold text-foreground py-3 font-mono">Available Stock</TableHead>
              {userRole !== 'site_manager' && <TableHead className="font-semibold text-foreground py-3">Safety Threshold</TableHead>}
              {userRole !== 'site_manager' && <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={userRole === 'site_manager' ? 5 : 7} className="text-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                  <span>{userRole === 'site_manager' ? 'Loading available stock...' : 'Loading consumables stock...'}</span>
                </TableCell>
              </TableRow>
            ) : filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={userRole === 'site_manager' ? 5 : 7} className="text-center py-16 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto text-muted/40 mb-3" />
                  <p className="font-semibold text-base">
                    {userRole === 'site_manager' ? 'No Available Stock Found' : 'No Consumables Found'}
                  </p>
                  <p className="text-sm mt-1">
                    {userRole === 'site_manager' ? 'Available items will show up here.' : 'Add items using the intake form.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => {
                const isOutOfStock = item.quantity === 0;
                const isLowStock = !isOutOfStock && item.quantity <= item.minimum_safety_stock;
                
                return (
                  <TableRow key={item.id} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="font-bold py-4">
                      <div className="flex flex-col">
                        <span>{item.name}</span>
                        {item.notes && <span className="text-[10px] font-normal text-muted-foreground truncate max-w-[200px]" title={item.notes}>{item.notes}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm py-4">{item.item_categories?.name || '—'}</TableCell>
                    <TableCell className="text-sm font-semibold py-4">{item.locations?.name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-4">
                      {item.sub_locations?.name || item.warehouses?.name ? (
                        <div className="flex flex-col gap-0.5">
                          {item.sub_locations?.name && <span>Dept: {item.sub_locations.name}</span>}
                          {item.warehouses?.name && <span>Warehouse: {item.warehouses.name}</span>}
                        </div>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm">{item.quantity}</span>
                        {isOutOfStock ? (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Out of Stock</Badge>
                        ) : isLowStock ? (
                          <Badge className="bg-amber-100 text-amber-800 border-none text-[10px] px-1.5 py-0">Low Stock</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 border-none text-[10px] px-1.5 py-0">Healthy</Badge>
                        )}
                      </div>
                    </TableCell>
                    {userRole !== 'site_manager' && <TableCell className="text-sm font-mono text-muted-foreground py-4">{item.minimum_safety_stock}</TableCell>}
                    {userRole !== 'site_manager' && (
                      <TableCell className="text-right py-4 space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(item)} className="h-8 w-8 text-blue-600 hover:bg-blue-50">
                          <Edit className="h-4 w-4" />
                        </Button>
                        {userRole === 'admin' && (
                          <Button variant="ghost" size="icon" onClick={() => setDeletingItem(item)} className="h-8 w-8 text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Edit Consumable Modal ─────────────────────────────────────── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <Edit className="h-5 w-5 text-primary" /> {userRole === 'site_manager' ? 'Edit Available Stock Details' : 'Edit Consumable Stock'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Modify properties for <strong>{editingItem.name}</strong></p>
            </div>
            
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="edit-name">Item Description Name <span className="text-destructive">*</span></Label>
                  <Input id="edit-name" value={editName} onChange={e => setEditName(e.target.value)} required />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="edit-category">Sub Category <span className="text-destructive">*</span></Label>
                  <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                    <SelectTrigger id="edit-category">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-status">Condition / Status</Label>
                  <Select value={editStatusState} onValueChange={setEditStatusState}>
                    <SelectTrigger id="edit-status">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Used">Used</SelectItem>
                      <SelectItem value="Faulty">Faulty</SelectItem>
                      <SelectItem value="Damaged">Damaged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-quantity">Stock Quantity <span className="text-destructive">*</span></Label>
                  <Input id="edit-quantity" type="number" min={0} value={editQuantity} onChange={e => setEditQuantity(Math.max(0, parseInt(e.target.value) || 0))} required />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="edit-mss">Min Safety Stock Threshold</Label>
                  <Input id="edit-mss" type="number" min={0} value={editMinSafetyStock} onChange={e => setEditMinSafetyStock(Math.max(0, parseInt(e.target.value) || 0))} required />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="edit-location">Primary Location <span className="text-destructive">*</span></Label>
                  <Select value={editLocationId} onValueChange={setEditLocationId}>
                    <SelectTrigger id="edit-location">
                      <SelectValue placeholder="Select Location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {editLocationId && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-sub">Department / Sub-Location</Label>
                      <Select value={editSubLocationId} onValueChange={setEditSubLocationId}>
                        <SelectTrigger id="edit-sub">
                          <SelectValue placeholder="None / Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None / Unassigned</SelectItem>
                          {subLocations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="edit-wh">Warehouse / Storage Zone</Label>
                      <Select value={editWarehouseId} onValueChange={setEditWarehouseId}>
                        <SelectTrigger id="edit-wh">
                          <SelectValue placeholder="None / Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None / Unassigned</SelectItem>
                          {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="edit-notes">Notes / Remarks</Label>
                  <textarea id="edit-notes" className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Remarks..." />
                </div>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
                  <AlertCircle size={13} /> {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingItem(null)} disabled={isActionLoading}>Cancel</Button>
                <Button type="submit" disabled={isActionLoading}>
                  {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Consumable Modal ───────────────────────────────────── */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-destructive/20 p-6 rounded-xl shadow-xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-lg font-bold">Delete Consumable Stock?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete <strong>{deletingItem.name}</strong> from the inventory system? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeletingItem(null)} disabled={isActionLoading}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteSubmit} disabled={isActionLoading}>
                {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
