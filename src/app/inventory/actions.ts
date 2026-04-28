'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getCurrentUserRole() {
  const session = await getSession();
  return session?.role || 'subadmin';
}

async function logAdminAction(action: string, targetSerialNumber: string | null, details: any, changes?: any) {
  const session = await getSession();
  const username = session?.username || 'System';
  
  await supabase.from('admin_logs').insert({
    action,
    performed_by: username,
    target_serial_number: targetSerialNumber,
    details,
    changes
  });
}

export async function addAsset(data: any) {
  // Check for unique serial number
  const { data: existing } = await supabase
    .from('assets')
    .select('id')
    .eq('serial_number', data.serialNumber)
    .single()

  if (existing) {
    return { success: false, error: 'Serial number already exists' }
  }

  const { error } = await supabase.from('assets').insert({
    laptop_name: data.laptopName,
    serial_number: data.serialNumber,
    ram: data.ram,
    storage_type: data.storageType,
    storage_capacity: data.storageCapacity,
    assigned_to: data.assignedTo || null,
    location: data.location,
    status: data.status,
    old_username: data.oldUsername || null,
    purchase_date: data.purchaseDate || null,
    issue_date: data.issueDate || null,
    details: data.details || null,
  })

  if (error) {
    if (error.code === '23505') {
       return { success: false, error: 'Serial number already exists' }
    }
    return { success: false, error: error.message }
  }

  await logAdminAction('ADD_ASSET', data.serialNumber, data);

  revalidatePath('/inventory')
  return { success: true }
}

export async function updateAsset(id: string, data: any) {
  // Check for unique serial number
  const { data: existing } = await supabase
    .from('assets')
    .select('id')
    .eq('serial_number', data.serialNumber)
    .neq('id', id)
    .single()

  if (existing) {
    return { success: false, error: 'Serial number already exists' }
  }

  // Get old asset to compare changes
  const { data: oldAsset } = await supabase.from('assets').select('*').eq('id', id).single();
  let changes: any = null;

  if (oldAsset) {
    changes = {};
    const keysMap = [
      ['laptop_name', 'laptopName'],
      ['serial_number', 'serialNumber'],
      ['ram', 'ram'],
      ['storage_type', 'storageType'],
      ['storage_capacity', 'storageCapacity'],
      ['assigned_to', 'assignedTo'],
      ['location', 'location'],
      ['status', 'status'],
      ['old_username', 'oldUsername'],
      ['purchase_date', 'purchaseDate'],
      ['issue_date', 'issueDate'],
      ['details', 'details']
    ];
    
    let hasChanges = false;
    for (const [dbKey, dataKey] of keysMap) {
      // Normalize values to avoid false positives on null vs empty string vs undefined
      const oldVal = oldAsset[dbKey] ?? null;
      const newVal = data[dataKey] ?? null;
      if (oldVal !== newVal) {
        changes[dbKey] = { old: oldVal, new: newVal };
        hasChanges = true;
      }
    }
    if (!hasChanges) changes = null;
  }

  const { error } = await supabase.from('assets').update({
    laptop_name: data.laptopName,
    serial_number: data.serialNumber,
    ram: data.ram,
    storage_type: data.storageType,
    storage_capacity: data.storageCapacity,
    assigned_to: data.assignedTo || null,
    location: data.location,
    status: data.status,
    old_username: data.oldUsername || null,
    purchase_date: data.purchaseDate || null,
    issue_date: data.issueDate || null,
    details: data.details || null,
  }).eq('id', id)

  if (error) {
    if (error.code === '23505') { 
       return { success: false, error: 'Serial number already exists' }
    }
    return { success: false, error: error.message }
  }

  await logAdminAction('UPDATE_ASSET', data.serialNumber, data, changes);

  revalidatePath('/inventory')
  revalidatePath(`/inventory/${id}`)
  return { success: true }
}

export async function getAsset(id: string) {
  const { data, error } = await supabase.from('assets').select('*').eq('id', id).single()
  if (error) return null
  
  // map database fields to form fields
  return {
    id: data.id,
    laptopName: data.laptop_name,
    serialNumber: data.serial_number,
    ram: data.ram,
    storageType: data.storage_type,
    storageCapacity: data.storage_capacity,
    assignedTo: data.assigned_to,
    location: data.location,
    status: data.status,
    oldUsername: data.old_username,
    purchaseDate: data.purchase_date,
    issueDate: data.issue_date,
    details: data.details,
  }
}

export async function importAssetsFromCSV(assets: any[]) {
  // get all existing serial numbers
  const { data: existingRecords } = await supabase.from('assets').select('serial_number');
  const existingSerials = new Set(existingRecords?.map(r => r.serial_number) || []);
  
  const uniqueBatch = [];
  
  for (const data of assets) {
    const serial = data.serialNumber || data.serial_number;
    if (!serial) continue; // Skip assets without serial numbers
    
    // Check if it already exists in DB or if we already added it in this very batch
    if (!existingSerials.has(serial)) {
      uniqueBatch.push({
        laptop_name: data.laptopName || data.laptop_name || 'Unknown',
        serial_number: serial,
        ram: data.ram || 'Unknown',
        storage_type: data.storageType || data.storage_type || 'SSD',
        storage_capacity: data.storageCapacity || data.storage_capacity || 'Unknown',
        assigned_to: data.assignedTo || data.assigned_to || null,
        location: data.location || 'Unknown',
        status: data.status || 'New',
        old_username: data.oldUsername || data.old_username || null,
        purchase_date: data.purchaseDate || data.purchase_date || null,
        issue_date: data.issueDate || data.issue_date || null,
        details: data.details || null,
      });
      existingSerials.add(serial);
    }
  }

  if (uniqueBatch.length === 0) {
    return { success: false, error: 'No new unique assets found to import.' }
  }

  const { error } = await supabase.from('assets').insert(uniqueBatch)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction('IMPORT_ASSETS', null, { count: uniqueBatch.length, imported_serials: Array.from(existingSerials) });

  revalidatePath('/inventory')
  return { success: true }
}

export async function deleteAsset(id: string) {
  const session = await getSession();
  if (session?.role !== 'superadmin') {
    return { success: false, error: 'Unauthorized: Only Super Admins can delete assets.' }
  }

  const { data: asset } = await supabase.from('assets').select('serial_number').eq('id', id).single();
  const { error } = await supabase.from('assets').delete().eq('id', id)
  
  if (error) {
    return { success: false, error: error.message }
  }

  if (asset) {
    await logAdminAction('DELETE_ASSET', asset.serial_number, { id });
  }

  revalidatePath('/inventory')
  return { success: true }
}

export async function checkSerialNumber(serialNumber: string, ignoreId?: string) {
  let query = supabase.from('assets').select('id').eq('serial_number', serialNumber);
  
  if (ignoreId) {
    query = query.neq('id', ignoreId);
  }
  
  const { data } = await query.single();
  return !data; // returns true if unique (not found), false if exists
}
