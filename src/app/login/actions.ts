'use server'

import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function login(username: string, password: string) {
  try {
    const { data: user, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !user) {
      return { success: false, error: 'Invalid username or password' }
    }

    // Set auth cookie
    const token = Buffer.from(JSON.stringify({ 
      id: user.id, 
      username: user.username, 
      role: user.role 
    })).toString('base64');
    
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_token');
  return { success: true };
}
