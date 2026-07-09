'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getSiteRequests() {
  const { data, error } = await supabase
    .from('site_requests')
    .select('*, locations(*)')
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message, data: [] };
  }
  return { success: true, data };
}

export async function createSiteRequestsBatch(
  locationId: string,
  requests: { itemType: string; quantity: number; details?: string }[]
) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  if (requests.length === 0) {
    return { success: false, error: 'Please add at least one item to request.' };
  }

  // Build a single summary row containing ALL items as a JSONB array
  const totalQuantity = requests.reduce((sum, r) => sum + r.quantity, 0);
  // Short summary: "Mouse, HDMI Cable +2 more" style
  const firstTwo = requests.slice(0, 2).map(r => r.itemType);
  const remaining = requests.length - 2;
  const summaryLabel = remaining > 0 
    ? `${firstTwo.join(', ')} +${remaining} more` 
    : firstTwo.join(', ');

  const singleRow = {
    company_id: session.company_id,
    location_id: locationId,
    item_type: summaryLabel,
    quantity: totalQuantity,
    details: requests.map(r => r.details || '').filter(Boolean).join(' | ') || null,
    items: requests.map(r => ({
      itemType: r.itemType,
      quantity: r.quantity,
      details: r.details || ''
    })),
    status: 'Pending',
    created_by: `${session.full_name || 'Site Manager'} (${session.username})`
  };

  const { error } = await supabase.from('site_requests').insert(singleRow);

  if (error) {
    return { success: false, error: error.message };
  }

  // Get location name
  const { data: loc } = await supabase.from('locations').select('name').eq('id', locationId).single();
  const locName = loc ? loc.name : 'Branch';

  // 1. Trigger in-app notification
  const itemsSummary = requests.map(r => `${r.quantity}x ${r.itemType}`).join(', ');
  await supabase.from('notifications').insert({
    company_id: session.company_id,
    location_id: locationId,
    title: 'New Site Requisitions',
    message: `${session.username || 'Site Manager'} at ${locName} requested: ${itemsSummary}.`,
    is_important: true,
    redirect_url: '/site-requests'
  });

  // 2. Simulated targeted email routing
  const emailRecipient = 'muhammad.dawood@tajcorporation.com';
  console.log(`
======================================================================
[SIMULATED EMAIL NOTIFICATION]
To: ${emailRecipient}
Subject: [Taj AssetFlow] New Site Request from ${locName}
Body:
Dear Muhammad Dawood,

A new batch of asset requests has been submitted on Taj AssetFlow:
- Branch: ${locName}
- Submitted By: ${session.username}

Items Requested:
${requests.map(r => `- ${r.itemType} (Qty: ${r.quantity}) - Remarks: ${r.details || 'None'}`).join('\n')}

Please review this request at: http://localhost:3000/site-requests
======================================================================
  `);

  revalidatePath('/site-requests');
  return { success: true };
}

export async function updateSiteRequestStatus(id: string, status: 'Approved' | 'Rejected') {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { data: req, error: fetchErr } = await supabase
    .from('site_requests')
    .select('*, locations(*)')
    .eq('id', id)
    .single();

  if (fetchErr || !req) {
    return { success: false, error: 'Request record not found.' };
  }

  const { error } = await supabase.from('site_requests').update({
    status
  }).eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Trigger notification back to Site Manager
  await supabase.from('notifications').insert({
    company_id: req.company_id,
    location_id: req.location_id,
    title: `Site Request ${status}`,
    message: `Your request for ${req.quantity}x ${req.item_type} has been ${status.toLowerCase()} by ${session.username}.`,
    is_important: status === 'Approved',
    redirect_url: '/site-requests'
  });

  revalidatePath('/site-requests');
  return { success: true };
}
