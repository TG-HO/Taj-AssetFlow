'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

export async function getCurrentUserRole() {
  const session = await getSession();
  return session?.role || 'moderator';
}

export async function logAdminAction(action: string, targetSerialNumber: string | null, details: any, changes?: any) {
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

  const { data: loc } = await supabase.from('locations').select('name').eq('id', data.locationId).single();
  const locationName = loc ? loc.name : 'Unknown';

  let statusToSave = data.status;
  let detailsToSave = data.details || null;

  let { error } = await supabase.from('assets').insert({
    laptop_name: data.laptopName,
    serial_number: data.serialNumber,
    ram: data.ram,
    storage_type: data.storageType,
    storage_capacity: data.storageCapacity,
    assigned_to: data.assignedTo || null,
    location: locationName,
    location_id: data.locationId,
    sub_location_id: data.subLocationId || null,
    warehouse_id: data.warehouseId || null,
    status: statusToSave,
    old_username: data.oldUsername || null,
    purchase_date: data.purchaseDate || new Date().toISOString().split('T')[0],
    issue_date: data.issueDate || new Date().toISOString().split('T')[0],
    details: detailsToSave,
  })

  // Fallback if Postgres asset_status ENUM constraint rejects new status values (e.g. Dead / Out of Order)
  if (error && (error.message?.includes('asset_status') || error.message?.includes('enum') || error.code === '22P02')) {
    const fallbackStatus = data.status === 'Dead' ? 'Damaged' : data.status === 'Out of Order' ? 'Faulty' : 'Damaged';
    detailsToSave = [detailsToSave, `[Status: ${data.status}]`].filter(Boolean).join(' ');
    const retry = await supabase.from('assets').insert({
      laptop_name: data.laptopName,
      serial_number: data.serialNumber,
      ram: data.ram,
      storage_type: data.storageType,
      storage_capacity: data.storageCapacity,
      assigned_to: data.assignedTo || null,
      location: locationName,
      location_id: data.locationId,
      sub_location_id: data.subLocationId || null,
      warehouse_id: data.warehouseId || null,
      status: fallbackStatus,
      old_username: data.oldUsername || null,
      purchase_date: data.purchaseDate || new Date().toISOString().split('T')[0],
      issue_date: data.issueDate || new Date().toISOString().split('T')[0],
      details: detailsToSave,
    });
    error = retry.error;
  }

  if (error) {
    if (error.code === '23505') {
       return { success: false, error: 'Serial number already exists' }
    }
    return { success: false, error: error.message }
  }

  await logAdminAction('ADD_ASSET', data.serialNumber, data);
  await writeAuditLog('ADD_ASSET', data.serialNumber, null, data);

  revalidatePath('/inventory')
  revalidatePath('/inventory/faulty');
  revalidatePath('/inventory/out-of-order');
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

  const { data: oldAsset } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
    .single()

  let changes: any = null;
  if (oldAsset) {
    const changesObj: any = {};
    const keysMap = [
      ['laptop_name', 'laptopName'],
      ['serial_number', 'serialNumber'],
      ['ram', 'ram'],
      ['storage_type', 'storageType'],
      ['storage_capacity', 'storageCapacity'],
      ['assigned_to', 'assignedTo'],
      ['location', 'location'],
      ['location_id', 'locationId'],
      ['sub_location_id', 'subLocationId'],
      ['warehouse_id', 'warehouseId'],
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
        changesObj[dbKey] = { old: oldVal, new: newVal };
        hasChanges = true;
      }
    }
    if (hasChanges) changes = changesObj;
  }

  const targetLocationId = data.locationId || oldAsset?.location_id;
  let locationName = oldAsset?.location || 'Unknown';

  if (targetLocationId) {
    const { data: loc } = await supabase.from('locations').select('name').eq('id', targetLocationId).single();
    if (loc) locationName = loc.name;
  }

  let updateStatus = data.status ?? oldAsset?.status;
  let updateDetails = data.details !== undefined ? (data.details || null) : oldAsset?.details;

  let { error } = await supabase.from('assets').update({
    laptop_name: data.laptopName ?? oldAsset?.laptop_name,
    serial_number: data.serialNumber ?? oldAsset?.serial_number,
    ram: data.ram ?? oldAsset?.ram,
    storage_type: data.storageType ?? oldAsset?.storage_type,
    storage_capacity: data.storageCapacity ?? oldAsset?.storage_capacity,
    assigned_to: data.assignedTo !== undefined ? (data.assignedTo || null) : oldAsset?.assigned_to,
    location: locationName,
    location_id: targetLocationId || oldAsset?.location_id,
    sub_location_id: data.subLocationId !== undefined ? (data.subLocationId || null) : oldAsset?.sub_location_id,
    warehouse_id: data.warehouseId !== undefined ? (data.warehouseId || null) : oldAsset?.warehouse_id,
    status: updateStatus,
    old_username: data.oldUsername !== undefined ? (data.oldUsername || null) : oldAsset?.old_username,
    purchase_date: data.purchaseDate !== undefined ? (data.purchaseDate || null) : oldAsset?.purchase_date,
    issue_date: data.issueDate !== undefined ? (data.issueDate || null) : oldAsset?.issue_date,
    details: updateDetails,
  }).eq('id', id)

  // Fallback if Postgres asset_status ENUM constraint rejects new status values (e.g. Dead / Out of Order)
  if (error && (error.message?.includes('asset_status') || error.message?.includes('enum') || error.code === '22P02')) {
    const fallbackStatus = data.status === 'Dead' ? 'Damaged' : data.status === 'Out of Order' ? 'Faulty' : 'Damaged';
    const fallbackDetails = [updateDetails, `[Status: ${data.status}]`].filter(Boolean).join(' ');
    const retry = await supabase.from('assets').update({
      laptop_name: data.laptopName ?? oldAsset?.laptop_name,
      serial_number: data.serialNumber ?? oldAsset?.serial_number,
      ram: data.ram ?? oldAsset?.ram,
      storage_type: data.storageType ?? oldAsset?.storage_type,
      storage_capacity: data.storageCapacity ?? oldAsset?.storage_capacity,
      assigned_to: data.assignedTo !== undefined ? (data.assignedTo || null) : oldAsset?.assigned_to,
      location: locationName,
      location_id: targetLocationId || oldAsset?.location_id,
      sub_location_id: data.subLocationId !== undefined ? (data.subLocationId || null) : oldAsset?.sub_location_id,
      warehouse_id: data.warehouseId !== undefined ? (data.warehouseId || null) : oldAsset?.warehouse_id,
      status: fallbackStatus,
      old_username: data.oldUsername !== undefined ? (data.oldUsername || null) : oldAsset?.old_username,
      purchase_date: data.purchaseDate !== undefined ? (data.purchaseDate || null) : oldAsset?.purchase_date,
      issue_date: data.issueDate !== undefined ? (data.issueDate || null) : oldAsset?.issue_date,
      details: fallbackDetails,
    }).eq('id', id);
    error = retry.error;
  }

  if (error) {
    if (error.code === '23505') { 
       return { success: false, error: 'Serial number already exists' }
    }
    return { success: false, error: error.message }
  }

  await logAdminAction('UPDATE_ASSET', data.serialNumber || oldAsset?.serial_number, data, changes);
  await writeAuditLog('EDIT_ASSET', data.serialNumber || oldAsset?.serial_number, oldAsset, data);

  revalidatePath('/inventory');
  revalidatePath('/inventory/faulty');
  revalidatePath('/inventory/out-of-order');
  revalidatePath(`/inventory/${id}`);
  return { success: true }
}

