# Database Schema and Migrations

Taj AssetFlow runs on a PostgreSQL database hosted by Supabase. Multi-tenancy is structured around the `companies` table, utilizing UUID references to enforce row segregation.

---

## 🗄️ Database Tables

### 1. `companies`
- **Purpose**: Tenant record identifier.
- **Fields**: `id` (UUID), `name`, `code` (e.g. 'TG' for Taj Gasoline, 'TC' for Taj Corporation), `created_at`.

### 2. `profiles`
- **Purpose**: Maps user session context to auth IDs.
- **Fields**: `id` (UUID, references auth.users), `company_id`, `role`, `email`, `full_name`, `assigned_location_id`.

### 3. `assets`
- **Purpose**: Hard serialized physical assets.
- **Fields**: `id`, `company_id`, `location_id`, `sub_location_id`, `warehouse_id`, `laptop_name`, `serial_number`, `ram`, `storage_type`, `storage_capacity`, `assigned_to` (email), `status`, `purchase_date`, `issue_date`.

### 4. `inventory_items`
- **Purpose**: Bulk inventory and consumable stocks (chargers, peripherals).
- **Fields**: `id`, `company_id`, `category_id`, `location_id`, `sub_location_id`, `warehouse_id`, `name`, `quantity`, `minimum_safety_stock`, `notes`.

### 5. `employees`
- **Purpose**: Organization staff mapped to branches.
- **Fields**: `id`, `company_id`, `location_id` (foreign key), `name`, `email` (unique per company), `designation`, `department`.

### 6. `stock_allocations`
- **Purpose**: Logs bulk shipments dispatched between branches.
- **Fields**: `id`, `company_id`, `target_location_id`, `item_type`, `quantity_allocated`, `reconciled_quantity`, `status` (`Pending`, `Reconciled`, `Mismatch`), `reconciled_by`, `reconciled_at`.

### 7. `site_requests`
- **Purpose**: Requisitions filed by branches.
- **Fields**: `id`, `company_id`, `location_id`, `item_type`, `quantity`, `details`, `status` (`Pending`, `Approved`, `Rejected`), `created_by`.

### 8. `notifications`
- **Purpose**: Scoped system alerts feed.
- **Fields**: `id`, `company_id`, `location_id` (null if global, UUID if branch targeted), `title`, `message`, `is_read`, `is_important`, `redirect_url`.

### 9. `isp_inventory`
- **Purpose**: Branch bandwidth connections.
- **Fields**: `id`, `company_id`, `location_id`, `provider_name`, `package_details`, `bandwidth_mbps`, `monthly_cost`.

---

## 📜 Migration Scripts (`supabase/`)
- **`migration.sql`**: Core baseline DDL schema setting up assets, companies, and admin logs.
- **`location_schema.sql`**: Configures multi-tier geography (Locations -> Sub-locations / Departments -> Warehouses / Zones).
- **`feature3_schema.sql`** & **`feature4_schema.sql`**: Introduces software vault specifications, categories, and license seating structures.
- **`v2_upgrades.sql`**: Upgrades roles checking, adds employees directory schema, stock allocations tables, in-app notifications, and configures database security/RLS policies.

---

## 🔗 Related Notes
- [[Security and RLS Scoping Model]]
- [[Frontend App Routers]]
