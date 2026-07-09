'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { success: false, error: error.message, data: [] };
  }
  return { success: true, data };
}

export async function markNotificationRead(id: string, isRead: boolean = true) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: isRead })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/notifications');
  return { success: true };
}

export async function toggleNotificationImportant(id: string, currentImportant: boolean) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_important: !currentImportant })
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/notifications');
  return { success: true };
}

export async function markAllNotificationsRead() {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('company_id', session.company_id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/notifications');
  return { success: true };
}
