'use server'

import { supabase, rawSupabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getUsers() {
  const session = await getSession();
  if (session?.role !== 'admin') {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, full_name')
    .eq('company_id', session.company_id)
    .order('email', { ascending: true });

  if (error) throw error;
  
  // Map profiles to frontend compatible format (mapping email to username)
  return data.map(user => ({
    id: user.id,
    username: user.email,
    role: user.role === 'admin' ? 'admin' : 'moderator',
    full_name: user.full_name
  }));
}

export async function createUser(username: string, password: string, role: string) {
  const session = await getSession();
  if (session?.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  const email = username.trim();
  if (!email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  // 1. Sign up user via Supabase Auth
  const { data: signUpData, error: signUpError } = await rawSupabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    return { success: false, error: signUpError.message };
  }

  const userId = signUpData.user?.id;
  if (!userId) {
    return { success: false, error: 'Failed to create user authentication credentials.' };
  }

  // 2. Create company-scoped profile
  const { error: profileError } = await rawSupabase
    .from('profiles')
    .insert({
      id: userId,
      email,
      company_id: session.company_id,
      role: role === 'admin' ? 'admin' : 'moderator',
      full_name: email.split('@')[0]
    });

  if (profileError) {
    return { success: false, error: profileError.message };
  }

  revalidatePath('/users');
  return { success: true };
}

export async function deleteUser(id: string) {
  const session = await getSession();
  if (session?.role !== 'admin') {
    return { success: false, error: 'Unauthorized' };
  }

  // Prevent deleting self
  if (session.id === id) {
    return { success: false, error: 'You cannot delete your own account' };
  }

  // Delete from profiles
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/users');
  return { success: true };
}
