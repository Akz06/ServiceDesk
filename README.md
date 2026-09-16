# ServiceDesk Repair ERP

A full-stack electronics repair ERP for laptop, desktop, mobile, tablet, console, accessory, and other electronics repair shops.

The application now uses a **Zoho Creator-like layout**: a public homepage, login page, left-side application/module navigation, module-specific views, form panels, report/list panels, record detail panels, and PostgreSQL-backed full-stack APIs.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- Auth: PostgreSQL users and sessions, `scrypt` password hashing, bearer session tokens
- Deployment: Railway single web service serving API and built frontend

## UI/UX Design Review and Improvements

The current UI was reviewed from a product-design perspective and updated to feel more like a usable business application instead of an oversized dashboard.

Implemented improvements:

- Reduced the overall type scale for headings, KPI numbers, forms, buttons, and record cards.
- Replaced hard-coded colors with design tokens in `src/styles.css`.
- Added light/dark mode support with a visible toggle on both the public homepage and logged-in workspace.
- Theme preference is saved in browser storage and defaults to the user system preference on first visit.
- Improved color contrast across panels, forms, status pills, timeline, inventory, and reports.
- Kept the Zoho Creator-like layout: sidebar apps/modules, topbar, forms, reports, and record detail panels.
- Masked the admin "create user" password field (`type="password"`) instead of showing it in plain text.
- Scoped the Customer module's summary metrics to that customer's own repairs instead of showing shop-wide revenue and stock counts.
- Moved the service catalog and inventory panel out of every module page and into dedicated "Catalog"/"Inventory" views (Admin gets both, Agent gets Inventory, Technician gets a read-only Parts view, Customer gets neither).
- Added confirmation prompts before destructive actions: reset demo data, deactivate a user, cancel a work item, void an invoice.
- Added a collapsible off-canvas navigation drawer for mobile (<840px) instead of a full-width stacked sidebar.
- Gave every work-item and invoice status its own distinct pill color instead of falling back to one default blue.
- Fixed the customer progress tracker to show a dedicated "Cancelled" state instead of rendering every stage as incomplete.
- Fixed short record lists (e.g. a customer with one repair) rendering with a large dead gap instead of sitting at the top.
- Added `aria-label`s to icon-only stepper buttons and a visually-hidden label on search inputs.
- Added a consistent toast notification pattern for create/update actions, replacing the one-off inline banner.

Recommended future UX refinements:

- Split `src/App.tsx` into smaller module components for maintainability.
- Add table sorting and pagination.
- Add skeleton loading states for API-backed pages.

## Competitive Teardown: What Shipped

Following a competitive review against RepairShopr/Syncro, RepairDesk, RepairQ, Fixably, Orderry, and Zoho, this pass added the highest-priority gaps that every competitor already covers, plus a few differentiators:

- **Automated customer notifications** — status changes on a work item (and new work-item creation) automatically log an outbound SMS via a pluggable `NotificationProvider` (`server/notifications.ts`). No SMS/WhatsApp account is wired up yet, so it runs on a `MockNotificationProvider` that marks every message "sent" — swap in a real Twilio-backed provider behind the same interface to go live. Agents can also send an ad-hoc "Notify customer" message from a work item's detail panel. Admin has a **Notifications** log view; customers see messages sent to them inline in their repair timeline.
- **Invoice payments** — a "Record payment" flow (method + reference) marks an invoice Paid via a `MockPaymentProvider`-style flow (no real Stripe/Razorpay account connected — drop one in behind `recordInvoicePayment` in `server/repository.ts`).
- **CSV export** — Admin can export Invoices and Customers as CSV (`GET /api/export/invoices.csv`, `GET /api/export/customers.csv`) for import into QuickBooks/Xero/any spreadsheet. This is export-only, not a live two-way accounting sync.
- **Report builder** — Admin's **Reports** tab lets you pick an entity (work items/invoices/customers/inventory), pick columns, filter, preview, export to CSV, and save/re-run named report definitions.
- **Kanban board** — Agent's **Board** view shows work items grouped by status with one-click "Advance to next status."
- **Itemized cost breakdown** — estimates and invoices now break out labor / parts / diagnostic fee instead of one lump total.
- **Enforced workflow step** — a work item can't move to Ready for Pickup or Delivered without a diagnosis/analysis note on file (enforced both client-side and server-side).
- **No-lock-in / transparent pricing messaging** — added to the public homepage, since this is a genuine structural advantage of self-hosting on your own Postgres database.

