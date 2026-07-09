'use client';

import { useState, use, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ArrowRight, Save, Check } from "lucide-react";
import { getAsset, updateAsset, checkSerialNumber } from "../../actions";
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { EmployeeSelect } from '@/components/ui/employee-select';
import { useTenantSession } from '@/lib/TenantSessionContext';

const formSchema = z.object({
  // Step 1
  laptopName: z.string().min(2, 'Laptop name is required'),
  serialNumber: z.string().min(5, 'Serial number is required'),
  ram: z.string().min(1, 'RAM is required'),
  // Step 2
  storageType: z.enum(['SSD', 'HDD']),
  storageCapacity: z.string().min(1, 'Storage capacity is required'),
  // Step 3
  assignedTo: z.string().optional().nullable(),
  locationId: z.string().uuid('Location is required'),
  subLocationId: z.string().optional().nullable(),
  warehouseId: z.string().optional().nullable(),
  status: z.enum(['New', 'Refub', 'Used', 'Faulty', 'Snatched', 'Damaged']),
  oldUsername: z.string().optional().nullable(),
  // Step 4
  purchaseDate: z.string().optional().nullable(),
  issueDate: z.string().optional().nullable(),
  details: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  const isUnassigned = !data.assignedTo || data.assignedTo.trim() === '' || data.assignedTo.toLowerCase() === 'unassigned';

  if (data.status === 'Used' && (!data.oldUsername || data.oldUsername.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Old Username is mandatory when status is 'Used'",
      path: ["oldUsername"],
    });
  }

  // Conditional dates check
  if (isUnassigned) {
    if (!data.purchaseDate || data.purchaseDate.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purchase date is required for unassigned assets",
        path: ["purchaseDate"],
      });
    }
  } else {
    // Assigned to employee
    if (!data.purchaseDate || data.purchaseDate.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purchase date is required",
        path: ["purchaseDate"],
      });
    }
    if (!data.issueDate || data.issueDate.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Issue date is required when assigned to an employee",
        path: ["issueDate"],
      });
    }
    if (data.purchaseDate && data.issueDate && data.purchaseDate.trim() !== '' && data.issueDate.trim() !== '') {
      if (new Date(data.issueDate) < new Date(data.purchaseDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Issue date cannot be before purchase date",
          path: ["issueDate"],
        });
      }
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

const steps = [
  { id: 'Hardware Specs', title: 'Hardware Specifications' },
  { id: 'Storage', title: 'Storage Configuration' },
  { id: 'Assignment', title: 'Assignment & Status' },
  { id: 'History', title: 'History & Notes' },
];

