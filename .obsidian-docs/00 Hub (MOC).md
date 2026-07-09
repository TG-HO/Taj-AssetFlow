# Taj AssetFlow Project Hub (MOC)

Welcome to the **Taj AssetFlow** Obsidian documentation workspace. This project is a multi-tenant enterprise Asset and Inventory Management System built using **Next.js (App Router)** and **Supabase (Postgres Auth, Storage, and Realtime)**.

Use this Hub (Map of Content) to navigate the codebase, components, database schemas, and architectural patterns:

## 🗺️ Codebase Map

- **[[Frontend App Routers]]**: Core page layouts, dynamic sub-pages, server actions, and route-level authorization guards.
- **[[UI and Custom Components]]**: Shared UI designs, interactive combobox selectors, dynamic sidebars, and alert dialog interfaces.
- **[[Database Schema and Migrations]]**: Supabase/PostgreSQL schema designs, company isolation structures, audit logs, and table relations.
- **[[Security and RLS Scoping Model]]**: Multi-tenant Row-Level Security (RLS) enforcement, Supabase client proxy builder scoping, and JWT auth propagation.
- **[[Site Requests Module]]**: Batch requisition workflow — JSONB items storage, JS-based print vouchers, CSV exports, role restrictions, and bug fix log.

## 🚀 Key Workflows

- **Intake Stock Workflow**: Super Admin dispatches stock via `[[Frontend App Routers#Stock Allocations|Stock Allocations]]`, which Site Managers reconcile and auto-ingest into local `[[Database Schema and Migrations#inventory_items|inventory_items]]`.
- **Site Request Pipeline**: Site Managers file batch asset requisitions via `[[Site Requests Module]]`. A single DB row stores all items as JSONB. Admins see consolidated records, expand to view items, print vouchers (JS window approach), and export to CSV. See `[[Site Requests Module#Batch Request Flow]]` for details.
- **Role-based Scope Resolution**: Client queries intercept session tokens via `[[Security and RLS Scoping Model#Client Proxy Scoping|Client Proxy Builder]]` to restrict database reads/writes at the API layer.

