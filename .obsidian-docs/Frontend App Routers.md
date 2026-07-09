# Frontend App Routers

The frontend app routers are located under `src/app/` and leverage Next.js App Router conventions. Dynamic routing, state management, and Server Actions are used across modules.

---

## 📌 Page Directories & Routes

### 1. Dashboard (`/`)
- **Path**: `src/app/page.tsx`
- **Purpose**: Displays real-time summary statistics of healthy, unassigned, and damaged assets, recent activity feeds, and company-wide metrics.
- **Access**: All Roles (Admin, Moderator, Site Manager). Automatically scoped.

### 2. View Inventory (`/inventory`)
- **Path**: `src/app/inventory/`
- **Files**:
  - `page.tsx`: Unified list of active hardware assets with multi-parameter searches.
  - `add/page.tsx`: Asset registration form with employee search selectors.
  - `[id]/page.tsx`: Asset Passport showing full life-cycle history, specs, and custody logs.
  - `[id]/edit/page.tsx`: Context-aware asset wizard validating purchase vs issue date rules.

### 3. Consumables Inventory (`/inventory/consumables`)
- **Path**: `src/app/inventory/consumables/`
- **Purpose**: Displays list of supplies, peripherals, and non-serialized stock (e.g. mouse, keyboard, chargers) mapped to locations and Cost Centers.

### 4. Faulty / Damaged (`/inventory/faulty`)
- **Path**: `src/app/inventory/faulty/`
- **Purpose**: Restricted queue displaying items flagged with `Faulty` or `Damaged` custody states, allowing direct disposal or write-offs.

### 5. Software Vault (`/software-vault`)
- **Path**: `src/app/software-vault/`
- **Files**:
  - `page.tsx`: Dashboard displaying software license categories, seat utilization bars, and license expiry warnings.
  - `[id]/page.tsx`: Software passport showing allocated seats, downloadable installer binary logs, and metadata.
- **Access**: **Restricted** to Admins and Moderators. Site Managers receive a `Restricted Access` view.

### 6. Stock Allocations (`/stock-allocations`)
- **Path**: `src/app/stock-allocations/`
- **Server Actions**: `src/app/stock-allocations/actions.ts`
- **Purpose**: Centralized dispatch queue. 
  - **Admins** can dispatch hardware to physical branches.
  - **Site Managers** see targeted pending incoming shipments and can click **"Accept & Log"** or file a count discrepancy (flagged as `Mismatch`).

### 7. Site Requests (`/site-requests`)
- **Path**: `src/app/site-requests/`
- **Server Actions**: `src/app/site-requests/actions.ts`
- **Purpose**: Requisition intake forms. Site Managers file asset requests which route in-app alerts and console email notifications to IT management.

### 8. Employee Directory (`/employees`)
- **Path**: `src/app/employees/`
- **Server Actions**: `src/app/employees/actions.ts`
- **Purpose**: Searchable unified staff directory.
  - **Admins** can view global directories and filter by branch.
  - **Site Managers** are restricted to managing/viewing employees mapping to their assigned branch.

### 9. Settings (`/settings`)
- **Path**: `src/app/settings/`
- **Tabs**: Location Settings (`locations`), User Management (`users`), Appearance (`appearance`), Notifications (`notifications`), Security (`security`).
- **Access**:
  - Admins can configure cost centers, warehouses, users, and ISP inventories.
  - **Site Managers** are forced to the `Appearance` tab only (to adjust visual themes).

---

## 🔗 Related Notes
- [[UI and Custom Components]]
- [[Database Schema and Migrations]]
