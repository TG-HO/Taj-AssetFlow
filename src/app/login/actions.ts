'use server'

import { cookies } from 'next/headers'

export interface SessionPayload {
  id: string;
  username: string;
  role: string;
  company_id: string;
}

export async function createSession(payload: SessionPayload) {
  try {
    const token = Buffer.from(JSON.stringify(payload)).toString('base64');
    
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_token');
  return { success: true };
}
