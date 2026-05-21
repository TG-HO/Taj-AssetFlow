'use server';

import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';

// ─── Fetch ledger entries (all company, or filtered to one item) ─
export async function getCustodyLedger(itemId?: string) {
  const session = await getSession();
  if (!session) return [];

  let query = supabase
    .from('custody_ledger')
    .select(`
      *,
      inventory_items!custody_ledger_item_id_fkey(name, serial_number),
      sub_locations!custody_ledger_recipient_department_id_fkey(name)
    `)
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false });

  if (itemId) query = query.eq('item_id', itemId);

  const { data, error } = await query.limit(100);
  if (error) return [];
  return data || [];
}

// ─── Fetch recent custody feed for dashboard ─────────────────────
export async function getRecentCustodyFeed() {
  const session = await getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('custody_ledger')
    .select(`
      id, action_type, recipient_name, created_at,
      inventory_items!custody_ledger_item_id_fkey(name, serial_number)
    `)
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) return [];
  return data || [];
}

// ─── Issue an item (Checkout) ────────────────────────────────────
export async function issueItem(
  itemId: string,
  recipientName: string,
  handoverCondition: string,
  departmentId?: string
) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  if (!recipientName.trim()) return { success: false, error: 'Recipient name is required.' };
  if (!handoverCondition.trim()) return { success: false, error: 'Handover condition is required.' };

  // Fetch current item state
  const { data: item, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, name, serial_number, status_state')
    .eq('id', itemId)
    .single();

  if (fetchErr || !item) return { success: false, error: 'Item not found.' };

  // Prevent issuance of faulty/damaged/snatched items
  const blockedStatuses = ['Faulty', 'Damaged', 'Snatched'];
  if (blockedStatuses.includes(item.status_state)) {
    return {
      success: false,
      error: `Cannot issue an item with status "${item.status_state}". Resolve the condition first.`,
    };
  }

  // Insert ledger entry
  const { error: ledgerErr } = await supabase.from('custody_ledger').insert({
    company_id: session.company_id,
    item_id: itemId,
    action_type: 'ISSUANCE',
    recipient_name: recipientName.trim(),
    recipient_department_id: departmentId || null,
    handover_condition: handoverCondition.trim(),
    admin_id: session.id,
  });

  if (ledgerErr) return { success: false, error: ledgerErr.message };

  // Update item status to Used
  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({ status_state: 'Used', assigned_to: recipientName.trim(), last_modified_at: new Date().toISOString() })
    .eq('id', itemId);

  if (updateErr) return { success: false, error: updateErr.message };

  await writeAuditLog('ISSUE_ITEM', item.serial_number || item.name, { status_state: item.status_state }, { status_state: 'Used', assigned_to: recipientName });

  revalidatePath('/inventory');
  revalidatePath('/');
  return { success: true };
}

// ─── Return / Check-in an item ───────────────────────────────────
export async function returnItem(
  itemId: string,
  recipientName: string,
  handoverCondition: string,
  newStatus: 'New' | 'Used' | 'Faulty' | 'Damaged' | 'Snatched',
  actionType: 'RETURN' | 'FAULT_DEPOSIT' | 'SNATCH_REPORT' | 'DISPOSAL'
) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  if (!recipientName.trim()) return { success: false, error: 'Recipient name is required.' };
  if (!handoverCondition.trim()) return { success: false, error: 'Condition description is required.' };

  const { data: item, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, name, serial_number, status_state')
    .eq('id', itemId)
    .single();

  if (fetchErr || !item) return { success: false, error: 'Item not found.' };

  const { error: ledgerErr } = await supabase.from('custody_ledger').insert({
    company_id: session.company_id,
    item_id: itemId,
    action_type: actionType,
    recipient_name: recipientName.trim(),
    recipient_department_id: null,
    handover_condition: handoverCondition.trim(),
    admin_id: session.id,
  });

  if (ledgerErr) return { success: false, error: ledgerErr.message };

  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({ status_state: newStatus, assigned_to: null, last_modified_at: new Date().toISOString() })
    .eq('id', itemId);

  if (updateErr) return { success: false, error: updateErr.message };

  await writeAuditLog('RETURN_ITEM', item.serial_number || item.name, { status_state: item.status_state }, { status_state: newStatus });

  revalidatePath('/inventory');
  revalidatePath('/');
  return { success: true };
}
