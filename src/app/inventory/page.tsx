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
import { Search, Plus, FileUp, FileDown, Eye, Edit, Trash2, ArrowUpDown, Check, ChevronDown, ArrowRightLeft, RotateCcw, AlertCircle, Loader2 } from "lucide-react";
import { deleteAsset } from './actions';
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [userRole, setUserRole] = useState<string>('moderator');
  const [statusFilter, setStatusFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [durationSort, setDurationSort] = useState('None');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custody modals
  const [checkoutItem, setCheckoutItem] = useState<any | null>(null);
  const [checkinItem, setCheckinItem] = useState<any | null>(null);
  const [custodyRecipient, setCustodyRecipient] = useState('');
  const [custodyCondition, setCustodyCondition] = useState('');
  const [custodyStatus, setCustodyStatus] = useState<string>('New');
  const [custodyAction, setCustodyAction] = useState<string>('RETURN');
  const [isCustodyLoading, setIsCustodyLoading] = useState(false);
  const [custodyError, setCustodyError] = useState('');
  const [subLocationsList, setSubLocationsList] = useState<any[]>([]);
  const [custodyDeptId, setCustodyDeptId] = useState('');

  useEffect(() => {
    fetchInventory();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    const { getCurrentUserRole } = await import('./actions');
    const role = await getCurrentUserRole();
    setUserRole(role);
  };

  const fetchInventory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('assets')
      .select(`
        *,
        sub_locations ( name ),
        warehouses ( name )
      `)
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setInventory(data.map((item: any) => ({
        id: item.id,
        laptopName: item.laptop_name,
        serialNumber: item.serial_number,
        assignedTo: item.assigned_to || 'Unassigned',
        location: item.location,
        locationId: item.location_id,
        subLocationId: item.sub_location_id,
        subLocationName: item.sub_locations?.name || null,
        warehouseId: item.warehouse_id,
        warehouseName: item.warehouses?.name || null,
        status: item.status,
        issueDate: item.issue_date,
        updatedAt: item.updated_at
      })));
    }
    setIsLoading(false);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      
      // Robust CSV Parser handling quotes
      const parseCSV = (str: string) => {
        const arr: string[][] = [];
        let quote = false;
        let col = 0, row = 0;
        for (let c = 0; c < str.length; c++) {
          let cc = str[c], nc = str[c+1];
          arr[row] = arr[row] || [];
          arr[row][col] = arr[row][col] || '';
          if (cc === '"' && quote && nc === '"') { arr[row][col] += cc; ++c; continue; }
          if (cc === '"') { quote = !quote; continue; }
          if (cc === ',' && !quote) { ++col; continue; }
          if (cc === '\n' && !quote) { ++row; col = 0; continue; }
          if (cc === '\r' && !quote) { continue; }
          arr[row][col] += cc;
        }
        return arr;
      };

      const rows = parseCSV(text);
      if (rows.length < 2) return;
      
      const headers = rows[0].map(h => h.trim().toLowerCase());
      
      const assets = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue;
        
        const asset: any = {};
        headers.forEach((h, idx) => {
           asset[h] = row[idx] ? row[idx].trim() : '';
        });
        
        if (!asset['serial number'] && !asset['laptop']) continue; // Ignore empty entries
        
        let extraDetails = [];
        if (asset['mouse']) extraDetails.push(`Mouse: ${asset['mouse']}`);
        if (asset['bag']) extraDetails.push(`Bag: ${asset['bag']}`);
        let baseDetails = asset['details'] || '';
        let fullDetails = [...extraDetails, baseDetails].filter(Boolean).join(' | ');

        let hddRaw = asset['hdd'] || '';
        let storageType = 'HDD';
        if (hddRaw.toLowerCase().includes('ssd')) storageType = 'SSD';
        
        let rawStatus = (asset['status'] || '').toLowerCase();
        let status = 'New';
        if (rawStatus.includes('used') || rawStatus.includes('old')) status = 'Used';
        else if (rawStatus.includes('faulty') || rawStatus.includes('dead')) status = 'Faulty';
        else if (rawStatus.includes('refub') || rawStatus.includes('repair')) status = 'Refub';
        else if (rawStatus) status = 'Used'; 

        // Required date mapping if they are missing but mandatory in form (we can fall back to null for db insert)
        const formatDate = (dateStr: string) => {
          if (!dateStr) return null;
          const match = dateStr.match(/\d{1,4}[/-]\d{1,2}[/-]\d{2,4}|\b\d{4}\b/);
          if (!match) return null;
          let d = match[0];
          
          if (/^\d{4}$/.test(d)) {
            return `${d}-01-01`; // if only year is written make it YYYY-01-01
          }
          
          const parts = d.split(/[/-]/);
          if (parts.length === 3) {
             if (parts[2].length === 4) {
               let part0 = parseInt(parts[0], 10);
               let part1 = parseInt(parts[1], 10);
               if (part0 > 12) {
                 // DD/MM/YYYY
                 return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
               } else if (part1 > 12) {
                 // MM/DD/YYYY
                 return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
               } else {
                 // Default to DD/MM/YYYY if ambiguous, or assume MM/DD/YYYY? 
                 // Let's assume MM/DD/YYYY is standard in some places, but since 11/1/2021 is usually DD/MM or MM/DD. 
                 // We'll default to DD/MM/YYYY for Pakistani context.
                 return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
               }
             } else if (parts[0].length === 4) {
               return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
             }
          }
          const parsed = new Date(d);
          if (!isNaN(parsed.getTime())) {
             return parsed.toISOString().split('T')[0];
          }
          return null;
        };

        let purchaseDate = formatDate(asset['purchase date']);
        let issueDate = formatDate(asset['issue date']);

        const formatted = {
          laptopName: asset['laptop'] || 'Unknown',
          serialNumber: asset['serial number'],
          ram: asset['ram'] || 'Unknown',
          storageCapacity: hddRaw || 'Unknown',
          storageType: storageType,
          assignedTo: asset['user name'] || '',
          location: asset['location'] || 'Unknown',
          status: status,
          oldUsername: asset['old user name'] || '',
          purchaseDate: purchaseDate,
          issueDate: issueDate,
          details: fullDetails,
        };
        assets.push(formatted);
      }
      
      try {
        const { importAssetsFromCSV } = await import('./actions');
        const result = await importAssetsFromCSV(assets);
        if (result.success) {
           alert('CSV imported successfully');
           fetchInventory();
        } else {
           alert('Error importing CSV: ' + result.error);
        }
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportToExcel = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.from('assets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      
      if (!data || data.length === 0) {
        alert("No assets found to export.");
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
          `"${(item.details || '').replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Taj_AssetFlow_Inventory_${new Date().toISOString().split('T')[0]}.csv`); 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert("Error exporting data: " + err.message);
    }
    setIsExporting(false);
  };

  const calculateDuration = (issueDate: string | null) => {
    if (!issueDate) return '-';
    const issue = new Date(issueDate);
    const now = new Date();
    let diff = (now.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (diff < 0) return '-';
    if (diff < 1) return '< 1 yr';
    return `${diff.toFixed(1)} yrs`;
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this asset?")) {
      const result = await deleteAsset(id);
      if (result.success) {
        fetchInventory();
      } else {
        alert("Error deleting asset: " + result.error);
      }
    }
  };

  const getDurationYears = (issueDate: string | null) => {
    if (!issueDate) return -1;
    const issue = new Date(issueDate);
    const now = new Date();
    let diff = (now.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return diff < 0 ? -1 : diff;
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredInventory = inventory
    .filter(item => !['Faulty', 'Snatched', 'Damaged'].includes(item.status))
    .filter(item => {
      if (statusFilter !== 'All' && item.status !== statusFilter) return false;
      if (locationFilter !== 'All' && item.location !== locationFilter) return false;
      
      const searchLower = search.toLowerCase();
      return item.serialNumber.toLowerCase().includes(searchLower) ||
             item.laptopName.toLowerCase().includes(searchLower) ||
             item.assignedTo.toLowerCase().includes(searchLower);
    })
    .sort((a, b) => {
      if (durationSort !== 'None') {
        const durA = getDurationYears(a.issueDate);
        const durB = getDurationYears(b.issueDate);
        if (durA === -1 && durB !== -1) return 1;
        if (durB === -1 && durA !== -1) return -1;
        return durationSort === 'Asc' ? durA - durB : durB - durA;
      }
      
      if (sortConfig) {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

  const uniqueLocations = Array.from(new Set(inventory.filter(i => !['Faulty', 'Snatched', 'Damaged'].includes(i.status)).map(i => i.location)));

  return (
    <>
      <div className="space-y-6">

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-primary">Inventory</h2>
          <p className="text-muted-foreground mt-1">Manage all IT assets in the Taj Gasoline organization.</p>
        </div>
        <div className="flex gap-2">
          <input 
            type="file" 
            accept=".csv" 
            ref={fileInputRef} 
            onChange={handleImportCSV} 
            className="hidden" 
          />
          <Button variant="outline" className="gap-2 bg-background hover:bg-muted" onClick={() => fileInputRef.current?.click()}>
            <FileUp className="h-4 w-4" />
            Import CSV
          </Button>
          <Button variant="outline" className="gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200" onClick={handleExportToExcel} disabled={isExporting}>
            <FileDown className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </Button>
          <Link href="/inventory/add" className={buttonVariants({ variant: "default", className: "gap-2" })}>
            <Plus className="h-4 w-4" />
            Add Asset
          </Link>
        </div>


      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Serial No, Laptop Name or User..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-md border bg-card w-full overflow-hidden">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[12%] font-semibold">Serial Number</TableHead>
              <TableHead className="w-[15%] font-semibold">Laptop Name</TableHead>
              <TableHead className="w-[12%] font-semibold">User</TableHead>
              <TableHead className="w-[12%] font-semibold relative">
                <div className="relative">
                  <button 
                    type="button"
                    onClick={() => setIsLocationOpen(!isLocationOpen)}
                    className="flex items-center gap-1 hover:text-foreground text-muted-foreground transition-colors font-semibold focus:outline-none"
                  >
                    <span>Location</span>
                    {locationFilter !== 'All' && <Check className="h-3.5 w-3.5 text-emerald-500" />}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  
                  {isLocationOpen && (
                    <>
                      {/* Invisible backdrop to close on click outside */}
                      <div className="fixed inset-0 z-40" onClick={() => { setIsLocationOpen(false); setLocationSearch(''); }} />
                      
                      <div className="absolute left-0 mt-2 w-64 rounded-lg border bg-popover text-popover-foreground shadow-md z-50 p-2 space-y-2 font-normal">
                        <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input 
                            placeholder="Search locations..." 
                            value={locationSearch}
                            onChange={(e) => setLocationSearch(e.target.value)}
                            className="pl-7 h-8 text-xs focus-visible:ring-primary/50"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setLocationFilter('All');
                              setIsLocationOpen(false);
                              setLocationSearch('');
                            }}
                            className={cn(
                              "w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center justify-between",
                              locationFilter === 'All' ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-muted"
                            )}
                          >
                            <span>All Locations</span>
                            {locationFilter === 'All' && <Check className="h-3 w-3 text-primary" />}
                          </button>
                          
                          {uniqueLocations
                            .filter(loc => (loc || '').toLowerCase().includes(locationSearch.toLowerCase()))
                            .map(loc => (
                              <button
                                type="button"
                                key={loc}
                                onClick={() => {
                                  setLocationFilter(loc);
                                  setIsLocationOpen(false);
                                  setLocationSearch('');
                                }}
                                className={cn(
                                  "w-full text-left px-2 py-1.5 rounded-md transition-colors flex items-center justify-between truncate",
                                  locationFilter === loc ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-muted"
                                )}
                              >
                                <span className="truncate">{loc}</span>
                                {locationFilter === loc && <Check className="h-3 w-3 text-primary" />}
                              </button>
                            ))}
                          
                          {uniqueLocations.filter(loc => (loc || '').toLowerCase().includes(locationSearch.toLowerCase())).length === 0 && (
                            <div className="text-muted-foreground text-center py-2">No locations found.</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </TableHead>
              <TableHead className="w-[10%] font-semibold">
                <Select onValueChange={(val) => setStatusFilter(val || 'All')} value={statusFilter}>
                  <SelectTrigger className="border-0 shadow-none bg-transparent p-0 h-auto font-semibold focus:ring-0">
                    <span className="flex items-center gap-1">
                      Status
                      {statusFilter !== 'All' && <Check className="h-4 w-4 text-emerald-500" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Statuses</SelectItem>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Used">Used</SelectItem>
                    <SelectItem value="Refub">Refurbished</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[12%] font-semibold">
                <Select onValueChange={(val) => setDurationSort(val || 'None')} value={durationSort}>
                  <SelectTrigger className="border-0 shadow-none bg-transparent p-0 h-auto font-semibold focus:ring-0">
                    <span className="flex items-center gap-1">
                      Duration
                      {durationSort !== 'None' && <Check className="h-4 w-4 text-emerald-500" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">Duration</SelectItem>
                    <SelectItem value="Asc">Low to High</SelectItem>
                    <SelectItem value="Desc">High to Low</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="w-[14%] font-semibold cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('updatedAt')}>
                <div className="flex items-center">Date Modified <ArrowUpDown className="ml-1 h-3 w-3" /></div>
              </TableHead>
              <TableHead className="w-[13%] text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  Loading assets...
                </TableCell>
              </TableRow>
            ) : filteredInventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                  No assets found.
                </TableCell>
              </TableRow>
            ) : (
              filteredInventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium truncate" title={item.serialNumber}>{item.serialNumber}</TableCell>
                  <TableCell className="truncate" title={item.laptopName}>{item.laptopName}</TableCell>
                  <TableCell className="truncate" title={item.assignedTo}>{item.assignedTo}</TableCell>
                  <TableCell className="truncate">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground truncate" title={item.location}>{item.location}</span>
                      {(item.subLocationName || item.warehouseName) && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-full">
                          {item.subLocationName || ''}
                          {item.subLocationName && item.warehouseName ? ' / ' : ''}
                          {item.warehouseName || ''}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={
                      item.status === 'Faulty' ? 'destructive' : 
                      item.status === 'New' ? 'default' : 
                      'secondary'
                    }>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-muted-foreground">{calculateDuration(item.issueDate)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(item.updatedAt).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-1 overflow-hidden">
                    <Link href={`/inventory/${item.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">View</span>
                    </Link>
                    <Link href={`/inventory/${item.id}/edit`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Link>
                    {/* Checkout button */}
                    <button
                      type="button"
                      title={['Faulty','Damaged','Snatched'].includes(item.status) ? `Cannot issue — status is ${item.status}` : 'Issue / Checkout'}
                      disabled={['Faulty','Damaged','Snatched'].includes(item.status)}
                      onClick={() => { setCheckoutItem(item); setCustodyRecipient(''); setCustodyCondition(''); setCustodyDeptId(''); setCustodyError(''); }}
                      className={cn('p-1.5 rounded-md transition-colors', ['Faulty','Damaged','Snatched'].includes(item.status) ? 'opacity-30 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50')}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                    </button>
                    {/* Check-In button */}
                    {item.status === 'Used' && (
                      <button
                        type="button"
                        title="Return / Check-In"
                        onClick={() => { setCheckinItem(item); setCustodyRecipient(''); setCustodyCondition(''); setCustodyStatus('New'); setCustodyAction('RETURN'); setCustodyError(''); }}
                        className="p-1.5 rounded-md text-green-600 hover:bg-green-50 transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
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
      </div>


    {/* ── Checkout (Issuance) Modal ──────────────────────────────── */}
    {checkoutItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2"><ArrowRightLeft className="h-5 w-5 text-primary" />Issue Item</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Checking out <strong>{checkoutItem.laptopName}</strong> ({checkoutItem.serialNumber})</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="co-recipient">Recipient Name <span className="text-destructive">*</span></Label>
              <Input id="co-recipient" placeholder="Full name of recipient" value={custodyRecipient} onChange={e => setCustodyRecipient(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co-condition">Condition at Handover <span className="text-destructive">*</span></Label>
              <textarea id="co-condition" className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="e.g. Mint condition with original power brick and laptop bag" value={custodyCondition} onChange={e => setCustodyCondition(e.target.value)} />
            </div>
          </div>
          {custodyError && <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg"><AlertCircle size={13} />{custodyError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setCheckoutItem(null)} disabled={isCustodyLoading}>Cancel</Button>
            <Button disabled={isCustodyLoading} onClick={async () => {
              if (!custodyRecipient.trim() || !custodyCondition.trim()) { setCustodyError('All fields are required.'); return; }
              setIsCustodyLoading(true); setCustodyError('');
              const { issueItem } = await import('@/app/custody/actions');
              const r = await issueItem(checkoutItem.id, custodyRecipient, custodyCondition, custodyDeptId || undefined);
              setIsCustodyLoading(false);
              if (r.success) { setCheckoutItem(null); fetchInventory(); }
              else setCustodyError(r.error || 'Failed.');
            }}>
              {isCustodyLoading ? <><Loader2 size={14} className="animate-spin mr-2" />Issuing...</> : <><ArrowRightLeft size={14} className="mr-2" />Issue Item</>}
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* ── Check-In (Return) Modal ────────────────────────────────── */}
    {checkinItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-200">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2"><RotateCcw className="h-5 w-5 text-green-600" />Return / Check-In</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Checking in <strong>{checkinItem.laptopName}</strong> ({checkinItem.serialNumber})</p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ci-recipient">Returned By <span className="text-destructive">*</span></Label>
              <Input id="ci-recipient" placeholder="Name of person returning" value={custodyRecipient} onChange={e => setCustodyRecipient(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci-condition">Physical Condition <span className="text-destructive">*</span></Label>
              <textarea id="ci-condition" className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="e.g. Minor scratches on lid, charger missing" value={custodyCondition} onChange={e => setCustodyCondition(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>New Status After Return</Label>
              <div className="grid grid-cols-2 gap-2">
                {[{v:'New',l:'Available'},{v:'Used',l:'Used'},{v:'Faulty',l:'Faulty'},{v:'Damaged',l:'Damaged'},{v:'Snatched',l:'Snatched'}].map(opt => (
                  <button key={opt.v} type="button" onClick={() => {
                    setCustodyStatus(opt.v);
                    setCustodyAction(opt.v === 'Faulty' ? 'FAULT_DEPOSIT' : opt.v === 'Snatched' ? 'SNATCH_REPORT' : 'RETURN');
                  }} className={cn('text-xs px-3 py-2 rounded-lg border transition-all font-medium', custodyStatus === opt.v ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-muted')}>{opt.l}</button>
                ))}
              </div>
            </div>
          </div>
          {custodyError && <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg"><AlertCircle size={13} />{custodyError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setCheckinItem(null)} disabled={isCustodyLoading}>Cancel</Button>
            <Button disabled={isCustodyLoading} onClick={async () => {
              if (!custodyRecipient.trim() || !custodyCondition.trim()) { setCustodyError('All fields are required.'); return; }
              setIsCustodyLoading(true); setCustodyError('');
              const { returnItem } = await import('@/app/custody/actions');
              const r = await returnItem(checkinItem.id, custodyRecipient, custodyCondition, custodyStatus as any, custodyAction as any);
              setIsCustodyLoading(false);
              if (r.success) { setCheckinItem(null); fetchInventory(); }
              else setCustodyError(r.error || 'Failed.');
            }}>
              {isCustodyLoading ? <><Loader2 size={14} className="animate-spin mr-2" />Saving...</> : <><RotateCcw size={14} className="mr-2" />Confirm Return</>}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

