'use server';

import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { writeAuditLog } from '@/lib/audit';

const BUCKET = 'software-binaries';
const MAX_FILE_SIZE = 5000 * 1024 * 1024; // 5GB

// ─── Get all Software-classified inventory items ──────────────────
export async function getSoftwareItems() {
  const session = await getSession();
  if (!session) return [];

  // Fetch software-classified items with their specs and category
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select(`
      *,
      item_categories!inventory_items_category_id_fkey(name, classification),
      inventory_specs!inventory_specs_item_id_fkey(spec_key, spec_value)
    `)
    .eq('company_id', session.company_id)
    .order('name');

  if (error || !items) return [];

  // Filter to Software classification only
  return items.filter((item: any) => item.item_categories?.classification === 'Software');
}

// ─── Get full passport for one software item ─────────────────────
export async function getSoftwarePassport(id: string) {
  const session = await getSession();
  if (!session) return null;

  const [{ data: item }, { data: installers }, { data: allocations }] = await Promise.all([
    supabase
      .from('inventory_items')
      .select(`*, item_categories!inventory_items_category_id_fkey(name, classification), inventory_specs!inventory_specs_item_id_fkey(spec_key, spec_value)`)
      .eq('id', id)
      .eq('company_id', session.company_id)
      .single(),
    supabase
      .from('software_installers')
      .select('*')
      .eq('inventory_item_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('software_allocations')
      .select('*, assigned_asset:inventory_items!software_allocations_assigned_asset_id_fkey(name, serial_number)')
      .eq('software_item_id', id)
      .order('allocated_at', { ascending: false }),
  ]);

  if (!item) return null;
  return { item, installers: installers || [], allocations: allocations || [] };
}

// ─── Upload installer to Supabase Storage ────────────────────────
export async function uploadInstaller(
  itemId: string,
  fileName: string,
  fileBase64: string,
  fileSizeBytes: number,
  version: string,
  mimeType: string
) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };
  if (fileSizeBytes > MAX_FILE_SIZE) return { success: false, error: 'File exceeds 5GB limit.' };
  if (!version.trim()) return { success: false, error: 'Version is required.' };

  const fileBuffer = Buffer.from(fileBase64, 'base64');
  const filePath = `${session.company_id}/${itemId}/${Date.now()}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false });

  if (uploadError) return { success: false, error: uploadError.message };

  const { error: dbError } = await supabase.from('software_installers').insert({
    inventory_item_id: itemId,
    file_name: fileName,
    file_path: filePath,
    file_size_bytes: fileSizeBytes,
    version: version.trim(),
    download_count: 0,
    uploaded_by: session.id,
  });

  if (dbError) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    return { success: false, error: dbError.message };
  }

  await writeAuditLog('UPLOAD_INSTALLER', fileName, null, { item_id: itemId, version, file_size: fileSizeBytes });
  revalidatePath(`/software-vault/${itemId}`);
  return { success: true };
}

// ─── Register installer in database ────────────────────────
export async function registerSoftwareInstaller(
  itemId: string,
  fileName: string,
  filePath: string,
  fileSizeBytes: number,
  version: string
) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };
  if (!version.trim()) return { success: false, error: 'Version is required.' };

  const { error: dbError } = await supabase.from('software_installers').insert({
    inventory_item_id: itemId,
    file_name: fileName,
    file_path: filePath,
    file_size_bytes: fileSizeBytes,
    version: version.trim(),
    download_count: 0,
    uploaded_by: session.id,
  });

  if (dbError) {
    return { success: false, error: dbError.message };
  }

  await writeAuditLog('UPLOAD_INSTALLER', fileName, null, { item_id: itemId, version, file_size: fileSizeBytes });
  revalidatePath(`/software-vault/${itemId}`);
  return { success: true };
}


// ─── Generate signed download URL ────────────────────────────────
export async function generateDownloadUrl(installerId: string, filePath: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600); // 1 hour TTL

  if (error) return { success: false, error: error.message };

  // Increment download count
  await supabase.from('software_installers')
    .update({ download_count: supabase.rpc('increment', { row_id: installerId }) as unknown as number })
    .eq('id', installerId);

  return { success: true, url: data.signedUrl };
}

// ─── Assign a seat ───────────────────────────────────────────────
export async function assignSeat(
  softwareItemId: string,
  allocatedUserId: string,
  assignedAssetId?: string
) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };
  if (!allocatedUserId.trim()) return { success: false, error: 'User/machine name is required.' };

  // Fetch item to check total seats
  const { data: item } = await supabase
    .from('inventory_items')
    .select('quantity, name')
    .eq('id', softwareItemId)
    .single();

  const { count } = await supabase
    .from('software_allocations')
    .select('id', { count: 'exact', head: true })
    .eq('software_item_id', softwareItemId);

  const totalSeats = item?.quantity ?? 0;
  const usedSeats = count ?? 0;

  if (usedSeats >= totalSeats) {
    return {
      success: false,
      error: 'License seats fully allocated. Revoke seats from retired workstations first.',
      oversubscribed: true,
    };
  }

  const { error } = await supabase.from('software_allocations').insert({
    software_item_id: softwareItemId,
    allocated_user_id: allocatedUserId.trim(),
    assigned_asset_id: assignedAssetId || null,
  });

  if (error) return { success: false, error: error.message };

  await writeAuditLog('ASSIGN_SEAT', item?.name || softwareItemId, null, { allocated_to: allocatedUserId });
  revalidatePath(`/software-vault/${softwareItemId}`);
  return { success: true };
}

// ─── Revoke a seat ───────────────────────────────────────────────
export async function revokeSeat(allocationId: string, softwareItemId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('software_allocations').delete().eq('id', allocationId);
  if (error) return { success: false, error: error.message };

  await writeAuditLog('REVOKE_SEAT', allocationId, { allocationId }, null);
  revalidatePath(`/software-vault/${softwareItemId}`);
  return { success: true };
}

// ─── Delete an installer file ─────────────────────────────────────
export async function deleteInstaller(installerId: string, filePath: string, itemId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  await supabase.storage.from(BUCKET).remove([filePath]);
  const { error } = await supabase.from('software_installers').delete().eq('id', installerId);
  if (error) return { success: false, error: error.message };

  await writeAuditLog('DELETE_INSTALLER', filePath, { filePath }, null);
  revalidatePath(`/software-vault/${itemId}`);
  return { success: true };
}
