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
import { Search, Plus, FileUp, FileDown, Eye, Edit, Trash2 } from "lucide-react";
import { deleteAsset } from './actions';

export default function InventoryPage() {
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [userRole, setUserRole] = useState<string>('subadmin');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const { data, error } = await supabase.from('assets').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setInventory(data.map(item => ({
        id: item.id,
        laptopName: item.laptop_name,
        serialNumber: item.serial_number,
        assignedTo: item.assigned_to || 'Unassigned',
        location: item.location,
        status: item.status,
        issueDate: item.issue_date
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

  const filteredInventory = inventory.filter(item => 
    item.serialNumber.toLowerCase().includes(search.toLowerCase()) ||
    item.laptopName.toLowerCase().includes(search.toLowerCase()) ||
    item.assignedTo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
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
              <TableHead className="w-[15%] font-semibold">Serial Number</TableHead>
              <TableHead className="w-[18%] font-semibold">Laptop Name</TableHead>
              <TableHead className="w-[15%] font-semibold">User</TableHead>
              <TableHead className="w-[15%] font-semibold">Location</TableHead>
              <TableHead className="w-[12%] font-semibold">Status</TableHead>
              <TableHead className="w-[12%] font-semibold">Duration</TableHead>
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
                  <TableCell className="truncate" title={item.location}>{item.location}</TableCell>
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
                  <TableCell className="text-right flex justify-end gap-1 overflow-hidden">
                    <Link href={`/inventory/${item.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">View</span>
                    </Link>
                    <Link href={`/inventory/${item.id}/edit`} className={buttonVariants({ variant: "ghost", size: "icon" })}>
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Link>
                    {userRole === 'superadmin' && (
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
  );
}
