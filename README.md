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

Recommended future UX refinements:

- Split `src/App.tsx` into smaller module components for maintainability.
- Add table sorting, pagination, and saved report filters.
- Add skeleton loading states for API-backed pages.
- Add toast notifications for create/update actions instead of inline-only messages.
- Add a mobile bottom navigation pattern for frequently used modules.

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
PATCH /api/inventory/:sku/adjust
PUT /api/inventory/:sku
POST /api/invoices
PATCH /api/invoices/:id
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
