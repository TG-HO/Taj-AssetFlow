import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-url.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'mock-anon-key';

export const rawSupabase = createClient(supabaseUrl, supabaseAnonKey);

const TABLES_TO_SCOPE = ['assets', 'admin_logs', 'locations'];

function getClientCompanyId(): string | null {
  if (typeof window !== 'undefined') {
    try {
      const sessionStr = localStorage.getItem('tenant_session');
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        return session.company_id || null;
      }
    } catch (e) {}
  }
  return null;
}

async function getServerCompanyId(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (token) {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const session = JSON.parse(decoded);
      return session.company_id || null;
    }
  } catch (e) {}
  return null;
}

function createScopedBuilder(builder: any, table: string, actionType?: string): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onfulfilled: any, onrejected: any) => {
          const run = async () => {
            let companyId: string | null = null;
            if (typeof window === 'undefined') {
              companyId = await getServerCompanyId();
            } else {
              companyId = getClientCompanyId();
            }

            let finalBuilder = target;
            if (companyId) {
              if (actionType !== 'insert') {
                finalBuilder = finalBuilder.eq('company_id', companyId);
              } else {
                if (target.body) {
                  const inject = (obj: any) => {
                    if (obj && typeof obj === 'object') {
                      obj.company_id = companyId;
                    }
                  };
                  if (Array.isArray(target.body)) {
                    target.body.forEach(inject);
                  } else {
                    inject(target.body);
                  }
                }
              }
            }
            const res = await finalBuilder;
            return res;
          };

          return run().then(onfulfilled, onrejected);
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: any[]) => {
          let nextActionType = actionType;
          if (prop === 'select' || prop === 'update' || prop === 'delete' || prop === 'insert') {
            nextActionType = prop as string;
          }

          if (prop === 'insert' && args[0]) {
            const clientCompanyId = getClientCompanyId();
            if (clientCompanyId) {
              const inject = (obj: any) => {
                if (obj && typeof obj === 'object') {
                  obj.company_id = clientCompanyId;
                }
              };
              if (Array.isArray(args[0])) {
                args[0].forEach(inject);
              } else {
                inject(args[0]);
              }
            }
          }

          const result = value.apply(target, args);
          return createScopedBuilder(result, table, nextActionType);
        };
      }

      return value;
    }
  });
}

export const supabase = new Proxy(rawSupabase, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return (table: string) => {
        const originalBuilder = rawSupabase.from(table);
        if (!TABLES_TO_SCOPE.includes(table)) {
          return originalBuilder;
        }
        return createScopedBuilder(originalBuilder, table);
      };
    }
    return Reflect.get(target, prop, receiver);
  }
});
