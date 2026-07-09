'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Code2, Key, Users, Calendar, Upload, Download,
  Trash2, ShieldAlert, AlertCircle, Check, Loader2,
  FileArchive, ExternalLink, UserPlus, X, Info, AlertTriangle
} from 'lucide-react';
import { getSoftwarePassport, uploadInstaller, generateDownloadUrl, assignSeat, revokeSeat, deleteInstaller, registerSoftwareInstaller, deleteSoftwarePassport } from '../actions';
import { supabase } from '@/lib/supabase';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { toast } from '@/components/ui/toast';
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

function getSpec(specs: any[], key: string) { return specs?.find((s: any) => s.spec_key === key)?.spec_value || null; }
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

const ALLOWED_TYPES = ['.exe', '.msi', '.zip', '.dmg', '.pkg', '.tar.gz'];

/** Translate cryptic Supabase storage errors into user-friendly messages */
function translateStorageError(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('exceeded') && s.includes('size')) {
    return 'File is too large for the storage bucket. Go to Supabase Dashboard → Storage → Settings and increase the "Upload file size limit". The bucket may also not exist yet — run the fix_upload_and_auth.sql script in the Supabase SQL Editor.';
  }
  if (s.includes('bucket not found') || s.includes('not found')) {
    return 'Storage bucket does not exist. Run the fix_upload_and_auth.sql script in the Supabase Dashboard SQL Editor first.';
  }
  if (s.includes('row-level security') || s.includes('rls') || s.includes('policy')) {
    return 'Storage permission denied. Ensure RLS policies are applied via fix_upload_and_auth.sql in the Supabase SQL Editor.';
  }
  if (s.includes('unauthorized') || s.includes('invalid token')) {
    return 'Authorization failed. Try refreshing the page and uploading again.';
  }
  return raw;
}

