'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, Database, Download, Monitor, Shield, User } from "lucide-react";
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCSV = async () => {
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
      link.setAttribute("download", `taj_inventory_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert("Error exporting data: " + err.message);
    }
    setIsExporting(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-primary">Settings</h2>
        <p className="text-muted-foreground mt-1">Manage application preferences and system administration.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-1">
          <nav className="flex flex-col gap-1">
            <Button variant="secondary" className="justify-start shadow-none bg-primary/10 text-primary font-semibold">
              <User className="mr-2 h-4 w-4" />
              Profile & Account
            </Button>
            <Button variant="ghost" className="justify-start hover:bg-muted text-muted-foreground">
              <Monitor className="mr-2 h-4 w-4" />
              Appearance
            </Button>
            <Button variant="ghost" className="justify-start hover:bg-muted text-muted-foreground">
              <Bell className="mr-2 h-4 w-4" />
              Notifications
            </Button>
            <Button variant="ghost" className="justify-start hover:bg-muted text-muted-foreground">
              <Database className="mr-2 h-4 w-4" />
              Data & Export
            </Button>
            <Button variant="ghost" className="justify-start hover:bg-muted text-muted-foreground">
              <Shield className="mr-2 h-4 w-4" />
              Security
            </Button>
          </nav>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Organization Profile</CardTitle>
              <CardDescription>Update your company details and administrative contacts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input id="org-name" defaultValue="Taj Gasoline" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Administrator Email</Label>
                <Input id="admin-email" defaultValue="admin@tajgasoline.com" type="email" />
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4 bg-muted/20">
              <Button>Save Changes</Button>
            </CardFooter>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>System Preferences</CardTitle>
              <CardDescription>Customize how Taj AssetFlow behaves.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between space-x-2 p-4 border rounded-md bg-card">
                <div className="flex flex-col space-y-1">
                  <Label>Email Alerts</Label>
                  <span className="text-sm text-muted-foreground">Receive weekly inventory summary reports.</span>
                </div>
                <Checkbox defaultChecked className="h-5 w-5" />
              </div>
              <div className="flex items-center justify-between space-x-2 p-4 border rounded-md bg-card">
                <div className="flex flex-col space-y-1">
                  <Label>Auto-generate Passports</Label>
                  <span className="text-sm text-muted-foreground">Automatically format passport views for printing.</span>
                </div>
                <Checkbox defaultChecked className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5 shadow-sm">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <Database className="h-5 w-5" />
                Data Management
              </CardTitle>
              <CardDescription>Export your entire database records to a local file.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-4 text-muted-foreground">
                Downloading your data will generate a CSV file containing all hardware specs, assignment histories, and status logs.
              </p>
              <Button 
                variant="outline" 
                className="w-full sm:w-auto gap-2 bg-background border-primary/20 hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={handleExportCSV}
                disabled={isExporting}
              >
                <Download className="h-4 w-4" />
                {isExporting ? 'Generating CSV...' : 'Export Inventory as CSV'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
