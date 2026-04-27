'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getUsers() {
  const session = await getSession();
  if (session?.role !== 'superadmin') {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('app_users')
    .select('id, username, role')
    .order('username', { ascending: true });

  if (error) throw error;
  return data;
}

export async function createUser(username: string, password: string, role: string) {
  const session = await getSession();
  if (session?.role !== 'superadmin') {
    return { success: false, error: 'Unauthorized' };
  }

  const { error } = await supabase
    .from('app_users')
    .insert([{ username, password, role }]);

  if (error) {
    if (error.code === '23505') return { success: false, error: 'Username already exists' };
    return { success: false, error: error.message };
  }

  revalidatePath('/users');
  return { success: true };
}

export async function deleteUser(id: string) {
  const session = await getSession();
  if (session?.role !== 'superadmin') {
    return { success: false, error: 'Unauthorized' };
  }

  // Prevent deleting self
  if (session.id === id) {
    return { success: false, error: 'You cannot delete your own account' };
  }

  const { error } = await supabase
    .from('app_users')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/users');
  return { success: true };
}
