'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    return { success: false, error: error.message, data: [] };
  }
  return { success: true, data };
}

export async function addEmployee(name: string, email: string, designation?: string, department?: string, locationId?: string | null) {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const { error } = await supabase.from('employees').insert({
    company_id: session.company_id,
    name,
    email,
    designation: designation || null,
    department: department || null,
    location_id: locationId || null
  });

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'An employee with this email already exists in your company.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/employees');
  return { success: true };
}

export async function updateEmployee(id: string, name: string, email: string, designation?: string, department?: string, locationId?: string | null) {
  const { error } = await supabase.from('employees').update({
    name,
    email,
    designation: designation || null,
    department: department || null,
    location_id: locationId || null
  }).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'An employee with this email already exists.' };
    }
    return { success: false, error: error.message };
  }

  revalidatePath('/employees');
  return { success: true };
}

export async function deleteEmployee(id: string) {
  const { error } = await supabase.from('employees').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  revalidatePath('/employees');
  return { success: true };
}
