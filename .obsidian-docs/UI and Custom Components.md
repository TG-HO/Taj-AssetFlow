# UI and Custom Components

The application UI is styled with Vanilla CSS and Tailwind CSS, utilizing component structures designed for responsiveness and viewport scaling.

---

## 🧩 Shared Components

### 1. Sidebar Nav (`src/components/Sidebar.tsx`)
- **Features**:
  - **Dynamic Scoping**: Renders links based on `userRole`. Hides `Add Asset` and `Software Vault` for `'site_manager'`.
  - **Notifications Count Badge**: Pulsing indicator showing the count of unread notifications, scoped to the user's location.
  - **Settings Flyout**: Exposes submenu settings links on hover (disabled for `'site_manager'`, directly navigating to `/settings?tab=appearance` instead).
  - **Profile Card**: Displays user avatar initials, role status, and hosts the Sign Out handler.

### 2. Searchable Combobox Selector (`src/components/ui/employee-select.tsx`)
- **Component**: `EmployeeSelect`
- **Features**:
  - Replaces text inputs with a searchable dropdown query displaying employee name and email.
  - Pins "Unassigned / Return to Stock" option at the top.
  - Highlights currently selected staff mapping.

### 3. Styled Alert Dialog (`src/components/ui/alert-dialog.tsx`)
- **Features**:
  - A modal confirmation interface built on top of shadcn UI radix-primitives.
  - Standardizes delete warnings with smooth drop-in animations, replacing native `window.confirm()` calls.
  - Prevents button viewport clipping by enforcing explicit padding.

### 4. Custom Modals
- All dialog boxes in settings and employee directories use viewport-safe CSS configurations:
  - Flex layout centering.
  - `max-h-[90vh]` limits.
  - `overflow-y-auto` scroll behaviors to handle small monitors.

---

## 🔗 Related Notes
- [[Frontend App Routers]]
- [[Security and RLS Scoping Model]]
