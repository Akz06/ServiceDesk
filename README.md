# ServiceDesk Repair ERP

A full-stack electronics repair ERP for laptop, desktop, mobile, tablet, console, accessory, and other electronics repair shops.

It includes a public homepage, PostgreSQL-backed login, profile-based modules, work-item lifecycle management, technician estimates, customer progress tracking, spare-parts inventory, admin user management, master data, invoices, and operational reporting.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL
- Auth: PostgreSQL users and sessions, `scrypt` password hashing, bearer session tokens
- Deployment: Railway single web service serving API and built frontend

## Modules

| Profile | Modules |
| --- | --- |
| Admin | Admin, Agent, Technician, Customer |
| Agent | Agent |
| Technician | Technician |
| Customer | Customer |

### Admin module

- User management
- Create users with profile assignment
- Activate/deactivate users
- Business dashboard
- Customer master list
- Technician master list
- Invoice creation
- Invoice status updates: Draft, Issued, Paid, Void
- Inventory management and demo data reset

### Agent module

- Create online or walk-in repair work items
- Capture customer/device details
- Assign/reassign technicians
- Search and cancel work items
- Manage spare-parts inventory

### Technician module

- View assigned repair jobs
- Add diagnosis and required changes
- Share estimate price
- Update promised time and repair status
- Consume spare parts from inventory

### Customer module

- View repair progress
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

## Security Notes

This is a full-stack ERP-style app. Before using for real customers:

- Replace or deactivate demo users.
- Use a strong Railway `AUTH_SECRET`.
- Add login rate limiting.
- Add password reset and email verification.
- Restrict CORS if frontend/backend are split.
- Add audit logs for user, invoice, and repair status changes.
- Add stronger request validation with a schema library such as Zod.
- Add database backups and monitoring.
