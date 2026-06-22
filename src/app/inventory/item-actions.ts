'use server';

import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// ─── Fetch all categories for the current company ───────────────
export async function getCategories() {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const { data, error } = await supabase
    .from('item_categories')
    .select('*')
    .eq('company_id', session.company_id)
    .order('classification')
    .order('name');

  if (error) throw error;
  return data || [];
}

// ─── Add a custom category ───────────────────────────────────────
export async function addCategory(name: string, classification: 'Asset' | 'Consumable' | 'Software') {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('item_categories').insert({
    company_id: session.company_id,
    name: name.trim(),
    classification,
  });

  if (error) {
    if (error.code === '23505') return { success: false, error: 'A category with this name already exists.' };
    return { success: false, error: error.message };
  }

  return { success: true };
}

// ─── Duplicate serial check (inventory_items table) ─────────────
export async function checkNewSerialNumber(serialNumber: string): Promise<boolean> {
  const session = await getSession();
  if (!session || !serialNumber.trim()) return true;

  const { data, error } = await supabase
    .from('inventory_items')
    .select('id')
    .eq('company_id', session.company_id)
    .eq('serial_number', serialNumber.trim())
    .maybeSingle();

  if (error) return true; // allow through on error, DB constraint will catch it
  return data === null; // true = unique (OK), false = duplicate
}

// ─── Add a new inventory item with specs ────────────────────────
export interface AddInventoryItemPayload {
  category_id: string;
  classification: 'Asset' | 'Consumable' | 'Software';
  name: string;
  status_state: string;
  location_id: string;
  sub_location_id?: string | null;
  warehouse_id?: string | null;
  assigned_to?: string;
  notes?: string;
  // Asset-specific
  serial_number?: string;
  part_number?: string;
  model_number?: string;
  // Consumable-specific
  quantity?: number;
  minimum_safety_stock?: number;
  // Specs (key-value pairs)
  specs?: Array<{ key: string; value: string }>;
}

