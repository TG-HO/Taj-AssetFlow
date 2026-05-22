'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Check,
  Laptop,
  Package,
  Code2,
  AlertCircle,
  Info,
  MapPin,
  Loader2,
  ClipboardList,
  Database,
  Upload,
  FileArchive
} from "lucide-react";
import { supabase } from '@/lib/supabase';
import { getCategories, checkNewSerialNumber, addInventoryItem } from '../item-actions';
import { registerSoftwareInstaller } from '../../software-vault/actions';
import { useTenantSession } from '@/lib/TenantSessionContext';
import { toast } from '@/components/ui/toast';

type Classification = 'Asset' | 'Consumable' | 'Software';
interface Category { id: string; name: string; classification: Classification; }

const RAM_OPTIONS = ['4GB', '8GB', '12GB', '16GB', '24GB', '32GB', '64GB'];
const STORAGE_OPTIONS = ['128GB', '256GB', '512GB', '1TB', '2TB', '4TB', '8TB'];
const STORAGE_TYPES = ['SSD', 'HDD', 'NVMe SSD', 'eMMC'];
const STATUS_OPTIONS = [
  { value: 'New', label: 'New' },
  { value: 'Used', label: 'Used' },
  { value: 'Faulty', label: 'Faulty' },
  { value: 'Damaged', label: 'Damaged' },
  { value: 'Snatched', label: 'Snatched' },
];
const CLASSIFICATION_META: Record<Classification, { icon: React.ElementType; color: string; bg: string; desc: string }> = {
  Asset: { icon: Laptop, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', desc: 'Physical hardware with serial number tracking (Laptops, Desktops, Servers, Monitors)' },
  Consumable: { icon: Package, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', desc: 'Quantity-tracked supplies that get consumed or replaced (Mice, Keyboards, Cables)' },
  Software: { icon: Code2, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-200', desc: 'License-based software with seat and expiry tracking (Windows, Office, Antivirus)' },
};
const STEPS = [
  { id: 'classification', title: 'Classification & Type' },
  { id: 'specifications', title: 'Specifications' },
  { id: 'location', title: 'Location Assignment' },
  { id: 'review', title: 'Review & Submit' },
];

// Null-safe Select handler helper
function selectVal(setter: (v: string) => void) {
  return (val: string | null) => { if (val !== null) setter(val); };
}

export default function AddAssetPage() {
  const router = useRouter();
  const { companyId } = useTenantSession();
  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [sqlNotRun, setSqlNotRun] = useState(false);

  // Step 1
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCatsLoading, setIsCatsLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedClassification, setSelectedClassification] = useState<Classification | null>(null);
  const [itemName, setItemName] = useState('');
  const [statusState, setStatusState] = useState('New');

  // Step 2 — Asset
  const [serialNumber, setSerialNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [ram, setRam] = useState('');
  const [storageType, setStorageType] = useState('');
  const [storageCapacity, setStorageCapacity] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [serialError, setSerialError] = useState('');
  const [isCheckingSerial, setIsCheckingSerial] = useState(false);

  // Step 2 — Consumable
  const [quantity, setQuantity] = useState(1);
  const [minSafetyStock, setMinSafetyStock] = useState(0);

  // Step 2 — Software
  const [licenseKey, setLicenseKey] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [totalSeats, setTotalSeats] = useState(1);
  const [expiryDate, setExpiryDate] = useState('');

  // Shared
  const [notes, setNotes] = useState('');

  // Software installer upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dynamic upload limit from localStorage
  const [maxBytes, setMaxBytes] = useState(500 * 1024 * 1024);
  const [uploadLimitLabel, setUploadLimitLabel] = useState('500MB');

  // Software upload progress
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const savedLimit = localStorage.getItem('software_upload_limit') || '50';
    const limitMb = parseInt(savedLimit, 10) || 500;
    setMaxBytes(limitMb * 1024 * 1024);
    setUploadLimitLabel(limitMb >= 1000 ? `${(limitMb / 1000).toFixed(0)}GB` : `${limitMb}MB`);
  }, []);

  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const ALLOWED_TYPES = ['.exe', '.msi', '.zip', '.dmg', '.pkg', '.tar.gz'];

  /** Translate cryptic Supabase storage errors into user-friendly messages */
  const translateStorageError = (raw: string): string => {
    const s = raw.toLowerCase();
    if (s.includes('exceeded') && s.includes('size')) {
      return 'Upload failed: file too large for storage. In Supabase Dashboard → Storage → Settings, increase the "Upload file size limit". Also ensure fix_upload_and_auth.sql has been run in the SQL Editor.';
    }
    if (s.includes('bucket not found') || s.includes('not found')) {
      return 'Storage bucket does not exist. Run fix_upload_and_auth.sql in the Supabase Dashboard SQL Editor first, then retry.';
    }
    if (s.includes('row-level security') || s.includes('rls') || s.includes('policy')) {
      return 'Storage permission denied. Ensure fix_upload_and_auth.sql RLS policies are applied in the Supabase SQL Editor.';
    }
    return raw;
  };

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
    if (file) {
      const err = validateFile(file);
      if (err) { setUploadError(err); return; }
      setUploadFile(file);
      setUploadError('');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const err = validateFile(file);
      if (err) { setUploadError(err); return; }
      setUploadFile(file);
      setUploadError('');
    }
  };

  // Step 3 — Location
  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [subLocationsList, setSubLocationsList] = useState<any[]>([]);
  const [warehousesList, setWarehousesList] = useState<any[]>([]);
  const [isLocLoading, setIsLocLoading] = useState(true);
  const [locationId, setLocationId] = useState('');
  const [subLocationId, setSubLocationId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  // Load categories
  useEffect(() => {
    async function load() {
      setIsCatsLoading(true);
      try {
        const cats = await getCategories();
        setCategories(cats as Category[]);
      } catch (e: any) {
        // Check if it's a "table not found" error (SQL not run yet)
        const msg = e.message || '';
        if (msg.includes('item_categories') || msg.includes('relation') || msg.includes('does not exist')) {
          setSqlNotRun(true);
        } else {
          setGlobalError('Failed to load categories: ' + msg);
        }
      } finally {
        setIsCatsLoading(false);
      }
    }
    load();
  }, []);

  // Load locations
  useEffect(() => {
    async function loadLocs() {
      setIsLocLoading(true);
      const { data } = await supabase.from('locations').select('*').order('name');
      setLocationsList(data || []);
      setIsLocLoading(false);
    }
    loadLocs();
  }, []);

  // Load sub-locations/warehouses when location changes
  useEffect(() => {
    if (!locationId) { setSubLocationsList([]); setWarehousesList([]); return; }
    async function loadNested() {
      const [{ data: subs }, { data: whs }] = await Promise.all([
        supabase.from('sub_locations').select('*').eq('location_id', locationId).order('name'),
        supabase.from('warehouses').select('*').eq('location_id', locationId).order('name'),
      ]);
      setSubLocationsList(subs || []);
      setWarehousesList(whs || []);
      setSubLocationId('');
      setWarehouseId('');
    }
    loadNested();
  }, [locationId]);

  // Validation per step
  const validateStep = async (): Promise<boolean> => {
    setGlobalError(null);
    if (step === 0) {
      if (!selectedClassification) { setGlobalError('Please select an item category.'); return false; }
      if (!selectedCategoryId) { setGlobalError('Please select a sub category.'); return false; }
      if (!itemName.trim()) { setGlobalError('Please enter an item name.'); return false; }
      return true;
    }
    if (step === 1) {
      if (selectedClassification === 'Asset') {
        if (!serialNumber.trim()) { setGlobalError('Serial number is required for Asset items.'); return false; }
        setIsCheckingSerial(true);
        const isUnique = await checkNewSerialNumber(serialNumber.trim());
        setIsCheckingSerial(false);
        if (!isUnique) { setSerialError('An asset with this Serial Number is already registered.'); return false; }
        setSerialError('');
      }
      if (selectedClassification === 'Consumable') {
        if (quantity < 0) { setGlobalError('Quantity cannot be negative.'); return false; }
        if (minSafetyStock < 0) { setGlobalError('Minimum Safety Stock cannot be negative.'); return false; }
      }
      if (selectedClassification === 'Software') {
        if (totalSeats < 1) { setGlobalError('Total seats must be at least 1.'); return false; }
        if (!softwareVersion.trim()) { setGlobalError('Version is required for Software items.'); return false; }
      }
      return true;
    }
    if (step === 2) {
      if (!locationId) { setGlobalError('Please select a primary location.'); return false; }
      return true;
    }
    return true;
  };

  const handleNext = async () => {
    const valid = await validateStep();
    if (valid) setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => { setGlobalError(null); setStep(s => Math.max(s - 1, 0)); };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setGlobalError(null);
    const specs: Array<{ key: string; value: string }> = [];
    if (selectedClassification === 'Asset') {
      if (ram) specs.push({ key: 'RAM', value: ram });
      if (storageType) specs.push({ key: 'Storage_Type', value: storageType });
      if (storageCapacity) specs.push({ key: 'Storage_Capacity', value: storageCapacity });
    }
    if (selectedClassification === 'Software') {
      if (licenseKey) specs.push({ key: 'License_Key', value: licenseKey });
      if (softwareVersion) specs.push({ key: 'Version', value: softwareVersion });
      if (expiryDate) specs.push({ key: 'Expiry_Date', value: expiryDate });
      specs.push({ key: 'Total_Seats', value: String(totalSeats) });
    }
    const result = await addInventoryItem({
      category_id: selectedCategoryId,
      classification: selectedClassification!,
      name: itemName.trim(),
      status_state: statusState,
      location_id: locationId,
      sub_location_id: (selectedClassification !== 'Software' && subLocationId && subLocationId !== 'none') ? subLocationId : null,
      warehouse_id: (selectedClassification !== 'Software' && warehouseId && warehouseId !== 'none') ? warehouseId : null,
      assigned_to: assignedTo || undefined,
      notes: notes || undefined,
      serial_number: selectedClassification === 'Asset' ? serialNumber : undefined,
      part_number: selectedClassification === 'Asset' ? partNumber : undefined,
      model_number: selectedClassification === 'Asset' ? modelNumber : undefined,
      quantity: selectedClassification === 'Consumable' ? quantity : selectedClassification === 'Software' ? totalSeats : 1,
      minimum_safety_stock: selectedClassification === 'Consumable' ? minSafetyStock : 0,
      specs,
    });

    if (!result.success) {
      setGlobalError(result.error || 'Failed to save item.');
      setIsSubmitting(false);
      return;
    }

    const itemId = result.itemId;

    if (selectedClassification === 'Software' && uploadFile && itemId) {
      setIsUploading(true);
      setUploadProgress(0);

      try {
        const bucket = 'software-binaries';
        const activeCompanyId = companyId || 'default';
        const timestamp = Date.now();
        const filePath = `${activeCompanyId}/${itemId}/${timestamp}_${uploadFile.name}`;

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
          softwareVersion || '1.0'
        );

        if (!registerResult.success) {
          await supabase.storage.from(bucket).remove([filePath]);
          throw new Error(registerResult.error || 'Failed to register installer in database.');
        }
      } catch (uploadErr: any) {
        setGlobalError(`Item created successfully, but installer upload failed: ${uploadErr.message}. You can retry uploading from the Software Vault.`);
        setIsUploading(false);
        setIsSubmitting(false);
        setTimeout(() => setUploadProgress(0), 1000);
        // Still redirect to software vault so user can retry upload there
        setTimeout(() => {
          toast('Software item saved! Installer upload failed — retry from the vault.', 'error');
          router.push(`/software-vault/${itemId}`);
        }, 2500);
        return;
      }
      setIsUploading(false);
    }

    setIsSubmitting(false);
    // Redirect based on classification
    if (selectedClassification === 'Software' && itemId) {
      toast('Software item registered successfully! 🎉', 'success');
      router.push(`/software-vault/${itemId}`);
    } else {
      toast('Item added to inventory successfully!', 'success');
      router.push('/inventory');
    }
  };

  const groupedCategories = categories.reduce<Record<string, Category[]>>((acc, cat) => {
    if (!acc[cat.classification]) acc[cat.classification] = [];
    acc[cat.classification].push(cat);
    return acc;
  }, {});
  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const locationName = locationsList.find(l => l.id === locationId)?.name || '';
  const subName = subLocationsList.find(s => s.id === subLocationId)?.name || '';
  const whName = warehousesList.find(w => w.id === warehouseId)?.name || '';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-primary">Add Inventory Item</h2>
        <p className="text-muted-foreground mt-1">Register a new asset, consumable, or software license into the system.</p>
      </div>

      {/* SQL not run yet banner */}
      {sqlNotRun && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-4 rounded-xl text-sm">
          <Database className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">Database Setup Required</p>
            <p className="text-xs leading-relaxed mb-2">
              The Feature 3 schema has not been applied to your Supabase database yet. Please run the SQL script at{' '}
              <code className="bg-amber-100 px-1 rounded font-mono">supabase/feature3_schema.sql</code>{' '}
              in your <strong>Supabase SQL Editor</strong> to create the required tables and seed default categories.
            </p>
            <p className="text-xs text-amber-600">After running the script, refresh this page.</p>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="relative flex justify-between items-start pt-2">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex flex-col items-center relative z-10 flex-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${step > idx ? 'bg-primary text-primary-foreground shadow-md'
                : step === idx ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                  : 'bg-muted text-muted-foreground'
              }`}>
              {step > idx ? <Check size={16} /> : idx + 1}
            </div>
            <span className="text-[11px] font-medium mt-2 text-center leading-tight text-muted-foreground w-20">{s.title}</span>
          </div>
        ))}
        <div className="absolute top-7 left-[10%] right-[10%] h-[2px] bg-muted -z-0">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
        </div>
      </div>

      {/* Global error */}
      {globalError && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 text-destructive px-4 py-3 rounded-xl text-sm animate-in fade-in">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{globalError}</span>
        </div>
      )}

      <Card className="border-t-4 border-t-primary shadow-md mt-10">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">{STEPS[step].title}</CardTitle>
          <CardDescription>
            {step === 0 && 'Choose what type of item you are registering.'}
            {step === 1 && `Fill in the ${selectedClassification?.toLowerCase() || 'item'}-specific details.`}
            {step === 2 && 'Assign this item to a physical location in the organization.'}
            {step === 3 && 'Review all details before saving to the inventory.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="min-h-[320px] space-y-6">

          {/* ══ STEP 1: Classification & Type ══════════════════════ */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="item-classification">Item Category <span className="text-destructive">*</span></Label>
                <Select
                  value={selectedClassification || ''}
                  onValueChange={(val) => {
                    if (val) {
                      const newCls = val as Classification;
                      setSelectedClassification(newCls);
                      setSelectedCategoryId('');
                      setUploadFile(null);
                      setUploadError('');
                    }
                  }}
                  items={[
                    { value: 'Asset', label: 'Assets' },
                    { value: 'Consumable', label: 'Consumables' },
                    { value: 'Software', label: 'Software' }
                  ]}
                >
                  <SelectTrigger id="item-classification" className="w-full">
                    <SelectValue placeholder="Select Item Category (Assets, Consumables, Software)..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asset">Assets</SelectItem>
                    <SelectItem value="Consumable">Consumables</SelectItem>
                    <SelectItem value="Software">Software</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedClassification && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${CLASSIFICATION_META[selectedClassification].bg}`}>
                  {(() => {
                    const Icon = CLASSIFICATION_META[selectedClassification].icon;
                    return <Icon size={18} className={`${CLASSIFICATION_META[selectedClassification].color} shrink-0 mt-0.5`} />;
                  })()}
                  <div>
                    <p className={`text-sm font-bold ${CLASSIFICATION_META[selectedClassification].color}`}>
                      {selectedClassification === 'Asset' ? 'Assets' : selectedClassification === 'Consumable' ? 'Consumables' : 'Software'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {CLASSIFICATION_META[selectedClassification].desc}
                    </p>
                  </div>
                </div>
              )}

              {selectedClassification && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label htmlFor="category">Sub Category <span className="text-destructive">*</span></Label>
                  {isCatsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading categories...
                    </div>
                  ) : sqlNotRun ? (
                    <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-lg">
                      Run the SQL script first to load categories.
                    </div>
                  ) : (
                    <Select
                      value={selectedCategoryId}
                      onValueChange={(catId) => {
                        if (catId) {
                          setSelectedCategoryId(catId);
                          const cat = categories.find(c => c.id === catId);
                          if (cat && !itemName) {
                            setItemName(cat.name);
                          }
                        }
                      }}
                      items={categories
                        .filter(c => c.classification === selectedClassification)
                        .map(cat => ({ value: cat.id, label: cat.name }))}
                    >
                      <SelectTrigger id="category" className="w-full">
                        <SelectValue placeholder="Select Sub Category..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {categories
                          .filter(c => c.classification === selectedClassification)
                          .map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="item-name">Item Name / Description <span className="text-destructive">*</span></Label>
                <Input id="item-name" placeholder="e.g. Dell Latitude 5420 / Microsoft Office 365" value={itemName} onChange={e => setItemName(e.target.value)} />
              </div>

              {selectedClassification !== 'Software' && (
                <div className="space-y-2">
                  <Label htmlFor="status">Condition / Status</Label>
                  <Select value={statusState} onValueChange={selectVal(setStatusState)} items={STATUS_OPTIONS}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 2: Specifications (dynamic) ═══════════════════ */}
          {step === 1 && (
            <div className="space-y-5">
              {selectedClassification === 'Asset' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="serial">Serial Number <span className="text-destructive">*</span></Label>
                      <Input id="serial" placeholder="e.g. SN-DELL-001" value={serialNumber}
                        onChange={e => { setSerialNumber(e.target.value); setSerialError(''); }}
                        className={serialError ? 'border-destructive' : ''} />
                      {serialError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle size={12} />{serialError}</p>}
                      {isCheckingSerial && <p className="text-xs text-muted-foreground">Checking uniqueness...</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="model">Model Number <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                      <Input id="model" placeholder="e.g. LAT-5420-I5" value={modelNumber} onChange={e => setModelNumber(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="part">Part Number <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                    <Input id="part" placeholder="e.g. PN-12345" value={partNumber} onChange={e => setPartNumber(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>RAM</Label>
                      <Select value={ram} onValueChange={selectVal(setRam)} items={RAM_OPTIONS.map(r => ({ value: r, label: r }))}>
                        <SelectTrigger><SelectValue placeholder="Select RAM" /></SelectTrigger>
                        <SelectContent>{RAM_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Storage Type</Label>
                      <Select value={storageType} onValueChange={selectVal(setStorageType)} items={STORAGE_TYPES.map(t => ({ value: t, label: t }))}>
                        <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                        <SelectContent>{STORAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Storage Capacity</Label>
                      <Select value={storageCapacity} onValueChange={selectVal(setStorageCapacity)} items={STORAGE_OPTIONS.map(s => ({ value: s, label: s }))}>
                        <SelectTrigger><SelectValue placeholder="Select Size" /></SelectTrigger>
                        <SelectContent>{STORAGE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assigned">Assigned To <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                    <Input id="assigned" placeholder="e.g. john.doe" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} />
                  </div>
                </>
              )}

              {selectedClassification === 'Consumable' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="qty">Quantity <span className="text-destructive">*</span></Label>
                      <Input id="qty" type="number" min={0} value={quantity} onChange={e => setQuantity(Math.max(0, parseInt(e.target.value) || 0))} />
                      <p className="text-xs text-muted-foreground">Number of units currently in stock.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mss">Minimum Safety Stock</Label>
                      <Input id="mss" type="number" min={0} value={minSafetyStock} onChange={e => setMinSafetyStock(Math.max(0, parseInt(e.target.value) || 0))} />
                      <p className="text-xs text-muted-foreground">Alert threshold — reorder when stock drops below this.</p>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-700">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <div><p className="font-semibold mb-0.5">No Serial Tracking for Consumables</p>Consumables are tracked by quantity only. Individual serial numbers are not recorded.</div>
                  </div>
                </>
              )}

              {selectedClassification === 'Software' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="license-key">License Key <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                      <Input id="license-key" placeholder="e.g. XXXXX-XXXXX-XXXXX" value={licenseKey} onChange={e => setLicenseKey(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sw-version">Version <span className="text-destructive">*</span></Label>
                      <Input id="sw-version" placeholder="e.g. 2024 / v11.0" value={softwareVersion} onChange={e => setSoftwareVersion(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="seats">Total Seats / Licenses <span className="text-destructive">*</span></Label>
                      <Input id="seats" type="number" min={1} value={totalSeats} onChange={e => setTotalSeats(Math.max(1, parseInt(e.target.value) || 1))} />
                      <p className="text-xs text-muted-foreground">Number of device activations allowed.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="expiry">Subscription Expiry Date <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                      <Input id="expiry" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <Upload size={16} className="text-primary" />
                      <Label className="font-semibold text-sm">Upload Installer Binary <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Upload the installer file (.exe, .msi, .zip, .dmg) to the secure vault directly.
                    </p>

                    <div
                      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleFileDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : uploadFile ? 'border-green-400 bg-green-50' : 'border-muted hover:border-primary/50 hover:bg-muted/30'
                        }`}
                    >
                      <input ref={fileInputRef} type="file" className="hidden" accept=".exe,.msi,.zip,.dmg,.pkg,.gz" onChange={handleFileSelect} />
                      {uploadFile ? (
                        <div className="space-y-2">
                          <Check className="h-8 w-8 text-green-600 mx-auto animate-in zoom-in" />
                          <p className="font-semibold text-green-700 text-sm truncate max-w-xs mx-auto">{uploadFile.name}</p>
                          <p className="text-xs text-muted-foreground">{fmtSize(uploadFile.size)}</p>
                          <button onClick={e => { e.stopPropagation(); setUploadFile(null); }} className="text-xs text-muted-foreground hover:text-destructive underline font-semibold">Remove File</button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <FileArchive className="h-8 w-8 text-muted-foreground/50 mx-auto" />
                          <p className="text-sm font-medium text-muted-foreground">Drag & drop installer here</p>
                          <p className="text-xs text-muted-foreground/60">or click to browse — max {uploadLimitLabel}</p>
                        </div>
                      )}
                    </div>

                    {uploadError && (
                      <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded-lg">
                        <AlertCircle size={13} />{uploadError}
                      </div>
                    )}
                  </div>

                  <div className="bg-violet-50 border border-violet-200 p-3 rounded-xl flex items-start gap-2.5 text-xs text-violet-700">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>License keys and installer files are stored securely and visible only to authorized users.</p>
                  </div>
                </>
              )}

              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="notes">Notes / Remarks <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                <textarea id="notes" className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Any additional information..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          {/* ══ STEP 3: Location Assignment ═════════════════════════ */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="p-4 border border-muted/50 rounded-xl bg-muted/5 space-y-4">
                <h4 className="text-sm font-semibold text-primary flex items-center gap-2"><MapPin size={15} />Location Hierarchy</h4>
                <div className="space-y-2">
                  <Label>Primary Location <span className="text-destructive">*</span></Label>
                  {isLocLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-1"><Loader2 className="h-4 w-4 animate-spin" />Loading...</div>
                  ) : (
                    <Select
                      value={locationId}
                      onValueChange={selectVal(setLocationId)}
                      items={locationsList.map(l => ({ value: l.id, label: l.name }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Primary Location" />
                      </SelectTrigger>
                      <SelectContent>{locationsList.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                {locationId && selectedClassification !== 'Software' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <Label>Department / Sub-Location</Label>
                      {subLocationsList.length === 0 ? (
                        <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg">
                          No departments. <Link href="/settings?tab=locations" className="text-primary hover:underline font-semibold">Configure</Link>
                        </div>
                      ) : (
                        <Select
                          value={subLocationId}
                          onValueChange={selectVal(setSubLocationId)}
                          items={[
                            { value: 'none', label: 'None / Unassigned' },
                            ...subLocationsList.map(s => ({ value: s.id, label: s.name }))
                          ]}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="None / Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None / Unassigned</SelectItem>
                            {subLocationsList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Warehouse / Storage Zone</Label>
                      {warehousesList.length === 0 ? (
                        <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg">
                          No warehouses. <Link href="/settings?tab=locations" className="text-primary hover:underline font-semibold">Configure</Link>
                        </div>
                      ) : (
                        <Select
                          value={warehouseId}
                          onValueChange={selectVal(setWarehouseId)}
                          items={[
                            { value: 'none', label: 'None / Unassigned' },
                            ...warehousesList.map(w => ({ value: w.id, label: w.name }))
                          ]}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="None / Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None / Unassigned</SelectItem>
                            {warehousesList.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ STEP 4: Review & Submit ═════════════════════════════ */}
          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-2"><ClipboardList size={18} className="text-primary" /><h3 className="font-bold text-base">Submission Summary</h3></div>
              {selectedCategory && (
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${CLASSIFICATION_META[selectedClassification!].bg}`}>
                  {(() => { const Icon = CLASSIFICATION_META[selectedClassification!].icon; return <Icon size={20} className={CLASSIFICATION_META[selectedClassification!].color} />; })()}
                  <div>
                    <p className={`font-bold text-sm ${CLASSIFICATION_META[selectedClassification!].color}`}>{selectedCategory.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedClassification}
                      {selectedClassification !== 'Software' ? ` — ${statusState}` : ''}
                    </p>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-muted/50 overflow-hidden divide-y divide-muted/40">
                {[
                  { label: 'Item Name', value: itemName },
                  ...(selectedClassification !== 'Software' ? [{ label: 'Status', value: statusState }] : []),
                  ...(selectedClassification === 'Asset' ? [
                    { label: 'Serial Number', value: serialNumber || '—' },
                    { label: 'Model Number', value: modelNumber || '—' },
                    { label: 'Part Number', value: partNumber || '—' },
                    { label: 'RAM', value: ram || '—' },
                    { label: 'Storage', value: [storageType, storageCapacity].filter(Boolean).join(' · ') || '—' },
                    { label: 'Assigned To', value: assignedTo || 'Unassigned' },
                  ] : []),
                  ...(selectedClassification === 'Consumable' ? [
                    { label: 'Quantity', value: String(quantity) },
                    { label: 'Min Safety Stock', value: String(minSafetyStock) },
                  ] : []),
                  ...(selectedClassification === 'Software' ? [
                    { label: 'License Key', value: licenseKey ? '••••••••' : 'Not provided' },
                    { label: 'Version', value: softwareVersion || '—' },
                    { label: 'Total Seats', value: String(totalSeats) },
                    { label: 'Expiry Date', value: expiryDate || 'N/A' },
                    ...(uploadFile ? [{ label: 'Installer Binary', value: `${uploadFile.name} (${fmtSize(uploadFile.size)})` }] : []),
                  ] : []),
                  { label: 'Location', value: locationName || '—' },
                  ...(selectedClassification !== 'Software' && subLocationId && subLocationId !== 'none' ? [{ label: 'Department', value: subName }] : []),
                  ...(selectedClassification !== 'Software' && warehouseId && warehouseId !== 'none' ? [{ label: 'Warehouse', value: whName }] : []),
                  ...(notes ? [{ label: 'Notes', value: notes }] : []),
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-start px-4 py-2.5 hover:bg-muted/10 text-sm">
                    <span className="text-muted-foreground font-medium w-36 shrink-0">{row.label}</span>
                    <span className="text-foreground font-semibold text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-4 border-t p-6">
          {isUploading && (
            <div className="w-full space-y-2 animate-in fade-in">
              <div className="flex justify-between text-xs text-muted-foreground font-semibold">
                <span>Uploading Installer Binary...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
          <div className="flex justify-between w-full">
            <Button type="button" variant="outline" onClick={handleBack} disabled={step === 0 || isSubmitting || isCheckingSerial || isUploading}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext} disabled={isCheckingSerial || sqlNotRun}>
                {isCheckingSerial ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking...</> : <>Next <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isUploading}>
                {isUploading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</>
                ) : isSubmitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" />Save to Inventory</>
                )}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
