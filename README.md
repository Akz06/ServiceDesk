# ServiceDesk Repair Shop

A full-stack laptop, desktop, mobile, and electronics repair service desk. It includes a public homepage, PostgreSQL-backed login, role/profile-based modules, work-item lifecycle management, technician estimates, customer progress tracking, and inventory.

## Demo Login Users

These users are seeded automatically into PostgreSQL on first deploy/start:

| Profile | Email | Password | Modules |
| --- | --- | --- | --- |
| Admin | `admin@servicedesk.local` | `Admin@12345` | Agent, Technician, Customer |
| Agent | `agent@servicedesk.local` | `Agent@12345` | Agent |
| Technician | `tech@servicedesk.local` | `Tech@12345` | Technician |
| Customer | `customer@servicedesk.local` | `Customer@12345` | Customer |

Change these credentials before production use.

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

This mode uses local demo auth and `localStorage` for repair data. Railway/production uses PostgreSQL.

## Features

- Public marketing homepage explaining the application.
- PostgreSQL users and sessions.
- Password hashing with Node `scrypt` and random salts.
- Bearer-token auth backed by PostgreSQL sessions.
- Profile/module authorization:
  - Admin: all modules.
  - Agent: Agent module only.
  - Technician: Technician module only.
  - Customer: Customer module only.
- Agent module:
  - Create online/walk-in work items.
  - Assign/reassign technicians.
  - Search and cancel work items.
- Technician module:
  - Add analysis.
  - Add required changes.
  - Share estimates.
  - Update status.
  - Consume inventory parts.
- Customer module:
  - See realtime-style progress.
  - Review timeline updates.
  - Approve estimates.
- Inventory:
  - Add/update spare parts.
  - Adjust stock.
  - Low-stock alerts.

## API Summary

Auth:

```http
POST /api/auth/login
GET /api/auth/me
POST /api/auth/logout
```

Authenticated service desk APIs:

```http
GET /api/state
POST /api/work-items
PATCH /api/work-items/:id
POST /api/work-items/:id/approval
POST /api/work-items/:id/cancel
PATCH /api/inventory/:sku/adjust
PUT /api/inventory/:sku
POST /api/reset
```

All service desk APIs require:

```http
Authorization: Bearer <session-token>
```

## Validation

Run before pushing:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

## Security Notes

This is now a full-stack POC with real PostgreSQL-backed authentication. Before using for real customers:

- Replace demo users/passwords.
- Add user-management screens.
- Add email verification or password reset.
- Add rate limiting for `/api/auth/login`.
- Use a strong Railway `AUTH_SECRET`.
- Restrict CORS to known domains if you separate frontend/backend.
- Add audit logs for sensitive actions.
- Add stricter request validation with a schema library such as Zod.
