'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

export async function getStockAllocations() {
  const { data, error } = await supabase
    .from('stock_allocations')
    .select('*, target_locations:locations(*)')
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message, data: [] };
  }
  return { success: true, data };
}

export async function createStockAllocation(itemType: string, quantityAllocated: number, targetLocationId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('stock_allocations').insert({
    company_id: session.company_id,
    item_type: itemType,
    quantity_allocated: quantityAllocated,
    target_location_id: targetLocationId,
    status: 'Pending'
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Get location name for notification
  const { data: loc } = await supabase.from('locations').select('name').eq('id', targetLocationId).single();
  const locName = loc ? loc.name : 'Target Location';

  // Trigger Notification to Site Managers
  await supabase.from('notifications').insert({
    company_id: session.company_id,
    location_id: targetLocationId,
    title: 'New Stock Dispatched',
    message: `A shipment of ${quantityAllocated}x ${itemType} has been dispatched to ${locName}. Please reconcile upon arrival.`,
    is_important: true,
    redirect_url: '/stock-allocations'
  });

  revalidatePath('/stock-allocations');
  return { success: true };
}

export async function reconcileStockAllocation(id: string, reconciledQuantity: number) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  // Fetch allocation details
  const { data: alloc, error: fetchErr } = await supabase
    .from('stock_allocations')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !alloc) {
    return { success: false, error: 'Allocation record not found.' };
  }

  const isMismatch = reconciledQuantity !== alloc.quantity_allocated;
  const newStatus = isMismatch ? 'Mismatch' : 'Reconciled';

  const { error } = await supabase.from('stock_allocations').update({
    status: newStatus,
    reconciled_quantity: reconciledQuantity,
    reconciled_at: new Date().toISOString(),
    reconciled_by: session.username || 'System'
  }).eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Find or create category for auto inventory intake
  let catId = null;
  const { data: cat } = await supabase
    .from('item_categories')
    .select('id')
    .eq('company_id', alloc.company_id)
    .eq('classification', 'Consumable')
    .limit(1);

  if (cat && cat.length > 0) {
    catId = cat[0].id;
  } else {
    const { data: newCat } = await supabase
      .from('item_categories')
      .insert({
        company_id: alloc.company_id,
        name: 'Allocated Stock',
        classification: 'Consumable'
      })
      .select('id')
      .single();
    if (newCat) catId = newCat.id;
  }

  if (catId) {
    await supabase.from('inventory_items').insert({
      company_id: alloc.company_id,
      category_id: catId,
      location_id: alloc.target_location_id,
      name: alloc.item_type,
      quantity: reconciledQuantity,
      status_state: 'New',
      notes: `Reconciled intake from stock allocation shipment #${id}`
    });
  }

  // Fire Audit Log
  await writeAuditLog(
    'EDIT_ASSET',
    `STOCK_RECONCILE_${id}`,
    alloc,
    { status: newStatus, reconciled_quantity: reconciledQuantity }
  );

  // Trigger Notification
  const title = isMismatch ? 'Stock Allocation Mismatch!' : 'Stock Reconciled';
  const msg = isMismatch
    ? `Site Manager reported mismatch for ${alloc.item_type}: Allocated ${alloc.quantity_allocated}, Received ${reconciledQuantity}.`
    : `Site Manager successfully reconciled ${alloc.quantity_allocated}x ${alloc.item_type}.`;

  await supabase.from('notifications').insert({
    company_id: session.company_id,
    title,
    message: msg,
    is_important: isMismatch,
    redirect_url: '/stock-allocations'
  });

  revalidatePath('/stock-allocations');
  return { success: true };
}

export async function acceptAndLogAllocation(id: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { data: alloc, error: fetchErr } = await supabase
    .from('stock_allocations')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !alloc) {
    return { success: false, error: 'Allocation record not found.' };
  }

  const { error } = await supabase.from('stock_allocations').update({
    status: 'Reconciled',
    reconciled_quantity: alloc.quantity_allocated,
    reconciled_at: new Date().toISOString(),
    reconciled_by: session.username || 'System'
  }).eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Find or create category for auto inventory intake
  let catId = null;
  const { data: cat } = await supabase
    .from('item_categories')
    .select('id')
    .eq('company_id', alloc.company_id)
    .eq('classification', 'Consumable')
    .limit(1);

  if (cat && cat.length > 0) {
    catId = cat[0].id;
  } else {
    const { data: newCat } = await supabase
      .from('item_categories')
      .insert({
        company_id: alloc.company_id,
        name: 'Allocated Stock',
        classification: 'Consumable'
      })
      .select('id')
      .single();
    if (newCat) catId = newCat.id;
  }

  if (catId) {
    await supabase.from('inventory_items').insert({
      company_id: alloc.company_id,
      category_id: catId,
      location_id: alloc.target_location_id,
      name: alloc.item_type,
      quantity: alloc.quantity_allocated,
      status_state: 'New',
      notes: `Automated intake from stock allocation shipment #${id}`
    });
  }

  // Fire Audit Log
  await writeAuditLog(
    'EDIT_ASSET',
    `STOCK_RECONCILE_${id}`,
    alloc,
    { status: 'Reconciled', reconciled_quantity: alloc.quantity_allocated }
  );

  // Trigger Notification
  await supabase.from('notifications').insert({
    company_id: session.company_id,
    title: 'Stock Reconciled',
    message: `Site Manager accepted and logged ${alloc.quantity_allocated}x ${alloc.item_type} to local inventory.`,
    is_important: false,
    redirect_url: '/stock-allocations'
  });

  revalidatePath('/stock-allocations');
  return { success: true };
}
