'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Search, Eye, FileDown, AlertTriangle, Loader2, X, ChevronRight } from "lucide-react";

// ─── Colour map per action type ───────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
  ADD_ASSET: 'bg-green-100 text-green-700',
  EDIT_ASSET: 'bg-blue-100 text-blue-700',
  DELETE_ASSET: 'bg-destructive/10 text-destructive',
  ADD_LOCATION: 'bg-green-100 text-green-700',
  EDIT_LOCATION: 'bg-blue-100 text-blue-700',
  DELETE_LOCATION: 'bg-destructive/10 text-destructive',
  ADD_DEPARTMENT: 'bg-green-100 text-green-700',
  EDIT_DEPARTMENT: 'bg-blue-100 text-blue-700',
  DELETE_DEPARTMENT: 'bg-destructive/10 text-destructive',
  ADD_WAREHOUSE: 'bg-green-100 text-green-700',
  EDIT_WAREHOUSE: 'bg-blue-100 text-blue-700',
  DELETE_WAREHOUSE: 'bg-destructive/10 text-destructive',
  CREATE_USER: 'bg-violet-100 text-violet-700',
  DELETE_USER: 'bg-destructive/10 text-destructive',
  ISSUE_ITEM: 'bg-amber-100 text-amber-700',
  RETURN_ITEM: 'bg-sky-100 text-sky-700',
  ASSIGN_SEAT: 'bg-violet-100 text-violet-700',
  REVOKE_SEAT: 'bg-orange-100 text-orange-700',
  UPLOAD_INSTALLER: 'bg-primary/10 text-primary',
  DELETE_INSTALLER: 'bg-destructive/10 text-destructive',
};

const ALL_ACTION_TYPES = Object.keys(ACTION_COLORS);

// ─── Diff view helpers ────────────────────────────────────────────
function DiffCell({ label, oldVal, newVal }: { label: string; oldVal: unknown; newVal: unknown }) {
  const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
  return (
    <tr className={changed ? 'bg-amber-50/50' : ''}>
      <td className="px-3 py-2 text-xs font-semibold text-muted-foreground align-top border-r border-muted/40 w-32 whitespace-nowrap">{label}</td>
      <td className={`px-3 py-2 text-xs font-mono align-top border-r border-muted/40 ${changed && oldVal !== undefined ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground'}`}>
        {oldVal !== undefined && oldVal !== null ? String(oldVal) : <span className="opacity-40">—</span>}
      </td>
      <td className={`px-3 py-2 text-xs font-mono align-top ${changed && newVal !== undefined ? 'bg-green-50 text-green-800' : 'text-muted-foreground'}`}>
        {newVal !== undefined && newVal !== null ? String(newVal) : <span className="opacity-40">—</span>}
      </td>
    </tr>
  );
}

