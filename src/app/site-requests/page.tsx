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
  FileText, Plus, CheckCircle, XCircle, Clock, Loader2, RefreshCw, Printer, Download, Trash2
} from 'lucide-react';
import { getSiteRequests, createSiteRequestsBatch, updateSiteRequestStatus } from './actions';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { toast } from '@/components/ui/toast';
import { supabase } from '@/lib/supabase';

interface RequisitionItem {
  itemType: string;
  quantity: number;
  details: string;
  specs?: string;
}

const parseCreatedBy = (str: string) => {
  if (!str) return { name: 'Unknown', email: '' };
  const matches = str.match(/(.*?)\s*\((.*?)\)/);
  if (matches) {
    return { name: matches[1].trim(), email: matches[2].trim() };
  }
  if (str.includes('@')) {
    return { name: str.split('@')[0], email: str };
  }
  return { name: str, email: '' };
};

export default function SiteRequestsPage() {
  const { profile } = useTenantSession();
  const rawRole = (profile?.role || '').toLowerCase().trim();
  const isAdminOrMod = rawRole === 'admin' || rawRole === 'administrator' || rawRole === 'moderator';
  const isRegionalPerson = !isAdminOrMod;
  const isSiteManager = isRegionalPerson;
  const userRole = isAdminOrMod ? rawRole : 'site_manager';

  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRequests, setExpandedRequests] = useState<string[]>([]);

  // Active Locations list
  const [userLocations, setUserLocations] = useState<any[]>([]);
  const [requestLocationId, setRequestLocationId] = useState('');

  // Preset Categories list
  const [presetCategories, setPresetCategories] = useState<any[]>([]);

  // Multi-item Request Form state
  const [itemType, setItemType] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [details, setDetails] = useState('');
  const [specs, setSpecs] = useState('');
  const [builderItems, setBuilderItems] = useState<RequisitionItem[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  
  // Print preview state
  const [printRequest, setPrintRequest] = useState<any | null>(null);

  const availableCategories = userRole === 'site_manager'
    ? presetCategories.filter(c => {
        const lower = c.name.toLowerCase();
        return !lower.includes('software') && !lower.includes('license') && !lower.includes('antivirus') && !lower.includes('office') && !lower.includes('os') && !lower.includes('operating system');
      })
    : presetCategories;

  const displayRequests = userRole === 'site_manager'
    ? requests.filter(req => {
        const assignedIds = [
          ...(profile?.assigned_location_ids || []),
          ...(profile?.assigned_location_id ? [profile.assigned_location_id] : [])
        ];
        return assignedIds.includes(req.location_id);
      })
    : requests;

  // Safely parse items field - handles string (old data), array, null, etc.
  const safeParseItems = (items: any): any[] => {
    if (Array.isArray(items)) return items;
    if (typeof items === 'string') {
      try { 
        const parsed = JSON.parse(items);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  };

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    const res = await getSiteRequests();
    if (res.success) {
      // Normalize items field on every record
      const normalized = (res.data || []).map((req: any) => ({
        ...req,
        items: safeParseItems(req.items)
      }));
      setRequests(normalized);
    } else {
      toast(res.error || 'Failed to fetch requests.', 'error');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Load locations and filter by assigned_location_ids if site_manager
  useEffect(() => {
    async function loadLocations() {
      const { data } = await supabase.from('locations').select('id, name');
      if (data && data.length > 0) {
        if (userRole === 'site_manager') {
          const assignedIds = [
            ...(profile?.assigned_location_ids || []),
            ...(profile?.assigned_location_id ? [profile.assigned_location_id] : [])
          ];
          const filtered = data.filter(loc => assignedIds.includes(loc.id));
          const activeLocations = filtered.length > 0 ? filtered : data;
          setUserLocations(activeLocations);
          setRequestLocationId(profile?.assigned_location_id || activeLocations[0].id);
        } else {
          setUserLocations(data);
          setRequestLocationId(data[0].id);
        }
      }
    }
    loadLocations();
  }, [profile, userRole]);

  // Load preset categories
  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('item_categories').select('name').order('name');
      if (data) {
        setPresetCategories(data);
      }
    }
    loadCategories();
  }, []);

  const handleAddItemToBuilder = () => {
    if (!itemType.trim()) {
      toast('Please select an item type.', 'error');
      return;
    }
    if (quantity < 1) {
      toast('Please enter a valid quantity.', 'error');
      return;
    }
    
    // Check if justification is empty (mandatory field)
    if (!details.trim()) {
      toast('Please enter a justification / remarks for this item.', 'error');
      return;
    }
    
    // Check if item already added to prevent duplicates
    if (builderItems.some(i => i.itemType === itemType)) {
      toast('This item type is already in your request list.', 'error');
      return;
    }

    setBuilderItems([...builderItems, { itemType, quantity, details: details.trim(), specs: specs.trim() || undefined }]);
    setItemType('');
    setQuantity(1);
    setDetails('');
    setSpecs('');
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestLocationId) {
      toast('Please select an origin branch location.', 'error');
      return;
    }
    if (builderItems.length === 0) {
      toast('Please add at least one item to your list.', 'error');
      return;
    }
    setIsSubmitting(true);
    const res = await createSiteRequestsBatch(requestLocationId, builderItems);
    setIsSubmitting(false);
    if (res.success) {
      setBuilderItems([]);
      fetchRequests();
      toast('Site requisitions submitted and routed successfully.', 'success');
    } else {
      toast(res.error || 'Failed to submit requisitions.', 'error');
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: 'Approved' | 'Rejected') => {
    setIsActionLoading(id);
    const res = await updateSiteRequestStatus(id, newStatus);
    setIsActionLoading(null);
    if (res.success) {
      fetchRequests();
      toast(`Request successfully ${newStatus.toLowerCase()}.`, 'success');
    } else {
      toast(res.error || 'Failed to update request.', 'error');
    }
  };

  const handleExportCSV = () => {
    if (requests.length === 0) {
      toast('No requests available to export.', 'error');
      return;
    }
    const headers = ['Request ID', 'Requested Item', 'Quantity', 'Origin Branch', 'Requester Name', 'Requester Email', 'Status', 'Date Submitted', 'Justification'];
    const rows: any[] = [];
    requests.forEach(req => {
      const { name, email } = parseCreatedBy(req.created_by);
      if (req.items && req.items.length > 0) {
        req.items.forEach((item: any) => {
          rows.push([
            req.id,
            item.itemType,
            item.quantity,
            req.locations?.name || 'Unknown',
            name,
            email,
            req.status,
            new Date(req.created_at).toLocaleString(),
            item.details || ''
          ]);
        });
      } else {
        rows.push([
          req.id,
          req.item_type,
          req.quantity,
          req.locations?.name || 'Unknown',
          name,
          email,
          req.status,
          new Date(req.created_at).toLocaleString(),
          req.details || ''
        ]);
      }
    });

    const csvContent = [headers.join(','), ...rows.map(row => row.map((val: any) => `"${(val ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    
    // Add UTF-8 BOM encoding so Microsoft Excel opens it correctly
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Site_Requisitions_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Spreadsheet exported successfully.', 'success');
  };

  const handleExportSingleRequestCSV = (req: any) => {
    const { name, email } = parseCreatedBy(req.created_by);
    const headers = ['Request ID', 'Requested Item', 'Quantity', 'Origin Branch', 'Requester Name', 'Requester Email', 'Status', 'Date Submitted', 'Justification'];
    const rows: any[] = [];
    
    if (req.items && req.items.length > 0) {
      req.items.forEach((item: any) => {
        rows.push([
          req.id,
          item.itemType,
          item.quantity,
          req.locations?.name || 'Unknown',
          name,
          email,
          req.status,
          new Date(req.created_at).toLocaleString(),
          item.details || ''
        ]);
      });
    } else {
      rows.push([
        req.id,
        req.item_type,
        req.quantity,
        req.locations?.name || 'Unknown',
        name,
        email,
        req.status,
        new Date(req.created_at).toLocaleString(),
        req.details || ''
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map(row => row.map((val: any) => `"${(val ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Requisition_Voucher_Report_${req.id.slice(0, 8).toUpperCase()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Spreadsheet exported successfully.', 'success');
  };

  const toggleRequestExpand = (id: string) => {
    if (expandedRequests.includes(id)) {
      setExpandedRequests(expandedRequests.filter(x => x !== id));
    } else {
      setExpandedRequests([...expandedRequests, id]);
    }
  };

  const handlePrintVoucher = () => {
    const content = document.getElementById('printable-requisition');
    if (!content) return;
    const printWin = window.open('', '_blank', 'width=800,height=600');
    if (!printWin) return;
    printWin.document.write(`<!DOCTYPE html>
<html><head><title>Requisition Voucher</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 18px; font-weight: 700; text-transform: uppercase; color: #1e40af; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; margin-bottom: 16px; }
  .header .pr-id { font-size: 11px; font-weight: 600; background: #eff6ff; color: #1e40af; padding: 3px 10px; border-radius: 999px; }
  .subtitle { font-size: 9px; color: #6b7280; }
  .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; margin-bottom: 16px; }
  .details-grid .label { font-size: 9px; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.5px; }
  .details-grid .value { font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #f9fafb; font-weight: 700; font-size: 11px; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; }
  td { padding: 8px 10px; border: 1px solid #e5e7eb; font-size: 12px; }
  td.center { text-align: center; font-family: monospace; font-weight: 700; }
  td.italic { font-style: italic; color: #6b7280; }
  .justification { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb; }
  .justification .label { font-size: 9px; text-transform: uppercase; color: #9ca3af; letter-spacing: 0.5px; }
  .justification .content { font-size: 12px; background: #f9fafb; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; font-style: italic; margin-top: 4px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 60px; padding-top: 40px; text-align: center; font-size: 11px; }
  .signatures div { border-top: 1px solid #9ca3af; padding-top: 8px; font-weight: 600; }
</style>
</head><body>${content.innerHTML}</body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 300);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">

      <div className="flex justify-between items-center no-print">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" /> Site Requests
          </h2>
          <p className="text-muted-foreground mt-1">
            Request inventory resources for your assigned site and review active requests.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userRole !== 'site_manager' && (
            <Button onClick={handleExportCSV} variant="outline" className="gap-2 shrink-0 border-primary/20 hover:bg-primary/10 text-primary">
              <Download size={15} /> Export Excel
            </Button>
          )}
          <Button onClick={fetchRequests} variant="outline" size="icon" disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 no-print">
        
        {/* REQUEST FORM: Site Manager or any user with assigned location */}
        {userRole === 'site_manager' ? (
          <Card className="lg:col-span-1 border border-muted/50 shadow-sm h-fit">
            <CardHeader className="border-b pb-4 bg-muted/5">
              <CardTitle className="text-lg">Request Asset / Stock</CardTitle>
              <CardDescription>Request items needed for your assigned branch location.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {userLocations.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg p-4 bg-muted/5">
                  <Clock className="h-8 w-8 mx-auto text-amber-500 mb-2 animate-pulse" />
                  <p className="font-semibold text-sm">No Assigned Locations</p>
                  <p className="text-xs mt-1 leading-relaxed">
                    You have not been assigned to any branch sites. Please contact an IT administrator to bind locations to your account in Settings.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="requestLocation">Target Location / Site</Label>
                    <Select value={requestLocationId} onValueChange={setRequestLocationId} items={userLocations.map(l => ({ value: l.id, label: l.name }))}>
                      <SelectTrigger id="requestLocation">
                        <SelectValue placeholder="Select target location" />
                      </SelectTrigger>
                      <SelectContent>
                        {userLocations.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border border-dashed p-3 rounded-lg space-y-4 bg-muted/5">
                    <p className="text-xs font-bold text-primary">Add Item to Requisition List</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="item-category">Select Item Type</Label>
                      <Select value={itemType} onValueChange={setItemType} items={availableCategories.map(c => ({ value: c.name, label: c.name }))}>
                        <SelectTrigger id="item-category">
                          <SelectValue placeholder="Select item type" />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          {availableCategories.map(cat => (
                            <SelectItem key={cat.name} value={cat.name}>{cat.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label htmlFor="quantity">Quantity Required</Label>
                      <Input
                        id="quantity"
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="specs">Required Specs <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                      <Input
                        id="specs"
                        placeholder="e.g. Core i7, 16GB RAM, 512GB SSD"
                        value={specs}
                        onChange={e => setSpecs(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="details">Remarks / Justification</Label>
                      <Input
                        id="details"
                        placeholder="Provide details or reasoning..."
                        value={details}
                        onChange={e => setDetails(e.target.value)}
                      />
                    </div>

                    <Button type="button" variant="outline" className="w-full gap-1 text-xs h-9 border-primary/20 hover:bg-primary/10 text-primary" onClick={handleAddItemToBuilder}>
                      <Plus size={13} /> Add to List
                    </Button>
                  </div>

                  {builderItems.length > 0 && (
                    <div className="space-y-2 border-t pt-4">
                      <Label className="font-semibold text-xs text-primary flex items-center justify-between">
                        <span>Requisition List ({builderItems.length})</span>
                        <Button variant="ghost" className="h-5 px-1.5 text-[10px] text-destructive hover:bg-destructive/10" onClick={() => setBuilderItems([])}>
                          Clear All
                        </Button>
                      </Label>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {builderItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs border p-2 rounded-lg bg-muted/20">
                            <div className="space-y-0.5">
                              <p className="font-semibold text-foreground">{item.itemType} (Qty: {item.quantity})</p>
                              {item.specs && <p className="text-[10px] text-primary font-medium">Specs: {item.specs}</p>}
                              {item.details && <p className="text-[10px] text-muted-foreground italic">"{item.details}"</p>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => setBuilderItems(builderItems.filter((_, i) => i !== idx))}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={handleBatchSubmit} className="pt-2">
                        <Button type="submit" className="w-full gap-2" disabled={isSubmitting}>
                          {isSubmitting ? 'Submitting Requisitions...' : 'Submit Batch Requisitions'}
                        </Button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="lg:col-span-1 border border-muted/50 shadow-sm h-fit">
            <CardHeader className="border-b pb-4 bg-muted/5">
              <CardTitle className="text-lg">Administration View</CardTitle>
              <CardDescription>Approve or deny asset requests submitted by branch Site Managers.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
              <p>As an administrator, you have permission to review incoming site requests and decide whether to approve or decline.</p>
              <p className="text-xs">Once status is updated, the requesting Site Manager will receive a real-time notification.</p>
            </CardContent>
          </Card>
        )}

        {/* LOGS TABLE */}
        <Card className="lg:col-span-2 border border-muted/50 overflow-hidden">
          <CardHeader className="border-b pb-4 bg-muted/5">
            <CardTitle className="text-lg">Active Requests Log</CardTitle>
            <CardDescription>Track status, branch coordinates, and resolution details.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                <span className="text-sm text-muted-foreground">Loading requests...</span>
              </div>
            ) : displayRequests.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto text-muted/30 mb-2" />
                <p className="font-semibold text-base">No requests active</p>
                <p className="text-xs">Any asset requisition forms from branches will appear here.</p>
              </div>
            ) : (
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/10">
                    <TableHead className="font-semibold text-foreground py-3 w-[40%]">Requested Item</TableHead>
                    <TableHead className="font-semibold text-foreground py-3 w-[18%]">Origin Branch</TableHead>
                    <TableHead className="font-semibold text-foreground py-3 w-[12%]">Status</TableHead>
                    <TableHead className="font-semibold text-foreground py-3 text-right w-[30%]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRequests.map(req => (
                    <TableRow key={req.id} className="hover:bg-muted/5 cursor-pointer select-none" onClick={() => toggleRequestExpand(req.id)}>
                      <TableCell className="py-4">
                        <div className="font-semibold flex items-center gap-2">
                          <span>{req.item_type}</span>
                          {req.items && req.items.length > 0 && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">
                              Batch ({req.items.length} items)
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Qty: <strong>{req.quantity}</strong> · By: {(() => {
                            const { name, email } = parseCreatedBy(req.created_by);
                            return (
                              <>
                                <span className="font-semibold text-foreground">{name}</span>
                                {email && <span className="text-[10px]"> ({email})</span>}
                              </>
                            );
                          })()}
                        </div>
                        
                        {req.items && req.items.length > 0 ? (
                          <div className="mt-1.5">
                            {expandedRequests.includes(req.id) ? (
                              <div className="space-y-1 bg-muted/10 border p-2.5 rounded-lg text-[11px] max-w-md animate-in slide-in-from-top-1 duration-200" onClick={(e) => e.stopPropagation()}>
                                <p className="font-semibold text-primary text-[10px] uppercase tracking-wider mb-1">Batch Items:</p>
                                {req.items.map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between border-b last:border-0 pb-1 last:pb-0 pt-1 first:pt-0 gap-2">
                                    <div className="flex flex-col">
                                      <span className="font-medium text-foreground">{item.itemType} (x{item.quantity})</span>
                                      {item.specs && <span className="text-[10px] text-primary font-medium">Specs: {item.specs}</span>}
                                    </div>
                                    <span className="text-muted-foreground italic truncate max-w-xs">{item.details || 'No details'}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleRequestExpand(req.id); }}>
                                ▶ Click to view {req.items.length} items...
                              </span>
                            )}
                          </div>
                        ) : (
                          req.details && (
                            <div className="text-[10px] text-muted-foreground italic mt-1 bg-muted/20 px-2 py-1 rounded border border-muted/40 max-w-sm truncate" title={req.details}>
                              &ldquo;{req.details}&rdquo;
                            </div>
                          )
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-muted-foreground">
                        {req.locations?.name || 'Unknown'}
                        <div className="text-[10px] text-muted-foreground/60 font-normal">
                          Submitted: {new Date(req.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {req.status === 'Pending' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 gap-1 font-semibold">
                            <Clock size={11} /> Pending
                          </Badge>
                        )}
                        {req.status === 'Approved' && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 gap-1 font-semibold">
                            <CheckCircle size={11} /> Approved
                          </Badge>
                        )}
                        {req.status === 'Rejected' && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/25 gap-1 font-semibold">
                            <XCircle size={11} /> Rejected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-right space-x-1.5 font-medium" onClick={(e) => e.stopPropagation()}>
                        {req.status === 'Pending' && (isSiteManager || userRole === 'site_manager') ? (
                          <span className="text-xs text-muted-foreground italic flex items-center justify-end gap-1">
                            <Clock size={12} /> Awaiting Approval
                          </span>
                        ) : req.status === 'Pending' ? (
                          <div className="flex justify-end items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-green-200 hover:bg-green-50 text-green-700 hover:text-green-800"
                              disabled={isActionLoading === req.id}
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'Approved'); }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-destructive/20 hover:bg-destructive/10 text-destructive"
                              disabled={isActionLoading === req.id}
                              onClick={(e) => { e.stopPropagation(); handleUpdateStatus(req.id, 'Rejected'); }}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:bg-primary/10"
                              onClick={(e) => { e.stopPropagation(); handleExportSingleRequestCSV(req); }}
                              title="Export to Excel"
                            >
                              <Download size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:bg-primary/10"
                              onClick={(e) => { e.stopPropagation(); setPrintRequest(req); }}
                              title="Print Voucher"
                            >
                              <Printer size={14} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end items-center gap-1.5">
                            {userRole !== 'site_manager' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                  onClick={(e) => { e.stopPropagation(); handleExportSingleRequestCSV(req); }}
                                  title="Export to Excel"
                                >
                                  <Download size={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                  onClick={(e) => { e.stopPropagation(); setPrintRequest(req); }}
                                  title="Print Voucher"
                                >
                                  <Printer size={14} />
                                </Button>
                              </>
                            )}
                          </div>
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

      {/* PRINT DIALOG PREVIEW MODAL */}
      {printRequest && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Printable Area */}
            <div id="printable-requisition" className="space-y-6 p-4" style={{ color: '#1a1a1a' }}>
              {/* Header */}
              <div className="flex justify-between items-center border-b pb-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-primary uppercase">Taj AssetFlow Requisition</h1>
                  <p className="text-[10px] text-muted-foreground">System-Generated Purchase Requisition Voucher</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    PR-{printRequest.id.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>
              
              {/* Voucher Details */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground uppercase text-[10px]">Request Date</p>
                  <p className="font-semibold mt-0.5">{new Date(printRequest.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase text-[10px]">Origin Branch</p>
                  <p className="font-semibold mt-0.5">{printRequest.locations?.name || 'Unknown Location'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase text-[10px]">Requested By</p>
                  <p className="font-semibold mt-0.5">{(() => {
                    const { name, email } = parseCreatedBy(printRequest.created_by);
                    return `${name} ${email ? `(${email})` : ''}`;
                  })()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase text-[10px]">Requisition Status</p>
                  <p className="font-semibold mt-0.5">{printRequest.status}</p>
                </div>
              </div>

              {/* Table */}
              <div className="border rounded-lg overflow-hidden mt-4">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-bold">Item Description</TableHead>
                      <TableHead className="font-bold text-center w-24">Quantity</TableHead>
                      <TableHead className="font-bold">Remarks / Justification</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {printRequest.items && printRequest.items.length > 0 ? (
                      printRequest.items.map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="font-semibold">
                            {item.itemType}
                            {item.specs && <div className="text-xs font-normal text-primary mt-0.5">Specs: {item.specs}</div>}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold">{item.quantity}</TableCell>
                          <TableCell className="italic text-muted-foreground">{item.details || 'None'}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell className="font-semibold">{printRequest.item_type}</TableCell>
                        <TableCell className="text-center font-mono font-bold">{printRequest.quantity}</TableCell>
                        <TableCell className="italic text-muted-foreground">{printRequest.details || 'None'}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Justification */}
              {printRequest.details && (
                <div className="space-y-1.5 mt-4 border-t pt-4">
                  <p className="text-muted-foreground uppercase text-[10px]">Justification Details</p>
                  <p className="text-sm bg-muted/10 p-3 rounded border italic leading-relaxed mt-0.5">
                    &ldquo;{printRequest.details}&rdquo;
                  </p>
                </div>
              )}

              {/* Signature Section */}
              <div className="grid grid-cols-2 gap-12 mt-12 pt-12 text-center text-xs">
                <div>
                  <div className="border-t border-muted/80 pt-2 font-semibold">Submitted By (Site Manager)</div>
                </div>
                <div>
                  <div className="border-t border-muted/80 pt-2 font-semibold">Authorized By (IT Administrator)</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-3 border-t pt-4 no-print">
              <Button type="button" variant="outline" onClick={() => setPrintRequest(null)}>Close</Button>
              <Button type="button" className="gap-2" onClick={handlePrintVoucher}>
                <Printer size={16} /> Print Voucher
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