export default function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = useTenantSession();
  const userRole = profile?.role || 'moderator';
  const router = useRouter();
  const resolvedParams = use(params);

  const [isLoading, setIsLoading] = useState(true);
  const [assetData, setAssetData] = useState<any>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, trigger, watch, setValue, setError, reset, control } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      laptopName: '',
      serialNumber: '',
      ram: '',
      storageType: 'SSD',
      storageCapacity: '',
      assignedTo: '',
      locationId: '',
      subLocationId: '',
      warehouseId: '',
      status: 'New',
      oldUsername: '',
      purchaseDate: '',
      issueDate: '',
      details: '',
    },
    mode: 'onChange'
  });

  const statusValue = watch('status');
  const storageTypeValue = watch('storageType');
  const locationIdValue = watch('locationId');
  const assignedToValue = watch('assignedTo');
  
  const isUnassigned = !assignedToValue || assignedToValue.trim() === '' || assignedToValue.toLowerCase() === 'unassigned';

  useEffect(() => {
    if (isUnassigned) {
      setValue('subLocationId', null);
      setValue('issueDate', null);
    }
  }, [isUnassigned, setValue]);

  const [locationsList, setLocationsList] = useState<any[]>([]);
  const [subLocationsList, setSubLocationsList] = useState<any[]>([]);
  const [warehousesList, setWarehousesList] = useState<any[]>([]);
  const [isLoadingLocs, setIsLoadingLocs] = useState(true);

  const isInitialLoad = useRef(true);

  useEffect(() => {
    async function loadData() {
      const data = await getAsset(resolvedParams.id);
      if (data) {
        setAssetData(data);
        
        // Fetch locations list
        const { data: locs } = await supabase.from('locations').select('*').order('name');
        setLocationsList(locs || []);
        
        // Fetch nested sub-locations and warehouses for loaded locationId
        if (data.locationId) {
          const { data: subs } = await supabase.from('sub_locations').select('*').eq('location_id', data.locationId).order('name');
          const { data: whs } = await supabase.from('warehouses').select('*').eq('location_id', data.locationId).order('name');
          setSubLocationsList(subs || []);
          setWarehousesList(whs || []);
        }

        reset({
          laptopName: data.laptopName || '',
          serialNumber: data.serialNumber || '',
          ram: data.ram || '',
          storageType: (data.storageType as any) || 'SSD',
          storageCapacity: data.storageCapacity || '',
          assignedTo: data.assignedTo || '',
          locationId: data.locationId || '',
          subLocationId: data.subLocationId || '',
          warehouseId: data.warehouseId || '',
          status: (data.status as any) || 'New',
          oldUsername: data.oldUsername || '',
          purchaseDate: data.purchaseDate || '',
          issueDate: data.issueDate || '',
          details: data.details || '',
        });
      }
      setIsLoadingLocs(false);
      setIsLoading(false);
    }
    loadData();
  }, [resolvedParams.id, reset]);

  useEffect(() => {
    if (!locationIdValue) {
      setSubLocationsList([]);
      setWarehousesList([]);
      if (!isInitialLoad.current) {
        setValue('subLocationId', '');
        setValue('warehouseId', '');
      }
      return;
    }
    
    async function loadNested() {
      const { data: subs } = await supabase.from('sub_locations').select('*').eq('location_id', locationIdValue).order('name');
      const { data: whs } = await supabase.from('warehouses').select('*').eq('location_id', locationIdValue).order('name');
      
      setSubLocationsList(subs || []);
      setWarehousesList(whs || []);
      
      if (!isInitialLoad.current) {
        setValue('subLocationId', '');
        setValue('warehouseId', '');
      } else {
        isInitialLoad.current = false;
      }
    }
    
    loadNested();
  }, [locationIdValue, setValue]);

  const processNext = async () => {
    let fieldsToValidate: any[] = [];
    if (currentStep === 0) fieldsToValidate = ['laptopName', 'serialNumber', 'ram'];
    if (currentStep === 1) fieldsToValidate = ['storageType', 'storageCapacity'];
    if (currentStep === 2) fieldsToValidate = ['assignedTo', 'locationId', 'subLocationId', 'warehouseId', 'status', 'oldUsername'];
    
    const isStepValid = await trigger(fieldsToValidate as any);

    if (currentStep === 0 && isStepValid) {
      const serialNumber = watch('serialNumber');
      const isUnique = await checkSerialNumber(serialNumber, resolvedParams.id);
      if (!isUnique) {
        setError('serialNumber', { type: 'custom', message: 'This Serial Number already exists in another asset' });
        return;
      }
    }

    if (currentStep === 2 && isStepValid) {
      const formValues = watch();
      if (formValues.status === 'Used' && (!formValues.oldUsername || formValues.oldUsername.trim() === '')) {
        setError('oldUsername', { type: 'custom', message: "Old Username is mandatory when status is 'Used'" });
        return;
      }
    }

    if (currentStep === 3 && isStepValid) {
      const formValues = watch();
      if (formValues.purchaseDate && formValues.issueDate) {
        if (new Date(formValues.issueDate) < new Date(formValues.purchaseDate)) {
          setError('issueDate', { type: 'custom', message: "Issue date cannot be before purchase date" });
          return;
        }
      }
    }

    if (isStepValid) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    }
  };

  const processPrevious = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    const cleanedData = {
      ...data,
      subLocationId: (data.subLocationId === 'none' || data.subLocationId === '') ? null : data.subLocationId,
      warehouseId: (data.warehouseId === 'none' || data.warehouseId === '') ? null : data.warehouseId,
    };
    const result = await updateAsset(resolvedParams.id, cleanedData);
    setIsSubmitting(false);

    if (!result.success) {
      alert("Error updating asset: " + result.error);
      return;
    }

    router.push(`/inventory/${resolvedParams.id}`);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading asset details...</div>;
  }

  if (!assetData) {
    return <div className="p-8 text-center text-destructive">Asset not found.</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary">Edit Asset</h2>
          <p className="text-muted-foreground mt-1">Update details for asset {assetData.serialNumber}.</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex justify-between items-center mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center relative z-10">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors
              ${currentStep > index ? 'bg-primary text-primary-foreground' : 
                currentStep === index ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 
                'bg-muted text-muted-foreground'}`}
            >
              {currentStep > index ? <Check size={18} /> : index + 1}
            </div>
            <span className="text-xs font-medium mt-2 absolute -bottom-6 w-32 text-center">
              {step.id}
            </span>
          </div>
        ))}
        {/* Connecting Lines */}
        <div className="absolute top-5 left-0 w-full h-[2px] bg-muted -z-10 px-6">
          <div 
            className="h-full bg-primary transition-all duration-300" 
            style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }} 
          />
        </div>
      </div>

      <div className="mt-12">
        <Card className="border-t-4 border-t-primary shadow-md">
          <form 
            onSubmit={handleSubmit(onSubmit)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (currentStep < steps.length - 1) {
                  processNext();
                } else {
                  handleSubmit(onSubmit)();
                }
              }
            }}
          >
            <CardHeader>
              <CardTitle>{steps[currentStep].title}</CardTitle>
              <CardDescription>
                {currentStep === 0 && "Basic details and processing power."}
                {currentStep === 1 && "Internal storage capacities and drive types."}
                {currentStep === 2 && "Current location, state, and user assignment."}
                {currentStep === 3 && "Lifecycle dates and administrative notes."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 min-h-[300px]">
              
              {/* STEP 1: Hardware Specs */}
              <div className={currentStep === 0 ? 'block space-y-4' : 'hidden'}>
                <div className="space-y-2">
                  <Label htmlFor="laptopName">Laptop Name</Label>
                  <Input id="laptopName" placeholder="e.g. Dell Latitude 5420" {...register('laptopName')} />
                  {errors.laptopName && <p className="text-sm text-destructive">{errors.laptopName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input id="serialNumber" placeholder="e.g. SN-DELL-001" {...register('serialNumber')} />
                  {errors.serialNumber && <p className="text-sm text-destructive">{errors.serialNumber.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ram">RAM</Label>
                  <Select
                    onValueChange={(val: any) => setValue('ram', val)}
                    value={watch('ram') || ''}
                    items={[
                      { value: '4GB', label: '4GB' },
                      { value: '8GB', label: '8GB' },
                      { value: '12GB', label: '12GB' },
                      { value: '16GB', label: '16GB' },
                      { value: '32GB', label: '32GB' }
                    ]}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select RAM" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4GB">4GB</SelectItem>
                      <SelectItem value="8GB">8GB</SelectItem>
                      <SelectItem value="12GB">12GB</SelectItem>
                      <SelectItem value="16GB">16GB</SelectItem>
                      <SelectItem value="32GB">32GB</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.ram && <p className="text-sm text-destructive">{errors.ram.message}</p>}
                </div>
              </div>

              {/* STEP 2: Storage */}
              <div className={currentStep === 1 ? 'block space-y-6' : 'hidden'}>
                <div className="space-y-3">
                  <Label>Storage Type</Label>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2 border p-3 rounded-md flex-1 cursor-pointer hover:bg-muted/50"
                         onClick={() => setValue('storageType', 'SSD')} >
                      <Checkbox 
                        id="ssd" 
                        checked={storageTypeValue === 'SSD'} 
                        onCheckedChange={() => setValue('storageType', 'SSD')} 
                      />
                      <label htmlFor="ssd" className="font-medium cursor-pointer">SSD (Solid State Drive)</label>
                    </div>
                    <div className="flex items-center space-x-2 border p-3 rounded-md flex-1 cursor-pointer hover:bg-muted/50"
                         onClick={() => setValue('storageType', 'HDD')}>
                      <Checkbox 
                        id="hdd" 
                        checked={storageTypeValue === 'HDD'} 
                        onCheckedChange={() => setValue('storageType', 'HDD')} 
                      />
                      <label htmlFor="hdd" className="font-medium cursor-pointer">HDD (Hard Disk Drive)</label>
                    </div>
                  </div>
                  {errors.storageType && <p className="text-sm text-destructive">{errors.storageType.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storageCapacity">Storage Capacity</Label>
                  <Select
                    onValueChange={(val: any) => setValue('storageCapacity', val)}
                    value={watch('storageCapacity') || ''}
                    items={[
                      { value: '256GB', label: '256GB' },
                      { value: '512GB', label: '512GB' },
                      { value: '1TB', label: '1TB' },
                      { value: '2TB', label: '2TB' },
                      { value: '3TB', label: '3TB' },
                      { value: '4TB', label: '4TB' }
                    ]}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Capacity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="256GB">256GB</SelectItem>
                      <SelectItem value="512GB">512GB</SelectItem>
                      <SelectItem value="1TB">1TB</SelectItem>
                      <SelectItem value="2TB">2TB</SelectItem>
                      <SelectItem value="3TB">3TB</SelectItem>
                      <SelectItem value="4TB">4TB</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.storageCapacity && <p className="text-sm text-destructive">{errors.storageCapacity.message}</p>}
                </div>
              </div>

              {/* STEP 3: Assignment */}
              <div className={currentStep === 2 ? 'block space-y-6' : 'hidden'}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      onValueChange={(val: any) => setValue('status', val)}
                      value={watch('status') || ''}
                      items={userRole === 'site_manager' ? [
                        { value: 'New', label: 'New' },
                        { value: 'Refub', label: 'Refurbished' },
                        { value: 'Used', label: 'Used' }
                      ] : [
                        { value: 'New', label: 'New' },
                        { value: 'Refub', label: 'Refurbished' },
                        { value: 'Used', label: 'Used' },
                        { value: 'Faulty', label: 'Faulty' },
                        { value: 'Snatched', label: 'Snatched' },
                        { value: 'Damaged', label: 'Damaged (Dead)' }
                      ]}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Refub">Refurbished</SelectItem>
                        <SelectItem value="Used">Used</SelectItem>
                        {userRole !== 'site_manager' && (
                          <>
                            <SelectItem value="Faulty">Faulty</SelectItem>
                            <SelectItem value="Snatched">Snatched</SelectItem>
                            <SelectItem value="Damaged">Damaged (Dead)</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    {errors.status && <p className="text-sm text-destructive">{errors.status.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assignedTo">Assigned To (Employee) <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                    <Controller
                      control={control}
                      name="assignedTo"
                      render={({ field }) => (
                        <EmployeeSelect
                          value={field.value}
                          onChange={(val) => field.onChange(val)}
                        />
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4 border border-muted/50 p-4 rounded-lg bg-muted/5">
                  <h4 className="text-sm font-semibold text-primary">Location Hierarchy Assignment</h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="locationId">Primary Location</Label>
                    {isLoadingLocs ? (
                      <div className="text-xs text-muted-foreground flex items-center gap-2 py-1.5">
                        <span className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-primary"></span>
                        Loading locations...
                      </div>
                    ) : (
                      <Select
                        onValueChange={(val: any) => setValue('locationId', val)}
                        value={watch('locationId') || ''}
                        items={locationsList.map(loc => ({ value: loc.id, label: loc.name }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select Primary Location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locationsList.map(loc => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {errors.locationId && <p className="text-sm text-destructive">{errors.locationId.message}</p>}
                  </div>

                  {locationIdValue && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      
                      {/* Department / Sub-location */}
                      {!isUnassigned && (
                        <div className="space-y-2">
                          <Label htmlFor="subLocationId">Department / Sub-Location</Label>
                          {subLocationsList.length === 0 ? (
                            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded bg-background flex flex-col gap-1">
                              <span>No departments configured.</span>
                              <Link href="/settings?tab=locations" className="text-primary hover:underline font-semibold">
                                [Configure Departments]
                              </Link>
                            </div>
                          ) : (
                            <Select
                              onValueChange={(val: any) => setValue('subLocationId', val)}
                              value={watch('subLocationId') || ''}
                              items={[
                                { value: 'none', label: 'None / Unassigned' },
                                ...subLocationsList.map(sub => ({ value: sub.id, label: sub.name }))
                              ]}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select Department" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None / Unassigned</SelectItem>
                                {subLocationsList.map(sub => (
                                  <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}

                      {/* Warehouse */}
                      <div className="space-y-2">
                        <Label htmlFor="warehouseId">Warehouse / Storage Zone</Label>
                        {warehousesList.length === 0 ? (
                          <div className="text-xs text-muted-foreground p-3 border border-dashed rounded bg-background flex flex-col gap-1">
                            <span>No warehouses configured.</span>
                            <Link href="/settings?tab=locations" className="text-primary hover:underline font-semibold">
                              [Configure Warehouses]
                            </Link>
                          </div>
                        ) : (
                          <Select
                            onValueChange={(val: any) => setValue('warehouseId', val)}
                            value={watch('warehouseId') || ''}
                            items={[
                              { value: 'none', label: 'None / Unassigned' },
                              ...warehousesList.map(wh => ({ value: wh.id, label: wh.name }))
                            ]}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select Warehouse" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None / Unassigned</SelectItem>
                              {warehousesList.map(wh => (
                                <SelectItem key={wh.id} value={wh.id}>{wh.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                    </div>
                  )}
                </div>

                {statusValue === 'Used' && (
                  <div className="space-y-2 p-4 border border-destructive/20 bg-destructive/5 rounded-md animate-in fade-in slide-in-from-top-4">
                    <Label htmlFor="oldUsername" className="text-destructive font-semibold">Old Username (Required for Used assets)</Label>
                    <Input id="oldUsername" placeholder="Who used this last?" {...register('oldUsername')} className="border-destructive/30" />
                    {errors.oldUsername && <p className="text-sm text-destructive font-medium">{errors.oldUsername.message}</p>}
                  </div>
                )}
              </div>

              {/* STEP 4: History & Notes */}
              <div className={currentStep === 3 ? 'block space-y-4' : 'hidden'}>
                <div className={cn("grid gap-4", isUnassigned ? "grid-cols-1" : "grid-cols-2")}>
                  <div className="space-y-2">
                    <Label htmlFor="purchaseDate">Purchase Date</Label>
                    <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
                    {errors.purchaseDate && <p className="text-sm text-destructive">{errors.purchaseDate.message}</p>}
                  </div>
                  {!isUnassigned && (
                    <div className="space-y-2">
                      <Label htmlFor="issueDate">Issue Date</Label>
                      <Input id="issueDate" type="date" {...register('issueDate')} />
                      {errors.issueDate && <p className="text-sm text-destructive">{errors.issueDate.message}</p>}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="details">Details / Remarks <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                  <textarea 
                    id="details" 
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Any additional information..."
                    {...register('details')}
                  />
                </div>
              </div>

            </CardContent>
            <CardFooter className="flex justify-between border-t p-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={(e) => { e.preventDefault(); processPrevious(); }} 
                disabled={currentStep === 0 || isSubmitting}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              
              {currentStep < steps.length - 1 ? (
                <Button type="button" onClick={(e) => { e.preventDefault(); processNext(); }}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Updating...' : 'Update Asset'} <Save className="ml-2 h-4 w-4" />
                </Button>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