### Not shipped this pass (tracked, not forgotten)

These were identified in the same competitive review but need either a real third-party account/credentials, a bigger schema change, or a dedicated pass of their own:

- Real SMS/WhatsApp/email delivery (needs a Twilio/WhatsApp Business account — the provider interface is ready)
- Real payment gateway (needs a Stripe/Razorpay account — the provider seam is ready)
- Live two-way QuickBooks/Xero sync (currently CSV export only)
- POS-lite counter/walk-in checkout with barcode scanning for retail parts sales
- Offline-tolerant technician PWA with queued photo capture
- Multi-location/franchise mode
- Marketing automation, loyalty/membership programs, and a "customers gone quiet" win-back report
- Serial-level part tracking tied to warranty expiry
- Trade-in valuation, e-waste disposal certificates, device repair passport, parts authenticity verification
- AI-assisted diagnosis, confidence-scored pre-checks, and AI chat intake triage
- Vertical OEM integrations (e.g. Apple GSX), unified omni-channel inbox, localization

### Known limitation worth flagging

`GET /api/state` currently returns the full dataset (all customers, all work items, all invoices) to any authenticated user — the Customer module only *displays* the signed-in customer's own records client-side rather than the server scoping the query. There is also no link yet between a `customer`-profile user account and a specific `customers` row (the customer picker in the Customer module is still a manual selector, as already called out above under "Customer-specific login binding"). Both are worth a dedicated security pass before onboarding real customer data.

## End-User Readiness Pass

A full pass across every role and module (Admin/Agent/Technician/Customer), driven live in a browser rather than just typechecked, turned up issues that made the app feel like an internal dev tool rather than a product a shop owner would trust:

- **Removed backend/implementation jargon from the logged-in workspace.** The sidebar no longer shows "PostgreSQL API" / "Local demo", the topbar no longer shows a raw session ID, and the sync banner only appears when there's something the user actually needs to know (a real error, or "you're working offline and changes are only saved on this device") instead of announcing its persistence mode at all times.
- **Fixed raw/technical error messages leaking into the UI.** Every API failure used to surface as `ServiceDesk API request failed (400): {"error":"..."}` in toasts and banners. `src/services/apiClient.ts` now parses the server's JSON error and shows just the human message, with sane fallbacks for network failures, 401s, and 403s.
- **Fixed a real bug: CSV export silently downloaded the wrong file in local demo mode.** `npm run dev` has no Express backend, so hitting `/api/export/*.csv` was falling through to Vite's SPA fallback and downloading `index.html` renamed to `.csv` — with no error shown. Export now branches the same way every other action does: a real API call when a backend is connected, and an equivalent client-side CSV built from already-loaded state when running in local demo mode.
- **Fixed a real bug: the "no diagnosis, no closing a ticket" rule was a no-op.** New work items defaulted `analysis` to the placeholder string `"Technician analysis pending."`, which is non-empty — so the enforcement check (which only blocks a truly empty analysis) never actually fired. The default is now an empty string, with the existing "Pending technician analysis" fallback text still shown wherever it's displayed.
- Softened homepage marketing copy that read like a backend README ("PostgreSQL-backed full-stack application", "Express APIs... PostgreSQL") into plain business language.

## App Experience

### Public homepage

The homepage explains the product before login:

- Repair ERP overview
- Feature highlights
- Application preview
- Secure login panel
- Demo login shortcuts

### Creator-style workspace

After login, users enter an app shell similar to a low-code business app:

- Left sidebar with the Repair ERP application and allowed modules
- Topbar with current module, profile, and session
- View tabs inside each module
- Forms on the left and reports/record details on the right
- Master-data reports and filtered views
- Responsive mobile/tablet layout

## Modules

| Profile | Modules |
| --- | --- |
| Admin | Admin, Agent, Technician, Customer |
| Agent | Agent |
| Technician | Technician |
| Customer | Customer |

### Admin module

Creator-style views:

- Overview
- Users
- Customers
- Technicians
- Invoices

Capabilities:

- User management
- Create users with profile assignment
- Activate/deactivate users
- Business metrics
- Customer master report
- Technician master report
- Invoice creation
- Invoice status updates: Draft, Issued, Paid, Void
- Inventory management and demo data reset

### Agent module

Creator-style views:

- New request
- All work items
- Walk-ins

Capabilities:

- Create online or walk-in repair work items
- Capture customer/device details
- Assign/reassign technicians
- Search and cancel work items
- Open a record detail panel from the list view
- Manage spare-parts inventory

