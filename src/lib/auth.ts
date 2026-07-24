import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as { 
      id: string; 
      username: string; 
      role: string; 
      company_id: string; 
      assigned_location_id?: string | null;
      assigned_location_ids?: string[] | null;
      full_name?: string | null;
    };

    if (parsed && parsed.id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role, full_name, company_id, assigned_location_id, assigned_location_ids')
        .eq('id', parsed.id)
        .single();

      if (prof) {
        parsed.role = prof.role;
        parsed.full_name = prof.full_name || parsed.full_name;
        parsed.company_id = prof.company_id || parsed.company_id;
        parsed.assigned_location_id = prof.assigned_location_id;
        parsed.assigned_location_ids = prof.assigned_location_ids || [];
      }
    }

    return parsed;
  } catch(e) {
    return null;
  }
}
