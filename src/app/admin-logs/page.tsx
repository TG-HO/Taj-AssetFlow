'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileDown, Activity, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('admin_logs').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  };

  const handleExportToExcel = () => {
    if (logs.length === 0) return alert("No logs to export");
    const headers = ['Action', 'Performed By', 'Target Serial Number', 'Details', 'Date'];
    const csvContent = [
      headers.join(','),
      ...logs.map(log => [
        `"${log.action || ''}"`,
        `"${log.performed_by || ''}"`,
        `"${log.target_serial_number || ''}"`,
        `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`,
        `"${new Date(log.created_at).toLocaleString()}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Admin_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Activity className="h-8 w-8" />
            Admin Logs
          </h2>
          <p className="text-muted-foreground mt-1">Audit trail of all administrative actions in the system.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportToExcel} disabled={logs.length === 0 || isLoading}>
            <FileDown className="h-4 w-4" />
            Export to Excel
          </Button>
        </div>
      </div>
      
      <div className="rounded-md border bg-card w-full overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date & Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Performed By</TableHead>
              <TableHead>Target Asset (SN)</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Loading logs...</TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No logs found.</TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow 
                  key={log.id} 
                  onClick={() => { setSelectedLog(log); setIsDialogOpen(true); }}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="font-medium">{new Date(log.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.action}</Badge>
                  </TableCell>
                  <TableCell>{log.performed_by}</TableCell>
                  <TableCell>{log.target_serial_number || '-'}</TableCell>
                  <TableCell className="max-w-xs truncate" title={JSON.stringify(log.details)}>
                    <div className="flex items-center gap-2">
                      <span className="truncate">{log.changes ? 'View Changes...' : 'View Details...'}</span>
                      <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Details</DialogTitle>
            <DialogDescription>
              Full information about this administrative action.
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-lg">
                <div><span className="font-semibold text-muted-foreground block mb-1">Action</span> <Badge>{selectedLog.action}</Badge></div>
                <div><span className="font-semibold text-muted-foreground block mb-1">Performed By</span> {selectedLog.performed_by}</div>
                <div><span className="font-semibold text-muted-foreground block mb-1">Target SN</span> {selectedLog.target_serial_number || '-'}</div>
                <div><span className="font-semibold text-muted-foreground block mb-1">Date</span> {new Date(selectedLog.created_at).toLocaleString()}</div>
              </div>

              {selectedLog.changes && (
                <div>
                  <h3 className="font-semibold text-lg mb-3">Changes</h3>
                  <div className="border rounded-md bg-card overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Attribute</TableHead>
                          <TableHead>Old Value</TableHead>
                          <TableHead>New Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(selectedLog.changes).map(([key, vals]: [string, any]) => (
                          <TableRow key={key}>
                            <TableCell className="font-medium capitalize">{key.replace(/_/g, ' ')}</TableCell>
                            <TableCell className="text-destructive bg-destructive/5 font-mono text-xs">{String(vals.old ?? 'null')}</TableCell>
                            <TableCell className="text-emerald-600 bg-emerald-50 font-mono text-xs">{String(vals.new ?? 'null')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-lg mb-3">Raw Details</h3>
                <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs font-mono border">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