### Technician module

Creator-style views:

- Assigned jobs
- Estimates
- In repair

Capabilities:

- View assigned repair jobs
- Add diagnosis and required changes
- Share estimate price
- Update promised time and repair status
- Consume spare parts from inventory

### Customer module

Creator-style views:

- My repairs

Capabilities:

- View repair progress
- Select repair record
- See update timeline
- Approve shared estimates

## Demo Login Users

These users are seeded automatically into PostgreSQL on startup:

| Profile | Email | Password |
| --- | --- | --- |
| Admin | `admin@servicedesk.local` | `Admin@12345` |
| Agent | `agent@servicedesk.local` | `Agent@12345` |
| Technician | `tech@servicedesk.local` | `Tech@12345` |
| Customer | `customer@servicedesk.local` | `Customer@12345` |

Change or deactivate demo users before real production use.

## Railway Setup

1. Push latest `main` to GitHub.
2. In Railway, deploy from `Akz06/ServiceDesk`.
3. Add a PostgreSQL service.
4. Attach PostgreSQL variables to the app service.
5. Set these variables on the app service:

```text
DATABASE_URL=<Railway PostgreSQL DATABASE_URL>
NODE_ENV=production
PGSSLMODE=require
NIXPACKS_NODE_VERSION=22
AUTH_SECRET=<long random secret>
SESSION_TTL_HOURS=168
VITE_API_BASE_URL=
```

Generate `AUTH_SECRET` locally:

```bash
openssl rand -base64 48
```

Keep `VITE_API_BASE_URL` empty on Railway so the frontend calls the same service with relative `/api/*` URLs.

## Railway Commands

Railway uses `railway.json`:

```text
Build: npm run build
Start: npm start
Health check: /api/health
```

Verify after deployment:

```text
https://your-railway-domain.up.railway.app/api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "service-desk",
  "storage": "postgres"
}
```

## Local Full-Stack Run

```bash
cd /Users/akshay-5823/ServiceDesk
cp .env.example .env
# edit DATABASE_URL and AUTH_SECRET
npm install
npm run migrate
npm run build
npm start
```

Open:

```text
http://localhost:3000
```

## Local Frontend Demo Mode

```bash
npm run dev
```

This mode uses local demo auth and `localStorage`. Railway/production uses PostgreSQL.

## API Summary

Auth:

```http
POST /api/auth/login
GET /api/auth/me
POST /api/auth/logout
```

Admin:

```http
GET /api/admin/users
POST /api/admin/users
PATCH /api/admin/users/:id
```

Service desk:

```http
GET /api/state
POST /api/work-items
PATCH /api/work-items/:id
POST /api/work-items/:id/approval
POST /api/work-items/:id/cancel
POST /api/work-items/:id/notify
PATCH /api/inventory/:sku/adjust
PUT /api/inventory/:sku
POST /api/invoices
PATCH /api/invoices/:id
POST /api/invoices/:id/payment
POST /api/reports
DELETE /api/reports/:id
GET /api/export/invoices.csv
GET /api/export/customers.csv
POST /api/reset
```

All protected APIs require:

```http
Authorization: Bearer <session-token>
```

## Database Migrations

Migrations run automatically on startup and can also be run manually:

```bash
npm run migrate
```

Current migrations:

- `001_init.sql`: customers, work items, updates, inventory
- `002_auth.sql`: users and user sessions
- `003_erp_modules.sql`: invoices
- `004_growth_modules.sql`: notifications, saved reports, invoice payment fields, itemized cost breakdown columns

## Validation

Run before pushing:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## Design Direction

This is no longer just a dashboard. The UI is structured as a business application:

- Application sidebar
- Role-based modules
- Module-level view tabs
- Forms
- Reports
- Record list and detail views
- Master data pages
- Workflow-specific action panels

Future improvements to make it even closer to Zoho Creator:

- Configurable form builder
- Saved report filters
- Kanban workflow view
- Audit trail per record
- File attachments for device photos
- Customer-specific login binding instead of selectable demo customer
- Granular permissions per view/action

## Security Notes

Before using for real customers:

- Replace or deactivate demo users.
- Use a strong Railway `AUTH_SECRET`.
- Add login rate limiting.
- Add password reset and email verification.
- Restrict CORS if frontend/backend are split.
- Add audit logs for user, invoice, and repair status changes.
- Add stronger request validation with a schema library such as Zod.
