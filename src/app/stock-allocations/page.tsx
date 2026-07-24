'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Truck, ArrowRight, CheckCircle2, AlertTriangle, Clock, Plus, Loader2, RefreshCw
} from 'lucide-react';
import { getStockAllocations, createStockAllocation, reconcileStockAllocation, acceptAndLogAllocation } from './actions';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/toast';

export default function StockAllocationsPage() {
  const { profile } = useTenantSession();
  const rawRole = (profile?.role || '').toLowerCase().trim();
  const isAdminOrMod = rawRole === 'admin' || rawRole === 'administrator' || rawRole === 'moderator';
  const isRegionalPerson = !isAdminOrMod;
  const isSiteManager = isRegionalPerson;
  const assignedLocationId = profile?.assigned_location_id || (profile?.assigned_location_ids && profile.assigned_location_ids.length > 0 ? profile.assigned_location_ids[0] : null);

  const [allocations, setAllocations] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dispatch fields
  const [itemType, setItemType] = useState('');
  const [quantityAllocated, setQuantityAllocated] = useState(1);
  const [targetLocationId, setTargetLocationId] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);

  // Reconcile modal fields
  const [reconcilingItem, setReconcilingItem] = useState<any | null>(null);
  const [reconciledQty, setReconciledQty] = useState(1);
  const [isSavingReconcile, setIsSavingReconcile] = useState(false);
  const [isAcceptingId, setIsAcceptingId] = useState<string | null>(null);

  const fetchAllocationsAndLocations = useCallback(async () => {
    setIsLoading(true);
    const [allocRes, locRes] = await Promise.all([
      getStockAllocations(),
      supabase.from('locations').select('*')
    ]);

    if (allocRes.success) {
      setAllocations(allocRes.data);
    }
    if (locRes.data) {
      setLocations(locRes.data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAllocationsAndLocations();
  }, [fetchAllocationsAndLocations]);

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemType.trim() || !targetLocationId || quantityAllocated < 1) {
      toast('All dispatch fields are required.', 'error');
      return;
    }
    setIsDispatching(true);
    const res = await createStockAllocation(itemType.trim(), quantityAllocated, targetLocationId);
    setIsDispatching(false);
    if (res.success) {
      setItemType('');
      setQuantityAllocated(1);
      setTargetLocationId('');
      fetchAllocationsAndLocations();
      toast('Stock allocated and dispatched successfully.', 'success');
    } else {
      toast(res.error || 'Failed to dispatch stock.', 'error');
    }
  };

  const handleOpenReconcile = (item: any) => {
    setReconcilingItem(item);
    setReconciledQty(item.quantity_allocated);
  };

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcilingItem) return;
    setIsSavingReconcile(true);
    const res = await reconcileStockAllocation(reconcilingItem.id, reconciledQty);
    setIsSavingReconcile(false);
    if (res.success) {
      setReconcilingItem(null);
      fetchAllocationsAndLocations();
      toast('Stock reconciliation submitted.', 'success');
    } else {
      toast(res.error || 'Failed to reconcile stock.', 'error');
    }
  };

  const handleAcceptAndLog = async (id: string) => {
    setIsAcceptingId(id);
    const res = await acceptAndLogAllocation(id);
    setIsAcceptingId(null);
    if (res.success) {
      fetchAllocationsAndLocations();
      toast('Stock accepted and logged to inventory successfully.', 'success');
    } else {
      toast(res.error || 'Failed to accept stock.', 'error');
    }
  };

  const filteredAllocations = isSiteManager && assignedLocationId
    ? allocations.filter(item => item.target_location_id === assignedLocationId || item.target_locations?.id === assignedLocationId)
    : allocations;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Truck className="h-8 w-8 text-primary" /> Central Stock Allocation
          </h2>
          <p className="text-muted-foreground mt-1">
            Dispatch stock to locations and reconcile physical intake counts.
          </p>
        </div>
        <Button onClick={fetchAllocationsAndLocations} variant="outline" size="icon" disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* WIDGET: Location Binding for Site Manager, Dispatch Stock for Admins */}
        {isSiteManager ? (
          <Card className="lg:col-span-1 border border-muted/50 shadow-sm h-fit">
            <CardHeader className="border-b pb-4 bg-muted/5">
              <CardTitle className="text-lg">Location Binding</CardTitle>
              <CardDescription>You are logged in as Site Manager for your assigned location.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Assigned Location</p>
                <p className="font-semibold text-primary mt-0.5">
                  {locations.find(l => l.id === assignedLocationId)?.name || 'Taj 1'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You will only see and reconcile dispatches targeted specifically to your branch.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-1 border border-muted/50 shadow-sm h-fit">
            <CardHeader className="border-b pb-4 bg-muted/5">
              <CardTitle className="text-lg">Dispatch Stock</CardTitle>
              <CardDescription>Allocate hardware/assets to corporate branches.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleDispatch} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Item Type / Description</Label>
                  <Input
                    placeholder="e.g. Dell Chargers 65W / USB-C Hubs"
                    value={itemType}
                    onChange={e => setItemType(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Quantity Allocated</Label>
                    <Input
                      type="number"
                      min={1}
                      value={quantityAllocated}
                      onChange={e => setQuantityAllocated(Math.max(1, parseInt(e.target.value) || 1))}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Target Location</Label>
                    <Select value={targetLocationId} onValueChange={setTargetLocationId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={isDispatching}>
                  {isDispatching ? 'Dispatching...' : <><Truck size={15} /> Dispatch Shipment</>}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* SHIPMENT QUEUE */}
        <Card className="lg:col-span-2 border border-muted/50 overflow-hidden">
          <CardHeader className="border-b pb-4 bg-muted/5">
            <CardTitle className="text-lg">Shipment &amp; Allocation Log</CardTitle>
            <CardDescription>Track dispatch status, reconciliation dates, and discrepancies.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                <span className="text-sm text-muted-foreground">Loading dispatches...</span>
              </div>
            ) : filteredAllocations.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto text-muted/30 mb-2" />
                <p className="font-semibold text-base">No shipments logged</p>
                <p className="text-xs">Incoming and outgoing stock transfers will show up here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/10">
                    <TableHead className="font-semibold text-foreground py-3">Item details</TableHead>
                    <TableHead className="font-semibold text-foreground py-3">Allocated Qty</TableHead>
                    <TableHead className="font-semibold text-foreground py-3">Target Branch</TableHead>
                    <TableHead className="font-semibold text-foreground py-3">Status</TableHead>
                    <TableHead className="font-semibold text-foreground py-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAllocations.map(item => (
                    <TableRow key={item.id} className="hover:bg-muted/5">
                      <TableCell className="py-4">
                        <div className="font-semibold">{item.item_type}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Sent: {new Date(item.created_at).toLocaleDateString()}
                          {item.reconciled_at && ` · Reconciled: ${new Date(item.reconciled_at).toLocaleDateString()}`}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 font-semibold text-sm">
                        {item.quantity_allocated} units
                        {item.reconciled_quantity !== null && (
                          <div className="text-xs text-muted-foreground font-normal">
                            Recvd: {item.reconciled_quantity} units
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-muted-foreground">
                        {item.target_locations?.name || 'Unknown'}
                      </TableCell>
                      <TableCell className="py-4">
                        {item.status === 'Pending' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 gap-1 font-semibold">
                            <Clock size={11} /> Pending
                          </Badge>
                        )}
                        {item.status === 'Reconciled' && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 gap-1 font-semibold">
                            <CheckCircle2 size={11} /> Reconciled
                          </Badge>
                        )}
                        {item.status === 'Mismatch' && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/25 gap-1 font-semibold animate-pulse">
                            <AlertTriangle size={11} /> Mismatch
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        {item.status === 'Pending' && (
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" onClick={() => handleAcceptAndLog(item.id)} disabled={isAcceptingId !== null} className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm">
                              {isAcceptingId === item.id ? <Loader2 size={13} className="animate-spin" /> : 'Accept & Log'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleOpenReconcile(item)} disabled={isAcceptingId !== null} className="h-8 text-xs font-semibold">
                              Reconcile
                            </Button>
                          </div>
                        )}
                        {item.status !== 'Pending' && item.reconciled_by && (
                          <span className="text-xs text-muted-foreground font-semibold">
                            By: {item.reconciled_by}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reconciliation Dialog */}
      {reconcilingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-primary/20 p-6 rounded-xl shadow-xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Reconcile Stock Intake
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Confirm actual physical count received for <strong>{reconcilingItem.item_type}</strong>.
              </p>
            </div>
            <form onSubmit={handleReconcileSubmit} className="space-y-4">
              <div className="p-3 bg-muted/40 border border-muted/50 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Dispatched Qty:</span>
                  <span className="font-bold">{reconcilingItem.quantity_allocated} units</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Actual Quantity Received</Label>
                <Input
                  type="number"
                  min={0}
                  value={reconciledQty}
                  onChange={e => setReconciledQty(Math.max(0, parseInt(e.target.value) || 0))}
                  required
                />
              </div>
              {reconciledQty !== reconcilingItem.quantity_allocated && (
                <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-lg animate-in fade-in">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Quantity Mismatch Warning</p>
                    Reporting a mismatch will flag this shipment and alert operations.
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setReconcilingItem(null)}>Cancel</Button>
                <Button type="submit" disabled={isSavingReconcile}>
                  {isSavingReconcile ? 'Saving...' : 'Submit Reconciliation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
