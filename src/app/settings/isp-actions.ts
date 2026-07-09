'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getIspInventory(locationId: string) {
  const { data, error } = await supabase
    .from('isp_inventory')
    .select('*')
    .eq('location_id', locationId);

  if (error) {
    return { success: false, error: error.message, data: [] };
  }
  return { success: true, data };
}

export async function addIspRecord(
  locationId: string,
  providerName: string,
  packageDetails: string,
  bandwidthMbps: number,
  recurringCost: number
) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('isp_inventory').insert({
    company_id: session.company_id,
    location_id: locationId,
    provider_name: providerName,
    package_details: packageDetails || null,
    bandwidth_mbps: bandwidthMbps,
    recurring_cost: recurringCost
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'An ISP record with this provider name already exists for this branch.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/settings');
  return { success: true };
}

export async function updateIspRecord(
  id: string,
  providerName: string,
  packageDetails: string,
  bandwidthMbps: number,
  recurringCost: number
) {
  const { error } = await supabase.from('isp_inventory').update({
    provider_name: providerName,
    package_details: packageDetails || null,
    bandwidth_mbps: bandwidthMbps,
    recurring_cost: recurringCost
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'An ISP record with this provider name already exists for this branch.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/settings');
  return { success: true };
}

export async function deleteIspRecord(id: string) {
  const { error } = await supabase.from('isp_inventory').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/settings');
  return { success: true };
}
