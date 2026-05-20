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
} from "lucide-react";
import { supabase } from '@/lib/supabase';
import { getCategories, checkNewSerialNumber, addInventoryItem } from '../item-actions';

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

  const handleCategorySelect = (catId: string | null) => {
    if (!catId) return;
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    setSelectedCategoryId(catId);
    setSelectedClassification(cat.classification);
    if (!itemName) setItemName(cat.name);
  };

  // Validation per step
  const validateStep = async (): Promise<boolean> => {
    setGlobalError(null);
    if (step === 0) {
      if (!selectedCategoryId) { setGlobalError('Please select an item category.'); return false; }
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
      sub_location_id: (subLocationId && subLocationId !== 'none') ? subLocationId : null,
      warehouse_id: (warehouseId && warehouseId !== 'none') ? warehouseId : null,
      assigned_to: assignedTo || undefined,
      notes: notes || undefined,
      serial_number: selectedClassification === 'Asset' ? serialNumber : undefined,
      part_number: selectedClassification === 'Asset' ? partNumber : undefined,
      model_number: selectedClassification === 'Asset' ? modelNumber : undefined,
      quantity: selectedClassification === 'Consumable' ? quantity : selectedClassification === 'Software' ? totalSeats : 1,
      minimum_safety_stock: selectedClassification === 'Consumable' ? minSafetyStock : 0,
      specs,
    });
    setIsSubmitting(false);
    if (!result.success) { setGlobalError(result.error || 'Failed to save item.'); }
    else { router.push('/inventory'); }
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
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
              step > idx ? 'bg-primary text-primary-foreground shadow-md'
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
              {(['Asset', 'Consumable', 'Software'] as Classification[]).map(cls => {
                const meta = CLASSIFICATION_META[cls];
                const Icon = meta.icon;
                return (
                  <div key={cls} className={`p-3 rounded-xl border flex items-center gap-2.5 ${meta.bg}`}>
                    <Icon size={16} className={meta.color} />
                    <div>
                      <p className={`text-sm font-bold ${meta.color}`}>{cls}</p>
                      <p className="text-xs text-muted-foreground">{meta.desc}</p>
                    </div>
                  </div>
                );
              })}

              <div className="space-y-2">
                <Label htmlFor="category">Item Category <span className="text-destructive">*</span></Label>
                {isCatsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading categories...
                  </div>
                ) : sqlNotRun ? (
                  <div className="text-sm text-muted-foreground p-3 border border-dashed rounded-lg">
                    Run the SQL script first to load categories.
                  </div>
                ) : (
                  <Select value={selectedCategoryId} onValueChange={handleCategorySelect}>
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue placeholder="Select a category..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(['Asset', 'Consumable', 'Software'] as Classification[]).map(cls => (
                        groupedCategories[cls]?.length > 0 && (
                          <div key={cls}>
                            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{cls}s</div>
                            {groupedCategories[cls].map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                          </div>
                        )
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedCategory && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={`text-xs font-semibold border-none ${
                      selectedCategory.classification === 'Asset' ? 'bg-blue-100 text-blue-700'
                      : selectedCategory.classification === 'Consumable' ? 'bg-amber-100 text-amber-700'
                      : 'bg-violet-100 text-violet-700'
                    }`}>{selectedCategory.classification}</Badge>
                    <span className="text-xs text-muted-foreground">classification selected</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="item-name">Item Name / Description <span className="text-destructive">*</span></Label>
                <Input id="item-name" placeholder="e.g. Dell Latitude 5420 / Microsoft Office 365" value={itemName} onChange={e => setItemName(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Condition / Status</Label>
                <Select value={statusState} onValueChange={selectVal(setStatusState)}>
                  <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                      <Select value={ram} onValueChange={selectVal(setRam)}>
                        <SelectTrigger><SelectValue placeholder="Select RAM" /></SelectTrigger>
                        <SelectContent>{RAM_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Storage Type</Label>
                      <Select value={storageType} onValueChange={selectVal(setStorageType)}>
                        <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                        <SelectContent>{STORAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Storage Capacity</Label>
                      <Select value={storageCapacity} onValueChange={selectVal(setStorageCapacity)}>
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
                      <Label htmlFor="sw-version">Version <span className="text-muted-foreground font-normal">(Optional)</span></Label>
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
                  <div className="bg-violet-50 border border-violet-200 p-3 rounded-xl flex items-start gap-2.5 text-xs text-violet-700">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>License keys are stored securely and visible only to administrators.</p>
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
                    <Select value={locationId} onValueChange={selectVal(setLocationId)}>
                      <SelectTrigger><SelectValue placeholder="Select Primary Location" /></SelectTrigger>
                      <SelectContent>{locationsList.map(loc => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
                {locationId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    <div className="space-y-2">
                      <Label>Department / Sub-Location</Label>
                      {subLocationsList.length === 0 ? (
                        <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg">
                          No departments. <Link href="/settings?tab=locations" className="text-primary hover:underline font-semibold">Configure</Link>
                        </div>
                      ) : (
                        <Select value={subLocationId} onValueChange={selectVal(setSubLocationId)}>
                          <SelectTrigger><SelectValue placeholder="None / Unassigned" /></SelectTrigger>
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
                        <Select value={warehouseId} onValueChange={selectVal(setWarehouseId)}>
                          <SelectTrigger><SelectValue placeholder="None / Unassigned" /></SelectTrigger>
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
                    <p className="text-xs text-muted-foreground">{selectedClassification} — {statusState}</p>
                  </div>
                </div>
              )}
              <div className="rounded-xl border border-muted/50 overflow-hidden divide-y divide-muted/40">
                {[
                  { label: 'Item Name', value: itemName },
                  { label: 'Status', value: statusState },
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
                  ] : []),
                  { label: 'Location', value: locationName || '—' },
                  ...(subLocationId && subLocationId !== 'none' ? [{ label: 'Department', value: subName }] : []),
                  ...(warehouseId && warehouseId !== 'none' ? [{ label: 'Warehouse', value: whName }] : []),
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

        <CardFooter className="flex justify-between border-t p-6">
          <Button type="button" variant="outline" onClick={handleBack} disabled={step === 0 || isSubmitting || isCheckingSerial}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Previous
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={handleNext} disabled={isCheckingSerial || sqlNotRun}>
              {isCheckingSerial ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking...</> : <>Next <ArrowRight className="ml-2 h-4 w-4" /></>}
            </Button>
          ) : (
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save to Inventory</>}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
