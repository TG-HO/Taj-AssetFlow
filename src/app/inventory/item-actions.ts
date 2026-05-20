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

  revalidatePath('/inventory');
  return { success: true, itemId: item.id };
}
