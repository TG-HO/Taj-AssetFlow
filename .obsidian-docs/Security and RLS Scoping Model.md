# Security and RLS Scoping Model

The multi-tenant security architecture of Taj AssetFlow is enforced using a combination of Supabase Row-Level Security (RLS) and a Node client proxy runtime wrapper.

---

## 🛡️ Multi-Tenant Isolation (RLS)

All key tables containing tenant-sensitive information possess a `company_id` foreign key. The database limits read permissions using RLS policies that evaluate the current user's profile:
```sql
CREATE POLICY "Segregate records by company" ON public.assets
  FOR SELECT TO public
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
```
To enable admin registrations and logging, public write/insert policies bypass reads while enforcing baseline table checks.

---

## ⚙️ Client Proxy Scoping (`src/lib/supabase.ts`)

Instead of writing company filters on every server action manually, a proxy interceptor intercepts all Supabase client queries dynamically:

### A. Company Scoping
- Evaluates the active user's `auth_token` or `tenant_session`.
- Injects `company_id` into all insertions (`insert`).
- Appends `.eq('company_id', company_id)` to all query builders (`select`, `update`, `delete`), unless the table is excluded (e.g., hierarchical tables like `sub_locations` or `warehouses` which do not have a `company_id` column).

### B. Location Scoping for Site Managers
If the logged-in user possesses the `'site_manager'` role and has an `assigned_location_id`:
- Intercepts queries targeting location-bound tables (`assets`, `inventory_items`, `site_requests`, `isp_inventory`, `stock_allocations`, `sub_locations`, `warehouses`, `employees`, `notifications`).
- Automatically filters results by appending `.eq('location_id', assigned_location_id)` (or `target_location_id` for stock transfers).
- Limits locations table queries to `.eq('id', assigned_location_id)`.

---

## 🔑 Session & Authentication propagation (`src/lib/auth.ts`)
- User credentials verify against Supabase Auth.
- On login success, a Base64-encoded JSON cookie containing the profile (`company_id`, `role`, `assigned_location_id`) is stored as `auth_token`.
- Next.js server actions retrieve the active profile info via `getSession()` from the cookie store to validate permissions before triggering mutations.

---

## 🔗 Related Notes
- [[Database Schema and Migrations]]
- [[Frontend App Routers]]