export default function SoftwarePassportPage() {
  const params = useParams();
  const router = useRouter();
  const { companyId, profile } = useTenantSession();
  const userRole = profile?.role || 'moderator';
  const itemId = params.id as string;

  const [passport, setPassport] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic upload limit from localStorage
  const [maxBytes, setMaxBytes] = useState(500 * 1024 * 1024);
  const [uploadLimitLabel, setUploadLimitLabel] = useState('500MB');

  useEffect(() => {
    const savedLimit = localStorage.getItem('software_upload_limit') || '50';
    const limitMb = parseInt(savedLimit, 10) || 500;
    setMaxBytes(limitMb * 1024 * 1024);
    setUploadLimitLabel(limitMb >= 1000 ? `${(limitMb / 1000).toFixed(0)}GB` : `${limitMb}MB`);
  }, []);

  // Seat assign state
  const [seatUser, setSeatUser] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [seatError, setSeatError] = useState('');
  const [oversubscribedModal, setOversubscribedModal] = useState(false);

  // Download state
  const [loadingDownloadId, setLoadingDownloadId] = useState<string | null>(null);

  // Delete passport state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingPassport, setIsDeletingPassport] = useState(false);
  const [installerToDelete, setInstallerToDelete] = useState<any | null>(null);

  const loadPassport = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSoftwarePassport(itemId);
      if (!data) { setError('Software item not found.'); return; }
      setPassport(data);
    } catch (e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  }, [itemId]);

  useEffect(() => {
    if (userRole === 'site_manager') {
      setIsLoading(false);
      return;
    }
    loadPassport();
  }, [loadPassport, userRole]);

  if (userRole === 'site_manager') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4 animate-in fade-in duration-300">
        <div className="h-16 w-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-2xl font-bold text-primary">Restricted Access</h2>
        <p className="text-muted-foreground max-w-md">
          The Software Vault is restricted to IT administrators and moderators. You do not have permission to view or manage software licenses.
        </p>
      </div>
    );
  }

  // ── Upload handlers ──────────────────────────────────────────────
  const validateFile = (file: File): string | null => {
    if (file.size > maxBytes) return `File exceeds ${uploadLimitLabel} limit.`;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const valid = ALLOWED_TYPES.some(t => file.name.toLowerCase().endsWith(t.replace('.', '')));
    if (!valid && !file.name.toLowerCase().endsWith('gz')) return `Unsupported type. Allowed: ${ALLOWED_TYPES.join(', ')}`;
    return null;
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) { const err = validateFile(file); if (err) { setUploadError(err); return; } setUploadFile(file); setUploadError(''); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const err = validateFile(file); if (err) { setUploadError(err); return; } setUploadFile(file); setUploadError(''); }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadVersion.trim()) { setUploadError('Version tag is required.'); return; }
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const bucket = 'software-binaries';
      const activeCompanyId = companyId || 'default';
      const filePath = `${activeCompanyId}/${itemId}/${Date.now()}_${uploadFile.name}`;

      const uploadPromise = new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-url.supabase.co';
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'mock-anon-key';
        const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`;

        supabase.auth.getSession().then(({ data: { session } }) => {
          const token = session?.access_token || supabaseAnonKey;

          xhr.open('POST', uploadUrl, true);
          xhr.setRequestHeader('apikey', supabaseAnonKey);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(pct);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              let errorMsg = 'Storage upload failed.';
              try {
                const res = JSON.parse(xhr.responseText);
                errorMsg = res.error || res.message || errorMsg;
              } catch (e) { }
              reject(new Error(translateStorageError(errorMsg)));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error during upload.'));
          };

          xhr.send(uploadFile);
        }).catch((err) => {
          reject(new Error(`Failed to retrieve session: ${err.message}`));
        });
      });

      await uploadPromise;

      const registerResult = await registerSoftwareInstaller(
        itemId,
        uploadFile.name,
        filePath,
        uploadFile.size,
        uploadVersion.trim()
      );

      if (registerResult.success) {
        setUploadFile(null);
        setUploadVersion('');
        setUploadError('');
        await loadPassport();
      } else {
        // clean up uploaded file from storage if DB registration fails
        await supabase.storage.from(bucket).remove([filePath]);
        setUploadError(registerResult.error || 'Failed to register installer in database.');
      }
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed.');
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  // ── Download handler ─────────────────────────────────────────────
  const handleDownload = async (installer: any) => {
    setLoadingDownloadId(installer.id);
    const result = await generateDownloadUrl(installer.id, installer.file_path);
    setLoadingDownloadId(null);
    if (result.success && result.url) {
      window.open(result.url, '_blank');
    } else {
      alert(result.error || 'Could not generate download link.');
    }
  };

  // ── Seat assign handler ──────────────────────────────────────────
  const handleAssignSeat = async () => {
    if (!seatUser.trim()) { setSeatError('User or machine name is required.'); return; }
    setIsAssigning(true);
    const result = await assignSeat(itemId, seatUser);
    setIsAssigning(false);
    if (result.success) { setSeatUser(''); setSeatError(''); await loadPassport(); }
    else if ((result as any).oversubscribed) { setOversubscribedModal(true); }
    else { setSeatError(result.error || 'Failed to assign seat.'); }
  };

  const handleRevokeSeat = async (allocationId: string) => {
    await revokeSeat(allocationId, itemId);
    await loadPassport();
  };

  const handleDeleteInstaller = (installer: any) => {
    setInstallerToDelete(installer);
  };

  const confirmDeleteInstaller = async () => {
    if (!installerToDelete) return;
    const temp = installerToDelete;
    setInstallerToDelete(null);
    await deleteInstaller(temp.id, temp.file_path, itemId);
    await loadPassport();
  };

  const handleDeletePassport = async () => {
    setIsDeletingPassport(true);
    const result = await deleteSoftwarePassport(itemId);
    setIsDeletingPassport(false);
    if (result.success) {
      toast('Software passport deleted successfully.', 'success');
      router.push('/software-vault');
    } else {
      toast(result.error || 'Failed to delete passport.', 'error');
      setShowDeleteModal(false);
    }
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24">
      <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
      <p className="text-muted-foreground">Loading passport...</p>
    </div>
  );

  if (error || !passport) return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-3" />
      <p className="text-xl font-bold text-destructive mb-2">Not Found</p>
      <p className="text-muted-foreground text-sm mb-6">{error}</p>
      <Button variant="outline" onClick={() => router.push('/software-vault')}>Back to Vault</Button>
    </div>
  );

  const { item, installers, allocations } = passport;
  const specs = item.inventory_specs || [];
  const licenseKey = getSpec(specs, 'License_Key');
  const version = getSpec(specs, 'Version');
  const expiryRaw = getSpec(specs, 'Expiry_Date');
  const totalSeats = item.quantity || 1;
  const usedSeats = allocations.length;
  const seatPct = Math.min(100, Math.round((usedSeats / totalSeats) * 100));
  const days = daysLeft(expiryRaw);
  const isExpired = days !== null && days < 0;
  const isExpiringSoon = days !== null && days >= 0 && days <= 30;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" onClick={() => router.push('/software-vault')} className="gap-2 text-muted-foreground hover:text-foreground mt-1">
          <ArrowLeft size={16} /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-3xl font-bold tracking-tight text-primary">{item.name}</h2>
            {isExpired && <Badge className="bg-destructive/10 text-destructive border-none gap-1"><ShieldAlert size={12} />License Expired</Badge>}
            {isExpiringSoon && !isExpired && <Badge className="bg-amber-100 text-amber-700 border-none">Expiring in {days}d</Badge>}
          </div>
          <p className="text-muted-foreground text-sm">{item.item_categories?.name} · {item.status_state}</p>
        </div>
        <Button
          variant="outline"
          className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive shrink-0 mt-1"
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 size={14} /> Delete Passport
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── LEFT: Subscription Health ── */}
        <div className="lg:col-span-1 space-y-5">
          <Card className="border border-muted/50 shadow-sm">
            <CardHeader className="pb-3 bg-muted/5 border-b">
              <CardTitle className="text-base flex items-center gap-2"><Key size={16} className="text-primary" />Subscription Health</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-sm">
              {licenseKey && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">LICENSE KEY</p>
                  <p className="font-mono text-xs bg-muted/30 px-2 py-1.5 rounded border border-muted/50 truncate">{licenseKey}</p>
                </div>
              )}
              {version && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">VERSION</p>
                  <p className="font-semibold">v{version}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">SEAT UTILIZATION</p>
                <div className="flex justify-between text-xs mb-1">
                  <span>{usedSeats} used</span>
                  <span className="font-bold">{usedSeats} / {totalSeats}</span>
                </div>
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${seatPct >= 100 ? 'bg-destructive' : seatPct > 75 ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${seatPct}%` }}
                  />
                </div>
                {seatPct >= 100 && <p className="text-xs text-destructive font-semibold mt-1">All seats allocated</p>}
              </div>
              {expiryRaw && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">EXPIRY DATE</p>
                  <p className={`font-semibold text-sm flex items-center gap-1.5 ${isExpired ? 'text-destructive' : isExpiringSoon ? 'text-amber-600' : ''}`}>
                    <Calendar size={13} />
                    {new Date(expiryRaw).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  {days !== null && (
                    <p className={`text-xs mt-0.5 ${isExpired ? 'text-destructive' : isExpiringSoon ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      {isExpired ? `Expired ${Math.abs(days)} days ago` : `${days} days remaining`}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seat Allocations */}
          <Card className="border border-muted/50 shadow-sm">
            <CardHeader className="pb-3 bg-muted/5 border-b">
              <CardTitle className="text-base flex items-center gap-2"><Users size={16} className="text-primary" />Seat Allocations</CardTitle>
              <CardDescription>{usedSeats} of {totalSeats} seats assigned</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="User or machine name"
                  value={seatUser}
                  onChange={e => { setSeatUser(e.target.value); setSeatError(''); }}
                  className="text-sm"
                />
                <Button size="icon" onClick={handleAssignSeat} disabled={isAssigning} className="shrink-0">
                  {isAssigning ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                </Button>
              </div>
              {seatError && <p className="text-xs text-destructive">{seatError}</p>}

              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {allocations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No seats assigned yet</p>
                ) : allocations.map((alloc: any) => (
                  <div key={alloc.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-1.5 text-xs group">
                    <div>
                      <p className="font-semibold">{alloc.allocated_user_id}</p>
                      {alloc.assigned_asset?.name && <p className="text-muted-foreground">{alloc.assigned_asset.name}</p>}
                    </div>
                    <button onClick={() => handleRevokeSeat(alloc.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: Upload + Downloads ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Upload Portal */}
          <Card className="border border-muted/50 shadow-sm">
            <CardHeader className="pb-3 bg-muted/5 border-b">
              <CardTitle className="text-base flex items-center gap-2"><Upload size={16} className="text-primary" />Installer Upload Portal</CardTitle>
              <CardDescription>Upload .exe, .msi, .zip, .dmg, .pkg files up to {uploadLimitLabel}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {/* Drag & Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : uploadFile ? 'border-green-400 bg-green-50' : 'border-muted hover:border-primary/50 hover:bg-muted/30'
                  }`}
              >
                <input ref={fileInputRef} type="file" className="hidden" accept=".exe,.msi,.zip,.dmg,.pkg,.gz" onChange={handleFileSelect} />
                {uploadFile ? (
                  <div className="space-y-2">
                    <Check className="h-8 w-8 text-green-600 mx-auto" />
                    <p className="font-semibold text-green-700">{uploadFile.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtSize(uploadFile.size)}</p>
                    <button onClick={e => { e.stopPropagation(); setUploadFile(null); }} className="text-xs text-muted-foreground hover:text-destructive underline">Remove</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <FileArchive className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                    <p className="text-sm font-medium text-muted-foreground">Drag & drop installer here</p>
                    <p className="text-xs text-muted-foreground/60">or click to browse — max {uploadLimitLabel}</p>
                  </div>
                )}
              </div>

              {uploadFile && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="version" className="text-xs">Version Tag <span className="text-destructive">*</span></Label>
                    <Input id="version" placeholder="e.g. v2024.1 or 11.0.2" value={uploadVersion} onChange={e => setUploadVersion(e.target.value)} className="text-sm" />
                  </div>
                  <Button onClick={handleUpload} disabled={isUploading} className="gap-2 shrink-0">
                    {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              )}

              {/* Progress Bar */}
              {uploadProgress > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Uploading...</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
                  <AlertCircle size={13} />{uploadError}
                </div>
              )}

              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 p-3 rounded-lg">
                <Info size={13} className="shrink-0 mt-0.5" />
                <p>Files are stored in a private Supabase Storage bucket. Access requires a time-limited signed URL generated on demand.</p>
              </div>
            </CardContent>
          </Card>

          {/* Installers List */}
          <Card className="border border-muted/50 shadow-sm">
            <CardHeader className="pb-3 bg-muted/5 border-b">
              <CardTitle className="text-base flex items-center gap-2"><Download size={16} className="text-primary" />Available Installers</CardTitle>
              <CardDescription>{installers.length} file{installers.length !== 1 ? 's' : ''} uploaded</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {installers.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  <FileArchive className="h-8 w-8 mx-auto text-muted/40 mb-2" />
                  No installers uploaded yet.
                </div>
              ) : (
                <div className="divide-y divide-muted/40">
                  {installers.map((inst: any) => (
                    <div key={inst.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/10 transition-colors">
                      <FileArchive className="h-8 w-8 text-primary/60 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{inst.file_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-none">v{inst.version}</Badge>
                          <span className="text-xs text-muted-foreground">{fmtSize(inst.file_size_bytes)}</span>
                          <span className="text-xs text-muted-foreground">↓{inst.download_count}</span>
                          <span className="text-xs text-muted-foreground">{new Date(inst.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm" variant="outline"
                          className="gap-1.5 h-7 text-xs"
                          disabled={loadingDownloadId === inst.id}
                          onClick={() => handleDownload(inst)}
                        >
                          {loadingDownloadId === inst.id ? <Loader2 size={11} className="animate-spin" /> : <ExternalLink size={11} />}
                          Get Link
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteInstaller(inst)}>
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Oversubscription Modal */}
      {oversubscribedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-destructive/20 p-6 rounded-xl shadow-xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-destructive">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-lg font-bold">License Seats Fully Allocated</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              All <strong>{totalSeats} seats</strong> have been assigned. To add a new allocation, revoke a seat from a retired workstation first.
            </p>
            <div className="flex justify-end">
              <Button variant="outline" className="border-destructive/30" onClick={() => setOversubscribedModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Passport Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-destructive/30 p-6 rounded-xl shadow-xl w-full max-w-md space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Delete Software Passport</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive space-y-1">
              <p className="font-semibold">This will permanently delete:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-destructive/80">
                <li>The software item <strong>{item.name}</strong></li>
                <li>All {installers.length} uploaded installer file{installers.length !== 1 ? 's' : ''} from storage</li>
                <li>All {allocations.length} seat allocation{allocations.length !== 1 ? 's' : ''}</li>
                <li>All license metadata and specs</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="outline" onClick={() => setShowDeleteModal(false)} disabled={isDeletingPassport}>Cancel</Button>
              <Button
                className="bg-destructive text-white hover:bg-destructive/90 gap-2"
                onClick={handleDeletePassport}
                disabled={isDeletingPassport}
              >
                {isDeletingPassport ? <><Loader2 size={14} className="animate-spin" />Deleting...</> : <><Trash2 size={14} />Delete Permanently</>}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Installer Confirm Modal */}
      <AlertDialog open={installerToDelete !== null} onOpenChange={(open) => { if (!open) setInstallerToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive font-bold flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Installer File?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the installer file <strong>{installerToDelete?.file_name}</strong> from the Software Vault? This will delete it permanently from cloud storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDeleteInstaller}>
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