export async function addInventoryItem(payload: AddInventoryItemPayload) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  // Validation
  if (payload.classification === 'Asset' && !payload.serial_number?.trim()) {
    return { success: false, error: 'Serial number is required for Asset items.' };
  }

  const qty = payload.quantity ?? 1;
  const mss = payload.minimum_safety_stock ?? 0;

  if (qty < 0) return { success: false, error: 'Quantity cannot be negative.' };
  if (mss < 0) return { success: false, error: 'Minimum safety stock cannot be negative.' };

  // Check serial duplicate
  if (payload.serial_number?.trim()) {
    const isUnique = await checkNewSerialNumber(payload.serial_number.trim());
    if (!isUnique) {
      return { success: false, error: 'An item with this Serial Number is already registered for your company.' };
    }
  }

  // Insert item
  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .insert({
      company_id: session.company_id,
      category_id: payload.category_id,
      location_id: payload.location_id,
      sub_location_id: payload.sub_location_id || null,
      warehouse_id: payload.warehouse_id || null,
      name: payload.name.trim(),
      serial_number: payload.serial_number?.trim() || null,
      part_number: payload.part_number?.trim() || null,
      model_number: payload.model_number?.trim() || null,
      status_state: payload.status_state,
      quantity: qty,
      minimum_safety_stock: mss,
      assigned_to: payload.assigned_to?.trim() || null,
      notes: payload.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (itemError) {
    if (itemError.code === '23505') {
      return { success: false, error: 'An item with this Serial Number is already registered for your company.' };
    }
    return { success: false, error: itemError.message };
  }

  // Insert specs if any
  if (payload.specs && payload.specs.length > 0) {
    const specRows = payload.specs
      .filter(s => s.key.trim() && s.value.trim())
      .map(s => ({
        item_id: item.id,
        spec_key: s.key.trim(),
        spec_value: s.value.trim(),
      }));

    if (specRows.length > 0) {
      const { error: specError } = await supabase.from('inventory_specs').insert(specRows);
      if (specError) {
        // Rollback item on spec insert failure
        await supabase.from('inventory_items').delete().eq('id', item.id);
        return { success: false, error: `Item saved but specs failed: ${specError.message}` };
      }
    }
  }

  // Log action
  try {
    if (payload.classification !== 'Asset') {
      const { logAdminAction } = await import('./actions');
      const logAction = payload.classification === 'Consumable' ? 'ADD_CONSUMABLE' 
                      : payload.classification === 'Software' ? 'ADD_SOFTWARE' 
                      : 'ADD_INVENTORY_ITEM';
      await logAdminAction(logAction, payload.serial_number || null, {
        id: item.id,
        name: payload.name,
        classification: payload.classification,
        quantity: qty,
        location_id: payload.location_id,
      });
    }
  } catch (e) {
    console.error("Failed to log admin action:", e);
  }

  revalidatePath('/inventory');
  return { success: true, itemId: item.id };
}

export async function updateInventoryItem(payload: {
  id: string;
  name: string;
  category_id: string;
  location_id: string;
  sub_location_id?: string | null;
  warehouse_id?: string | null;
  status_state: string;
  quantity: number;
  minimum_safety_stock: number;
  notes?: string | null;
}) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  if (payload.quantity < 0) return { success: false, error: 'Quantity cannot be negative.' };
  if (payload.minimum_safety_stock < 0) return { success: false, error: 'Minimum safety stock cannot be negative.' };

  // Fetch old item for logging diff
  const { data: oldItem } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', payload.id)
    .single();

  const { error } = await supabase
    .from('inventory_items')
    .update({
      category_id: payload.category_id,
      location_id: payload.location_id,
      sub_location_id: payload.sub_location_id || null,
      warehouse_id: payload.warehouse_id || null,
      name: payload.name.trim(),
      status_state: payload.status_state,
      quantity: payload.quantity,
      minimum_safety_stock: payload.minimum_safety_stock,
      notes: payload.notes?.trim() || null,
    })
    .eq('id', payload.id);

  if (error) return { success: false, error: error.message };

  // Log action
  try {
    let classification = 'Consumable';
    if (oldItem?.category_id) {
      const { data: cat } = await supabase.from('item_categories').select('classification').eq('id', oldItem.category_id).single();
      if (cat?.classification) classification = cat.classification;
    }
    const logAction = classification === 'Software' ? 'EDIT_SOFTWARE' : 'EDIT_CONSUMABLE';

    const { logAdminAction } = await import('./actions');
    const changes = {
      before: oldItem ? {
        name: oldItem.name,
        quantity: oldItem.quantity,
        minimum_safety_stock: oldItem.minimum_safety_stock,
        status_state: oldItem.status_state,
        notes: oldItem.notes
      } : null,
      after: {
        name: payload.name,
        quantity: payload.quantity,
        minimum_safety_stock: payload.minimum_safety_stock,
        status_state: payload.status_state,
        notes: payload.notes
      }
    };
    await logAdminAction(logAction, oldItem?.serial_number || null, payload, changes);
  } catch (e) {
    console.error("Failed to log admin action:", e);
  }

  revalidatePath('/inventory/consumables');
  return { success: true };
}

export async function deleteInventoryItem(id: string) {
  const session = await getSession();
  if (session?.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Only Admins can delete items.' };
  }

  // Fetch item for logging
  const { data: item } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  // Log action
  try {
    let classification = 'Consumable';
    if (item?.category_id) {
      const { data: cat } = await supabase.from('item_categories').select('classification').eq('id', item.category_id).single();
      if (cat?.classification) classification = cat.classification;
    }
    const logAction = classification === 'Software' ? 'DELETE_SOFTWARE' : 'DELETE_CONSUMABLE';

    const { logAdminAction } = await import('./actions');
    await logAdminAction(logAction, item?.serial_number || null, item);
  } catch (e) {
    console.error("Failed to log admin action:", e);
  }

  revalidatePath('/inventory/consumables');
  return { success: true };
}
