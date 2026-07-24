'use client';

import { useState, use, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Edit, Laptop, HardDrive, User, History, MapPin, Calendar, Server, Trash2, Truck, Loader2 } from "lucide-react";
import { getAsset, deleteAsset, updateAsset, transferAsset } from '../actions';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export default function AssetPassportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { profile } = useTenantSession();
  const [asset, setAsset] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('moderator');

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [targetLocId, setTargetLocId] = useState('');
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  useEffect(() => {
    async function loadData() {
      const data = await getAsset(resolvedParams.id);
      setAsset(data);
      
      const { getCurrentUserRole } = await import('../actions');
      const role = await getCurrentUserRole();
      setUserRole(role);
      
      const { data: locs } = await supabase.from('locations').select('id, name').order('name');
      setLocationsList(locs || []);

      setIsLoading(false);
    }
    loadData();
  }, [resolvedParams.id]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading asset details...</div>;
  }

  if (!asset) {
    return <div className="p-8 text-center text-destructive">Asset not found.</div>;
  }

  const handleDelete = () => {
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleteOpen(false);
    setIsLoading(true);
    const result = await deleteAsset(resolvedParams.id);
    if (result.success) {
      router.push('/inventory');
    } else {
      alert("Error deleting asset: " + result.error);
      setIsLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    setIsLoading(true);
    const updatedData = { ...asset, locationId: asset.locationId || asset.location_id, status: newStatus };
    const result = await updateAsset(resolvedParams.id, updatedData);
    if (result.success) {
      const data = await getAsset(resolvedParams.id);
      setAsset(data);
    } else {
      alert("Error updating status: " + result.error);
    }
    setIsLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/inventory" className={buttonVariants({ variant: "ghost", size: "icon" })}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold tracking-tight text-primary">Asset Passport</h2>
              <Badge variant={
                ['Faulty', 'Damaged', 'Dead', 'Snatched'].includes(asset.status) ? 'destructive' : 
                asset.status === 'New' ? 'default' : 
                'secondary'
              } className="text-sm px-3 py-1">
                {asset.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-sm font-mono">{asset.serialNumber}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => { setTargetLocId(''); setTransferError(''); setIsTransferOpen(true); }}>
            <Truck className="h-4 w-4" />
            Transfer Location
          </Button>
          {userRole === 'admin' && (
            <Button variant="outline" className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Link href={`/inventory/${resolvedParams.id}/edit`} className={buttonVariants({ variant: "default", className: "gap-2" })}>
            <Edit className="h-4 w-4" />
            Edit Asset
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 mt-2">
        {['New', 'Used', 'Refub'].includes(asset.status) ? (
          <>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleStatusUpdate('Faulty')}>Mark as Faulty</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleStatusUpdate('Damaged')}>Mark as Damaged</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleStatusUpdate('Dead')}>Mark as Dead</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleStatusUpdate('Snatched')}>Mark as Snatched</Button>
          </>
        ) : ['Faulty', 'Damaged', 'Dead', 'Snatched'].includes(asset.status) ? (
          <>
            <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-600/30 hover:bg-emerald-50" onClick={() => handleStatusUpdate('Refub')}>Mark as Repaired (Refub)</Button>
            <Button variant="outline" size="sm" className="text-emerald-600 border-emerald-600/30 hover:bg-emerald-50" onClick={() => handleStatusUpdate('Used')}>Mark as Recovered (Used)</Button>
          </>
        ) : null}
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        
        {/* Main Column */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-t-4 border-t-primary shadow-sm">
            <CardHeader className="bg-muted/30 pb-4 border-b">
              <div className="flex items-center gap-2">
                <Laptop className="h-5 w-5 text-primary" />
                <CardTitle>Hardware Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Model Name</dt>
                  <dd className="mt-1 text-lg font-semibold">{asset.laptopName}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Serial Number</dt>
                  <dd className="mt-1 text-lg font-mono font-semibold text-primary">{asset.serialNumber}</dd>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-md"><Server className="h-5 w-5 text-primary" /></div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Memory (RAM)</dt>
                    <dd className="mt-1 font-semibold">{asset.ram}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-md"><HardDrive className="h-5 w-5 text-primary" /></div>
                  <div>
                    <dt className="text-sm font-medium text-muted-foreground">Storage</dt>
                    <dd className="mt-1 font-semibold">{asset.storageCapacity} {asset.storageType}</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 pb-4 border-b">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle>Assignment Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Currently Assigned To</dt>
                  <dd className="mt-1 text-lg font-semibold">{asset.assignedTo || 'Unassigned'}</dd>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2 rounded-md mt-1"><MapPin className="h-5 w-5 text-primary" /></div>
                  <div className="space-y-1">
                    <dt className="text-sm font-medium text-muted-foreground">Location Hierarchy</dt>
                    <dd className="font-semibold text-foreground">{asset.location}</dd>
                    {asset.subLocationName && (
                      <dd className="text-xs text-muted-foreground">
                        <span className="font-medium text-primary">Department:</span> {asset.subLocationName}
                      </dd>
                    )}
                    {asset.warehouseName && (
                      <dd className="text-xs text-muted-foreground">
                        <span className="font-medium text-primary">Warehouse:</span> {asset.warehouseName}
                      </dd>
                    )}
                  </div>
                </div>
                {asset.oldUsername && (
                  <div className="col-span-2 p-4 bg-muted/50 rounded-md border border-border/50">
                    <dt className="text-sm font-medium text-muted-foreground">Previous Owner</dt>
                    <dd className="mt-1 font-medium">{asset.oldUsername}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Side Column */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 pb-4 border-b">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <CardTitle>Lifecycle History</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-4">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Purchase Date</p>
                  <p className="font-medium">{asset.purchaseDate || 'N/A'}</p>
                </div>
              </div>
              <div className="w-px h-6 bg-border ml-2.5"></div>
              <div className="flex items-start gap-4">
                <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Issue Date</p>
                  <p className="font-medium">{asset.issueDate || 'N/A'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Admin Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{asset.details || 'No additional details provided.'}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
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

      {/* ── Transfer Location Modal ── */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2"><Truck className="h-5 w-5 text-amber-600" />Transfer Asset Location</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Transferring <strong>{asset.laptopName}</strong> ({asset.serialNumber})</p>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-muted/40 border border-muted/50 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Location:</span>
                  <span className="font-bold">{asset.location}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-target">Target Location <span className="text-destructive">*</span></Label>
                <Select value={targetLocId} onValueChange={setTargetLocId}>
                  <SelectTrigger id="tr-target">
                    <SelectValue placeholder="Select target location..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locationsList
                      .filter(loc => loc.id !== asset.locationId && loc.name !== asset.location)
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
              <Button variant="outline" onClick={() => setIsTransferOpen(false)} disabled={isTransferring}>Cancel</Button>
              <Button disabled={isTransferring || !targetLocId} onClick={async () => {
                if (!targetLocId) { setTransferError('Please select a target location.'); return; }
                setIsTransferring(true); setTransferError('');
                const r = await transferAsset(asset.id, targetLocId);
                setIsTransferring(false);
                if (r.success) {
                  setIsTransferOpen(false);
                  const updated = await getAsset(asset.id);
                  setAsset(updated);
                } else setTransferError(r.error || 'Transfer failed.');
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
