# Site Requests Module

The Site Requests module implements a **batch requisition workflow** that allows Site Managers to request assets from administrators and enables admins to approve, reject, print vouchers, and export records.

## Architecture

### Files
| File | Purpose |
|------|---------|
| `src/app/site-requests/page.tsx` | Client component — request form (site manager), logs table, print modal, CSV export |
| `src/app/site-requests/actions.ts` | Server actions — `getSiteRequests`, `createSiteRequestsBatch`, `updateSiteRequestStatus` |
| `supabase/v2_upgrades.sql` | DDL for `site_requests` table including `items` JSONB column |

### Database Table: `site_requests`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `company_id` | UUID | FK to companies (multi-tenant) |
| `location_id` | UUID | FK to locations (origin branch) |
| `item_type` | VARCHAR(100) | Human-readable summary label, e.g. `"Mouse, Printer +1 more"` |
| `quantity` | INT | Total quantity across all batch items |
| `details` | TEXT | Pipe-delimited justification summaries from all items |
| `items` | JSONB | **Array of batch items** — `[{itemType, quantity, details}, ...]` |
| `status` | VARCHAR(50) | `Pending` / `Approved` / `Rejected` |
| `created_by` | VARCHAR(150) | Format: `"Full Name (email@example.com)"` |
| `created_at` | TIMESTAMPTZ | Auto-generated |

> **Critical**: The `items` column stores a proper JSONB array — **never** use `JSON.stringify()` when inserting. Supabase's client library serializes JS objects to JSONB natively.

---

## Batch Request Flow

### How It Works
1. **Site Manager** selects a branch, picks items from a dropdown, enters quantity + justification for each, and adds them to a builder list
2. On submit, `createSiteRequestsBatch` inserts **one single row** with:
   - `item_type`: Short summary label — first 2 items + `"+N more"` if more exist
   - `quantity`: Sum of all item quantities
   - `items`: Full JSONB array with per-item breakdown
3. **Admin** sees one consolidated record in the Active Requests Log
4. Clicking the row expands to show the batch items list
5. Admin can approve/reject, print a PDF voucher, or export to CSV

### Summary Label Generation
```js
const firstTwo = requests.slice(0, 2).map(r => r.itemType);
const remaining = requests.length - 2;
const summaryLabel = remaining > 0 
  ? `${firstTwo.join(', ')} +${remaining} more` 
  : firstTwo.join(', ');
```

### created_by Format
Always stored as `"Full Name (email)"` using:
```js
created_by: `${session.full_name || 'Site Manager'} (${session.username})`
```
Parsed with `parseCreatedBy()` which uses regex `/(.*?)\s*\((.*?)\)/` to extract name and email.

---

## JSONB Items Safety

### The `safeParseItems` Helper
Because old data may have been corrupted (stored as a string via `JSON.stringify` instead of a native JSONB array), all fetched records are normalized immediately after loading:

```js
const safeParseItems = (items: any): any[] => {
  if (Array.isArray(items)) return items;         // New correct data
  if (typeof items === 'string') {
    try { 
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];  // Old stringified data
    } catch { return []; }
  }
  return [];                                       // null/undefined
};
```

This is applied in `fetchRequests`:
```js
const normalized = (res.data || []).map((req) => ({
  ...req,
  items: safeParseItems(req.items)
}));
```

---

## Print Voucher

### Approach: JavaScript Window Printing
CSS-based `@media print` approaches failed because:
- `body > * { display: none }` hides the Next.js root `<div id="__next">`, making `#printable-requisition` invisible since a child cannot override a parent's `display: none`
- `visibility: hidden` preserves layout space, causing phantom extra pages

**Solution**: `handlePrintVoucher()` clones the voucher HTML into a **new browser window** with self-contained CSS, then calls `window.print()` on that window:

```js
const handlePrintVoucher = () => {
  const content = document.getElementById('printable-requisition');
  const printWin = window.open('', '_blank');
  printWin.document.write(`<html><head><style>...</style></head>
    <body>${content.innerHTML}</body></html>`);
  printWin.document.close();
  setTimeout(() => { printWin.print(); printWin.close(); }, 300);
};
```

This guarantees:
- Exactly **one page** of output
- No interference from the app's CSS/layout
- Clean, professional styling with embedded print stylesheet

---

## CSV / Excel Export

### Global Export
The **Export Excel** button in the page header exports ALL requests. Batch items are exploded into individual rows sharing the same Request ID.

### Per-Record Export
Each row has a download icon button (admin-only) that exports just that single request's items via `handleExportSingleRequestCSV(req)`.

### CSV Format
```
Request ID, Requested Item, Quantity, Origin Branch, Requester Name, Requester Email, Status, Date Submitted, Justification
```

UTF-8 BOM (`\uFEFF`) is prepended so Microsoft Excel opens it correctly.

---

## Role Restrictions

| Feature | Admin | Moderator | Site Manager |
|---------|-------|-----------|--------------|
| View all requests | ✅ | ✅ | ❌ (own site only) |
| Approve / Reject | ✅ | ✅ | ❌ |
| Print voucher | ✅ | ✅ | ❌ |
| Export Excel (per-record) | ✅ | ✅ | ❌ |
| Export Excel (global) | ✅ | ✅ | ❌ |
| Submit batch request | ❌ | ❌ | ✅ |

---

## Expandable Batch Rows

The Active Requests Log table rows are clickable. For batch requests:
- **Collapsed**: Shows `"▶ Click to view N items..."` link
- **Expanded**: Shows a detailed list of all items with quantities and remarks
- `expandedRequests` state (string array of request IDs) tracks which rows are open
- `stopPropagation()` is used on the expanded content and action buttons to prevent toggle conflicts

---

## Notifications

When a batch request is submitted, two notifications fire:
1. **In-app notification** to admin — stored in `notifications` table with `is_important: true`
2. **Simulated email** — logged to server console with full item breakdown

When admin approves/rejects, a notification is sent back to the Site Manager's branch.

---

## Known Issues & Fixes Log

| Date | Issue | Root Cause | Fix |
|------|-------|-----------|-----|
| 2026-07-09 | Batch items saved as individual rows | `insert(array)` inserts one row per element | Changed to `insert(singleRow)` with JSONB `items` |
| 2026-07-09 | `items.map is not a function` | `JSON.stringify()` stored a string in JSONB column | Removed `JSON.stringify()`, added `safeParseItems` normalizer |
| 2026-07-09 | Badge showed "Batch (177 items)" | `.length` on a string = char count | Fixed by normalizing items to array on fetch |
| 2026-07-09 | Print preview blank / multi-page | CSS `display:none` on body hides nested children | Switched to JS window.open() print approach |
| 2026-07-09 | "Click to view items" did nothing | `stopPropagation` on parent blocked row click | Moved `stopPropagation` to expanded content only, gave link its own `onClick` |
| 2026-07-09 | Requester email missing in exports | `full_name` null caused `created_by` to omit parenthesized email | Always format as `"Name (email)"` with fallback name |