function DiffModal({ log, onClose }: { log: any; onClose: () => void }) {
  const prev = log.previous_state || {};
  const next = log.new_state || {};
  const allKeys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background border border-muted/50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-muted/40 bg-muted/5 rounded-t-xl">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" /> Audit Detail
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge className={`text-xs border-none ${ACTION_COLORS[log.action_type] || 'bg-muted text-muted-foreground'}`}>
                {log.action_type}
              </Badge>
              {log.target_identifier && <span className="text-xs text-muted-foreground font-mono">{log.target_identifier}</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              By <strong>{log.user_email}</strong> · {new Date(log.created_at).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Diff table */}
        <div className="overflow-y-auto flex-1 p-4">
          {allKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No state data recorded.</p>
          ) : (
            <table className="w-full border border-muted/40 rounded-lg overflow-hidden text-xs">
              <thead>
                <tr className="bg-muted/20">
                  <th className="text-left px-3 py-2 font-bold text-muted-foreground border-r border-muted/40 w-32">Field</th>
                  <th className="text-left px-3 py-2 font-bold text-destructive/70 border-r border-muted/40">Previous State</th>
                  <th className="text-left px-3 py-2 font-bold text-green-700">New State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted/30">
                {allKeys.map(key => (
                  <DiffCell key={key} label={key} oldVal={prev[key]} newVal={next[key]} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-muted/40 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function AdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // Check admin role from cookie
    async function checkRole() {
      try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (data?.role === 'admin') { setIsAdmin(true); fetchLogs(); }
        else { setIsAdmin(false); setIsLoading(false); }
      } catch {
        // Fallback: try fetching anyway if /api/me not implemented
        setIsAdmin(true);
        fetchLogs();
      }
    }
    checkRole();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    // Try new audit_logs table first, fall back to admin_logs
    const { data: auditData, error: auditErr } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (!auditErr && auditData && auditData.length > 0) {
      setLogs(auditData);
    } else {
      // Fallback to legacy admin_logs
      const { data: legacyData } = await supabase
        .from('admin_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      setLogs((legacyData || []).map(l => ({
        id: l.id,
        action_type: l.action || 'ACTION',
        user_email: l.performed_by || 'System',
        target_identifier: l.target_serial_number,
        previous_state: l.changes?.before || null,
        new_state: l.changes?.after || l.details || null,
        created_at: l.created_at,
      })));
    }
    setIsLoading(false);
  };

  const filtered = logs.filter(log => {
    const matchesSearch = !search ||
      log.action_type?.toLowerCase().includes(search.toLowerCase()) ||
      log.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      log.target_identifier?.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = actionFilter === 'all' || log.action_type === actionFilter;
    return matchesSearch && matchesFilter;
  });

  const handleExport = () => {
    const headers = ['Timestamp', 'Action', 'Operator', 'Target', 'Has Diff'];
    const csv = [
      headers.join(','),
      ...filtered.map(l => [
        `"${new Date(l.created_at).toLocaleString()}"`,
        `"${l.action_type}"`,
        `"${l.user_email}"`,
        `"${l.target_identifier || ''}"`,
        `"${(l.previous_state || l.new_state) ? 'Yes' : 'No'}"`,
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `AuditLogs_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (isAdmin === false) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
        <h2 className="text-xl font-bold text-destructive mb-2">Access Restricted</h2>
        <p className="text-muted-foreground text-sm">Only administrators can view audit logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Activity className="h-8 w-8" /> Admin Audit Logs
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Read-only log of all system changes. {logs.length} total entries.
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2 shrink-0">
          <FileDown className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by action, operator, or target..."
            className="pl-10"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={v => setActionFilter(v ?? 'all')}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filter by action..." />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value="all">All Actions</SelectItem>
            {ALL_ACTION_TYPES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-muted/40 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-bold">Timestamp</TableHead>
              <TableHead className="font-bold">Action</TableHead>
              <TableHead className="font-bold">Operator</TableHead>
              <TableHead className="font-bold">Target</TableHead>
              <TableHead className="font-bold text-center">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Loading audit logs...</p>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto text-muted/40 mb-2" />
                  <p className="text-sm">{search || actionFilter !== 'all' ? 'No entries match your filters.' : 'No audit logs recorded yet.'}</p>
                </TableCell>
              </TableRow>
            ) : filtered.map((log, idx) => (
              <TableRow key={log.id || idx} className="hover:bg-muted/10 transition-colors">
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell>
                  <Badge className={`text-xs border-none font-semibold ${ACTION_COLORS[log.action_type] || 'bg-muted text-muted-foreground'}`}>
                    {log.action_type}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-medium">{log.user_email || '—'}</TableCell>
                <TableCell className="text-sm font-mono text-muted-foreground max-w-[140px] truncate">
                  {log.target_identifier || '—'}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-xs h-7 hover:bg-primary/10 hover:text-primary"
                    onClick={() => setSelectedLog(log)}
                  >
                    <Eye size={12} /> View <ChevronRight size={12} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selectedLog && <DiffModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
