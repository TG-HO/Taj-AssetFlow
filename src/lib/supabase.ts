import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-url.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'mock-anon-key';

export const rawSupabase = createClient(supabaseUrl, supabaseAnonKey);

const TABLES_TO_SCOPE = [
  'assets',
  'admin_logs',
  'locations',
  'sub_locations',
  'warehouses',
  'audit_logs',
  'item_categories',
  'inventory_items',
  'inventory_specs',
  'employees',
  'stock_allocations',
  'site_requests',
  'notifications',
  'isp_inventory'
];

function getClientSession(): any | null {
  if (typeof window !== 'undefined') {
    try {
      const sessionStr = localStorage.getItem('tenant_session');
      if (sessionStr) {
        return JSON.parse(sessionStr);
      }
    } catch (e) {}
  }
  return null;
}

async function getServerSession(): Promise<any | null> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;
    if (token) {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    }
  } catch (e) {}
  return null;
}

function injectSessionContext(body: any, companyId: string | null, role: string | null, assignedLocationId: string | null, table: string) {
  const inject = (obj: any) => {
    if (obj && typeof obj === 'object') {
      const tablesWithoutCompanyId = ['sub_locations', 'warehouses', 'inventory_specs'];
      if (companyId && !tablesWithoutCompanyId.includes(table)) {
        obj.company_id = companyId;
      }
      if (role === 'site_manager' && assignedLocationId) {
        const locationBoundTables = ['assets', 'inventory_items', 'site_requests', 'isp_inventory', 'stock_allocations', 'sub_locations', 'warehouses', 'employees', 'notifications'];
        if (locationBoundTables.includes(table)) {
          const colName = table === 'stock_allocations' ? 'target_location_id' : 'location_id';
          obj[colName] = assignedLocationId;
        }
      }
    }
  };
  if (Array.isArray(body)) {
    body.forEach(inject);
  } else {
    inject(body);
  }
}

function createScopedBuilder(builder: any, table: string, actionType?: string): any {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (prop === 'then') {
        return (onfulfilled: any, onrejected: any) => {
          const run = async () => {
            let companyId: string | null = null;
            let role: string | null = null;
            let assignedLocationId: string | null = null;

            if (typeof window === 'undefined') {
              const session = await getServerSession();
              companyId = session?.company_id || null;
              role = session?.role || null;
              assignedLocationId = session?.assigned_location_id || null;
            } else {
              const session = getClientSession();
              companyId = session?.company_id || null;
              role = session?.role || null;
              assignedLocationId = session?.assigned_location_id || null;
            }

            let finalBuilder = target;
            if (companyId) {
              const tablesWithoutCompanyId = ['sub_locations', 'warehouses', 'inventory_specs'];
              if (actionType !== 'insert') {
                if (!tablesWithoutCompanyId.includes(table)) {
                  finalBuilder = finalBuilder.eq('company_id', companyId);
                }

                // Site Manager Location Scoping
                if (role === 'site_manager') {
                  const activeLoc = assignedLocationId || '00000000-0000-0000-0000-000000000000';
                  const locationBoundTables = ['assets', 'inventory_items', 'site_requests', 'isp_inventory', 'stock_allocations', 'sub_locations', 'warehouses', 'employees', 'notifications'];
                  if (locationBoundTables.includes(table)) {
                    const colName = table === 'stock_allocations' ? 'target_location_id' : 'location_id';
                    finalBuilder = finalBuilder.eq(colName, activeLoc);
                  } else if (table === 'locations') {
                    let assignedIds: string[] = [];
                    if (typeof window === 'undefined') {
                      const session = await getServerSession();
                      assignedIds = session?.assigned_location_ids || [];
                    } else {
                      const session = getClientSession();
                      assignedIds = session?.assigned_location_ids || [];
                    }
                    if (assignedIds && assignedIds.length > 0) {
                      finalBuilder = finalBuilder.in('id', assignedIds);
                    } else {
                      finalBuilder = finalBuilder.eq('id', '00000000-0000-0000-0000-000000000000');
                    }
                  }
                }
              } else {
                if (target.body) {
                  injectSessionContext(target.body, companyId, role, assignedLocationId, table);
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
            const session = getClientSession();
            if (session) {
              injectSessionContext(args[0], session.company_id || null, session.role || null, session.assigned_location_id || null, table);
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
