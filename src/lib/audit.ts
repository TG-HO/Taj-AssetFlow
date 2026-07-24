'use server';

import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/auth';

export type AuditAction =
  | 'ADD_ASSET'
  | 'EDIT_ASSET'
  | 'DELETE_ASSET'
  | 'ADD_LOCATION'
  | 'EDIT_LOCATION'
  | 'DELETE_LOCATION'
  | 'ADD_DEPARTMENT'
  | 'EDIT_DEPARTMENT'
  | 'DELETE_DEPARTMENT'
  | 'ADD_WAREHOUSE'
  | 'EDIT_WAREHOUSE'
  | 'DELETE_WAREHOUSE'
  | 'CREATE_USER'
  | 'DELETE_USER'
  | 'ISSUE_ITEM'
  | 'RETURN_ITEM'
  | 'ASSIGN_SEAT'
  | 'REVOKE_SEAT'
  | 'UPLOAD_INSTALLER'
  | 'DELETE_INSTALLER'
  | 'IMPORT_ASSETS'
  | 'TRANSFER_ASSET';

export async function writeAuditLog(
  actionType: AuditAction,
  targetIdentifier: string | null,
  previousState: Record<string, unknown> | null,
  newState: Record<string, unknown> | null
): Promise<void> {
  try {
    const session = await getSession();
    if (!session) return;

    await supabase.from('audit_logs').insert({
      company_id: session.company_id,
      user_id: session.id,
      user_email: session.username || 'unknown',
      action_type: actionType,
      target_identifier: targetIdentifier,
      previous_state: previousState,
      new_state: newState,
    });
  } catch {
    // Audit failures must never break primary operations — swallow silently
  }
}
