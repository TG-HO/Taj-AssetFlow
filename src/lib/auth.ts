import { cookies } from 'next/headers';

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    return JSON.parse(decoded) as { id: string; username: string; role: string };
  } catch(e) {
    return null;
  }
}