export async function getAsset(id: string) {
  const { data, error } = await supabase.from('assets').select('*').eq('id', id).single()
  if (error) return null
  
  let subLocationName = null;
  let warehouseName = null;
  
  if (data.sub_location_id) {
    const { data: sub } = await supabase.from('sub_locations').select('name').eq('id', data.sub_location_id).single();
    if (sub) subLocationName = sub.name;
  }
  if (data.warehouse_id) {
    const { data: wh } = await supabase.from('warehouses').select('name').eq('id', data.warehouse_id).single();
    if (wh) warehouseName = wh.name;
  }
  
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
    locationId: data.location_id,
    subLocationId: data.sub_location_id,
    subLocationName,
    warehouseId: data.warehouse_id,
    warehouseName,
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
  await writeAuditLog('IMPORT_ASSETS', null, null, { count: uniqueBatch.length, imported_serials: Array.from(existingSerials) });

  revalidatePath('/inventory')
  return { success: true }
}

export async function deleteAsset(id: string) {
  const session = await getSession();
  if (session?.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Only Admins can delete assets.' }
  }

  const { data: asset } = await supabase.from('assets').select('serial_number').eq('id', id).single();
  const { error } = await supabase.from('assets').delete().eq('id', id)
  
  if (error) {
    return { success: false, error: error.message }
  }

  if (asset) {
    await logAdminAction('DELETE_ASSET', asset.serial_number, { id });
    await writeAuditLog('DELETE_ASSET', asset.serial_number, asset, null);
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

// ----------------------------------------------------
// LOCATION MANAGEMENT SERVER ACTIONS
// ----------------------------------------------------

export async function addLocation(name: string, address?: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('locations').insert({
    company_id: session.company_id,
    name,
    address: address || null
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A primary location with this name already exists.' };
    }
    return { success: false, error: error.message };
  }

  await writeAuditLog('ADD_LOCATION', name, null, { name, address });

  return { success: true };
}

export async function addSubLocation(locationId: string, name: string, costCenterCode?: string) {
  const { error } = await supabase.from('sub_locations').insert({
    location_id: locationId,
    name,
    cost_center_code: costCenterCode || null
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A sub-location/department with this name already exists for this primary location.' };
    }
    return { success: false, error: error.message };
  }

  await writeAuditLog('ADD_DEPARTMENT', name, null, { name, location_id: locationId, cost_center_code: costCenterCode });

  return { success: true };
}

export async function addWarehouse(locationId: string, name: string, rackNumber?: string) {
  const { error } = await supabase.from('warehouses').insert({
    location_id: locationId,
    name,
    rack_number: rackNumber || null
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A warehouse/storage zone with this name already exists for this primary location.' };
    }
    return { success: false, error: error.message };
  }

  await writeAuditLog('ADD_WAREHOUSE', name, null, { name, location_id: locationId, rack_number: rackNumber });

  return { success: true };
}

export async function deleteLocation(locationId: string) {
  // Check if any assets are linked to this location
  const { data: linkedAssets } = await supabase.from('assets').select('id').eq('location_id', locationId).limit(1);
  if (linkedAssets && linkedAssets.length > 0) {
    return { success: false, error: 'Cannot delete location: assets are currently assigned to this location. Please reassign the assets first.' };
  }

  const { data: oldLoc } = await supabase.from('locations').select('*').eq('id', locationId).single();

  const { error } = await supabase.from('locations').delete().eq('id', locationId);
  if (error) return { success: false, error: error.message };

  if (oldLoc) {
    await writeAuditLog('DELETE_LOCATION', oldLoc.name, oldLoc, null);
  }

  return { success: true };
}

export async function deleteSubLocation(id: string) {
  const { data: oldSub } = await supabase.from('sub_locations').select('*').eq('id', id).single();

  const { error } = await supabase.from('sub_locations').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  if (oldSub) {
    await writeAuditLog('DELETE_DEPARTMENT', oldSub.name, oldSub, null);
  }

  return { success: true };
}

export async function deleteWarehouse(id: string) {
  const { data: oldWh } = await supabase.from('warehouses').select('*').eq('id', id).single();

  const { error } = await supabase.from('warehouses').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  if (oldWh) {
    await writeAuditLog('DELETE_WAREHOUSE', oldWh.name, oldWh, null);
  }

  return { success: true };
}

export async function updateLocation(id: string, name: string, address?: string) {
  const { data: oldLoc } = await supabase.from('locations').select('*').eq('id', id).single();

  const { error } = await supabase.from('locations').update({
    name,
    address: address || null
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A primary location with this name already exists.' };
    }
    return { success: false, error: error.message };
  }

  if (oldLoc) {
    await writeAuditLog('EDIT_LOCATION', name, oldLoc, { name, address });
  }

  return { success: true };
}

export async function updateSubLocation(id: string, name: string, costCenterCode?: string) {
  const { data: oldSub } = await supabase.from('sub_locations').select('*').eq('id', id).single();

  const { error } = await supabase.from('sub_locations').update({
    name,
    cost_center_code: costCenterCode || null
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A sub-location/department with this name already exists for this primary location.' };
    }
    return { success: false, error: error.message };
  }

  if (oldSub) {
    await writeAuditLog('EDIT_DEPARTMENT', name, oldSub, { name, cost_center_code: costCenterCode });
  }

  return { success: true };
}

export async function updateWarehouse(id: string, name: string, rackNumber?: string) {
  const { data: oldWh } = await supabase.from('warehouses').select('*').eq('id', id).single();

  const { error } = await supabase.from('warehouses').update({
    name,
    rack_number: rackNumber || null
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'A warehouse/storage zone with this name already exists for this primary location.' };
    }
    return { success: false, error: error.message };
  }

  if (oldWh) {
    await writeAuditLog('EDIT_WAREHOUSE', name, oldWh, { name, rack_number: rackNumber });
  }

  return { success: true };
}

export async function transferAsset(assetId: string, targetLocationId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  // Fetch target location name
  const { data: targetLoc } = await supabase.from('locations').select('id, name').eq('id', targetLocationId).single();
  if (!targetLoc) return { success: false, error: 'Target location not found.' };

  // Fetch current asset details
  const { data: asset } = await supabase.from('assets').select('*').eq('id', assetId).single();
  if (!asset) return { success: false, error: 'Asset not found.' };

  // Update asset location and reset department/warehouse
  const { error } = await supabase.from('assets').update({
    location_id: targetLoc.id,
    location: targetLoc.name,
    sub_location_id: null,
    warehouse_id: null,
    updated_at: new Date().toISOString()
  }).eq('id', assetId);

  if (error) return { success: false, error: error.message };

  await logAdminAction('TRANSFER_ASSET', asset.serial_number, { from: asset.location, to: targetLoc.name });
  await writeAuditLog('TRANSFER_ASSET', asset.serial_number, { location: asset.location }, { location: targetLoc.name, location_id: targetLoc.id });

  revalidatePath('/inventory');
  revalidatePath(`/inventory/${assetId}`);
  return { success: true };
}


