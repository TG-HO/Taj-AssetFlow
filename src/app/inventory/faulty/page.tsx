'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileDown, Eye, Edit, Trash2, ArrowUpDown, Check } from "lucide-react";
import { deleteAsset } from '../actions';

export default function FaultyInventoryPage() {
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [userRole, setUserRole] = useState<string>('subadmin');
  
  const [statusFilter, setStatusFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [durationSort, setDurationSort] = useState('None');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    const { getCurrentUserRole } = await import('../actions');
    const role = await getCurrentUserRole();
    setUserRole(role);
  };

  const fetchInventory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('assets').select('*').in('status', ['Faulty', 'Snatched', 'Damaged']).order('created_at', { ascending: false });
    if (!error && data) {
      setInventory(data.map(item => ({
        id: item.id,
        laptopName: item.laptop_name,
        serialNumber: item.serial_number,
        assignedTo: item.assigned_to || 'Unassigned',
        location: item.location,
        status: item.status,
        issueDate: item.issue_date,
        updatedAt: item.updated_at
      })));
    }
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
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Taj_AssetFlow_Faulty_Inventory_${new Date().toISOString().split('T')[0]}.csv`); 
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

  const getDurationYears = (issueDate: string | null) => {
    if (!issueDate) return -1;
    const issue = new Date(issueDate);
    const now = new Date();
    let diff = (now.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return diff < 0 ? -1 : diff;
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

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredInventory = inventory
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

  const uniqueLocations = Array.from(new Set(inventory.map(i => i.location)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-destructive">Faulty & Damaged Assets</h2>
          <p className="text-muted-foreground mt-1">Manage laptops that are faulty, damaged, or snatched.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200" onClick={handleExportToExcel} disabled={isExporting}>
            <FileDown className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </Button>
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
              <TableHead className="w-[12%] font-semibold">Serial Number</TableHead>
              <TableHead className="w-[15%] font-semibold">Laptop Name</TableHead>
              <TableHead className="w-[12%] font-semibold">User</TableHead>
              <TableHead className="w-[12%] font-semibold">
                <Select onValueChange={(val) => setLocationFilter(val || 'All')} value={locationFilter}>
                  <SelectTrigger className="border-0 shadow-none bg-transparent p-0 h-auto font-semibold focus:ring-0">
                    <span className="flex items-center gap-1">
                      Location
                      {locationFilter !== 'All' && <Check className="h-4 w-4 text-emerald-500" />}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Locations</SelectItem>
                    {uniqueLocations.map(loc => (
                      <SelectItem key={loc} value={loc as string}>{loc as string}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <SelectItem value="Faulty">Faulty</SelectItem>
                    <SelectItem value="Snatched">Snatched</SelectItem>
                    <SelectItem value="Damaged">Damaged (Dead)</SelectItem>
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
                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
                  Loading assets...
                </TableCell>
              </TableRow>
            ) : filteredInventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
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
                    <Badge variant="destructive">
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
