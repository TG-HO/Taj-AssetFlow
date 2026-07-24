'use server'

import { supabase, rawSupabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

export async function getUsers() {
  const session = await getSession();
  if (!session || (session.role !== 'admin' && session.role !== 'moderator')) {
    throw new Error('Unauthorized');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, full_name, assigned_location_id, assigned_location_ids')
    .eq('company_id', session.company_id)
    .order('email', { ascending: true });

  if (error) throw error;
  
  return data.map(user => ({
    id: user.id,
    username: user.email,
    role: user.role,
    full_name: user.full_name,
    assigned_location_id: user.assigned_location_id,
    assigned_location_ids: user.assigned_location_ids || []
  }));
}

export async function createUser(
  username: string, 
  password: string, 
  role: string, 
  assignedLocationId?: string | null,
  assignedLocationIds?: string[],
  fullName?: string
) {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Session could not be resolved.' };
    }
    if (session.role !== 'admin') {
      return { success: false, error: `Forbidden: Role ${session.role} is not permitted to register users.` };
    }

    const email = username.trim();
    if (!email.includes('@')) {
      return { success: false, error: 'Validation Error: Please enter a valid email address.' };
    }

    // 1. Sign up user via Supabase Auth
    const { data: signUpData, error: signUpError } = await rawSupabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      return { success: false, error: `Auth Service Error: ${signUpError.message}` };
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      return { success: false, error: 'Auth Service Failure: SignUp succeeded but did not return a user UID.' };
    }

    // 2. Create company-scoped profile via upsert (to handle DB signup triggers gracefully)
    const { error: profileError } = await rawSupabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        company_id: session.company_id,
        role: role,
        full_name: fullName || email.split('@')[0],
        assigned_location_id: role === 'site_manager' ? (assignedLocationId || null) : null,
        assigned_location_ids: role === 'site_manager' ? (assignedLocationIds || []) : []
      });

    if (profileError) {
      return { success: false, error: `Database Constraint Error: Failed to write tenant profile. Details: ${profileError.message} (code: ${profileError.code})` };
    }

    // 3. Trigger simulated confirmation email printout
    console.log(`
================================================================================
SIMULATED EMAIL: Account Confirmation
To: ${email}
Subject: Welcome to Taj AssetFlow - Confirm Your Account
Body:
Hello,

An account has been created for you on Taj AssetFlow.
Your temporary credentials are:
- Email: ${email}
- Password: ${password}
- Role: ${role}

Please sign in at: http://localhost:3000/login
================================================================================
    `);

    // 4. Log in-app admin notification
    try {
      await rawSupabase.from('notifications').insert({
        company_id: session.company_id,
        title: 'User Registered',
        message: `New user ${email} was successfully registered as a ${role}.`,
        is_read: false,
        is_important: false,
        redirect_url: '/settings?tab=users'
      });
    } catch (notifErr: any) {
      console.error('Failed to log registration notification:', notifErr.message);
    }

    revalidatePath('/users');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: `Unexpected System Exception: ${err.message || err}` };
  }
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

export async function switchActiveLocation(locationId: string) {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: 'Unauthorized: Session not found.' };
    }

    // 1. Update profiles table
    const { error: profileError } = await rawSupabase
      .from('profiles')
      .update({ assigned_location_id: locationId })
      .eq('id', session.id);

    if (profileError) {
      return { success: false, error: profileError.message };
    }

    // 2. Update session cookie
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    
    session.assigned_location_id = locationId;
    const token = Buffer.from(JSON.stringify(session)).toString('base64');
    
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unexpected switcher exception' };
  }
}

export async function updateUser(
  id: string,
  role: string,
  assignedLocationId?: string | null,
  assignedLocationIds?: string[],
  fullName?: string
) {
  try {
    const session = await getSession();
    if (!session || session.role !== 'admin') {
      return { success: false, error: 'Unauthorized: Session not found or role is not admin.' };
    }

    const { error } = await rawSupabase
      .from('profiles')
      .update({
        role: role,
        assigned_location_id: role === 'site_manager' ? (assignedLocationId || null) : null,
        assigned_location_ids: role === 'site_manager' ? (assignedLocationIds || []) : [],
        full_name: fullName
      })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/users');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unexpected update exception' };
  }
}

export async function syncSessionCookie() {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: 'No active session found.' };

    const { data: prof, error } = await rawSupabase
      .from('profiles')
      .select('assigned_location_id, assigned_location_ids, role, full_name')
      .eq('id', session.id)
      .single();

    if (error || !prof) {
      return { success: false, error: error?.message || 'Profile not found' };
    }

    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();

    session.assigned_location_id = prof.assigned_location_id;
    session.assigned_location_ids = prof.assigned_location_ids;
    session.role = prof.role;
    session.full_name = prof.full_name;

    const token = Buffer.from(JSON.stringify(session)).toString('base64');
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unexpected sync exception' };
  }
}
