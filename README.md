# ServiceDesk Repair Shop

A full-stack repair shop service-desk application for laptop, desktop, mobile, tablet, console, accessory, and other electronics repair businesses.

The app supports Agent, Technician, and Customer workflows with PostgreSQL persistence for Railway deployment.

---

## 1. What You Need To Do From Your End

### Step 1: Push this project to GitHub

From your local machine:

```bash
cd /Users/akshay-5823/ServiceDesk
git status
git add .
git commit -m "Prepare ServiceDesk for Railway deployment"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

If the remote is already configured, use:

```bash
git remote -v
git push
```

---

### Step 2: Create a Railway project

1. Open Railway.
2. Create a new project.
3. Choose **Deploy from GitHub repo**.
4. Select your `ServiceDesk` repository.
5. Railway should detect the app using `railway.json`.

Railway will use:

```text
Build command: npm ci && npm run build
Start command: npm start
Health check: /api/health
```

---

### Step 3: Add PostgreSQL in Railway

In the same Railway project:

1. Click **New**.
2. Select **Database**.
3. Choose **PostgreSQL**.
4. Wait until the Postgres service is ready.

Railway will generate a `DATABASE_URL` automatically.

---

### Step 4: Attach Postgres variables to the app service

Your web app service must have access to the Postgres `DATABASE_URL`.

In Railway:

1. Open your app service.
2. Go to **Variables**.
3. Add or reference the Postgres `DATABASE_URL`.

Required variables:

```text
DATABASE_URL=<Railway Postgres DATABASE_URL>
NODE_ENV=production
PGSSLMODE=require
```

Optional variables:

```text
VITE_APP_NAME=ServiceDesk Repair Shop
VITE_SUPPORT_EMAIL=support@example.com
VITE_SUPPORT_PHONE=+1-555-0100
VITE_API_BASE_URL=
```

Important:

- Keep `VITE_API_BASE_URL` empty on Railway.
- When empty, the frontend calls the same deployed Railway service using relative `/api/*` routes.
- Do not commit `.env` to GitHub.

---

### Step 5: Deploy

After GitHub and Railway variables are configured:

1. Trigger a Railway deploy.
2. Wait for build to complete.
3. Wait for the app to pass health check.
4. Open the Railway generated public URL.

Health check endpoint:

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

---

### Step 6: Verify the app

Open:

```text
https://your-railway-domain.up.railway.app
```

Try these flows:

1. Go to home/login page.
2. Login as **Agent**.
3. Create a new work item.
4. Login as **Technician** in another browser tab.
5. Update diagnosis, estimate, promised time, and repair status.
6. Login as **Customer** in another browser tab.
7. Confirm the customer can see repair progress.
8. Approve the estimate from the customer view.
9. Continue technician status updates.
10. Check inventory stock changes.

---

## 2. App Overview

### Roles

The app has three role-based workspaces.

#### Agent View

Agents can:

- Capture online and walk-in repair requests.
- Create work items.
- Assign technicians.
- Reassign technicians.
- Cancel work items.
- Search and review work-item queue.

#### Technician View

Technicians can:

- View assigned work items.
- Add diagnosis/analysis.
- Add required changes.
- Set estimated repair price.
- Set promised delivery/pickup time.
- Update work-item status.
- Consume spare parts from inventory.

#### Customer View

Customers can:

- View repair progress.
- Track current status.
- See timeline updates.
- Approve repair estimate.

---

## 3. URL Structure

The app uses a unique session ID in the URL.

Login URL:

```text
/login/{sessionId}
```

Workspace URLs:

```text
/app/{sessionId}?role=agent
/app/{sessionId}?role=technician
/app/{sessionId}?role=customer
```

Example:

```text
/login/shop-2025-demo
/app/shop-2025-demo?role=agent
/app/shop-2025-demo?role=technician
/app/shop-2025-demo?role=customer
```

---

## 4. Work Item Lifecycle

A work item can move through this lifecycle:

```text
New Request
-> Assigned
-> Diagnosis
-> Estimate Shared
-> Customer Approved
-> In Repair
-> Waiting for Parts
-> Quality Check
-> Ready for Pickup
-> Delivered
```

`Cancelled` is also supported as a terminal status.

---

## 5. Technology Stack

### Frontend

- React
- TypeScript
- Vite
- Plain responsive CSS

### Backend

- Node.js
- Express
- TypeScript runtime via `tsx`

### Database

- PostgreSQL
- Railway Postgres
- SQL migrations
- `pg` Node.js driver

### Testing and Quality

- Vitest
- React Testing Library
- ESLint
- TypeScript checks
- GitHub Actions CI

---

## 6. Project Structure

```text
.github/
  workflows/
    ci.yml
server/
  migrations/
    001_init.sql
  db.ts
  index.ts
  migrate.ts
  repository.ts
src/
  components/
    ProgressTracker.tsx
  data/
    repairShop.ts
  domain/
    constants.ts
  hooks/
    useServiceDesk.ts
  services/
    apiClient.ts
    routing.ts
    serviceDeskStore.ts
  test/
    setup.ts
  App.tsx
  main.tsx
  styles.css
  types.ts
.env.example
railway.json
package.json
README.md
```

---

## 7. Local Development

### Frontend-only local mode

This mode uses browser `localStorage`. It does not require PostgreSQL.

```bash
cd /Users/akshay-5823/ServiceDesk
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

---

### Full-stack local mode with PostgreSQL

Use this when you want to test the same API/database behavior as Railway.

1. Create `.env`:

```bash
cp .env.example .env
```

2. Update `.env`:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/service_desk
PGSSLMODE=disable
PORT=3000
NODE_ENV=development
```

3. Run migrations and start:

```bash
npm install
npm run migrate
npm run build
npm start
```

4. Open:

```text
http://localhost:3000
```

---

## 8. Environment Variables

### Required for Railway

```text
DATABASE_URL=<Railway Postgres DATABASE_URL>
NODE_ENV=production
PGSSLMODE=require
```

### Optional

```text
PORT=3000
VITE_APP_NAME=ServiceDesk Repair Shop
VITE_SUPPORT_EMAIL=support@example.com
VITE_SUPPORT_PHONE=+1-555-0100
VITE_API_BASE_URL=
```

### Notes

- Railway normally provides `PORT` automatically.
- Railway Postgres provides `DATABASE_URL`.
- `PGSSLMODE=require` is recommended for Railway Postgres.
- Do not expose database credentials in frontend code.
- Do not commit `.env`.

---

## 9. API Documentation

Base URL in production:

```text
https://your-railway-domain.up.railway.app/api
```

Base URL locally with `npm start`:

```text
http://localhost:3000/api
```

### Health Check

```http
GET /api/health
```

Response:

```json
{
  "ok": true,
  "service": "service-desk",
  "storage": "postgres"
}
```

---

### Get Full App State

```http
GET /api/state
```

Returns customers, work items, technicians, inventory, and service catalog data.

---

### Create Work Item

```http
POST /api/work-items
Content-Type: application/json
```

Example body:

```json
{
  "customerName": "John Doe",
  "customerPhone": "+1-555-0101",
  "customerEmail": "john@example.com",
  "source": "Walk-in",
  "deviceType": "Laptop",
  "deviceModel": "Dell XPS 13",
  "serialNumber": "DXPS12345",
  "issueSummary": "Battery drains quickly",
  "priority": "Medium",
  "assignedTechnicianId": "tech-1"
}
```

---

### Update Work Item

```http
PATCH /api/work-items/:id
Content-Type: application/json
```

Example body:

```json
{
  "patch": {
    "status": "Diagnosis",
    "analysis": "Battery health below threshold",
    "estimatedPrice": 120
  },
  "actor": "Technician",
  "message": "Diagnosis completed and estimate shared"
}
```

---

### Approve Estimate

```http
POST /api/work-items/:id/approval
```

Used by the Customer view.

---

### Cancel Work Item

```http
POST /api/work-items/:id/cancel
Content-Type: application/json
```

Example body:

```json
{
  "actor": "Agent"
}
```

---

### Adjust Inventory Quantity

```http
PATCH /api/inventory/:sku/adjust
Content-Type: application/json
```

Example body:

```json
{
  "delta": -1
}
```

---

### Add or Update Inventory Part

```http
PUT /api/inventory/:sku
Content-Type: application/json
```

Example body:

```json
{
  "sku": "BAT-XPS-13",
  "name": "Dell XPS 13 Battery",
  "compatibleWith": ["Laptop"],
  "quantity": 10,
  "reorderLevel": 3,
  "unitCost": 55
}
```

---

### Reset Demo Data

```http
POST /api/reset
```

Use carefully. This resets the database to demo data.

---

## 10. Database

The initial database schema is located at:

```text
server/migrations/001_init.sql
```

Main tables:

- `customers`
- `work_items`
- `work_item_updates`
- `inventory_parts`
- `schema_migrations`

Migrations run automatically when the server starts.

You can also run them manually:

```bash
npm run migrate
```

---

## 11. Quality Checks

Before pushing or deploying, run:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Or all manually in sequence:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

---

## 12. CI/CD

GitHub Actions workflow is included at:

```text
.github/workflows/ci.yml
```

It validates:

- Dependency install
- TypeScript typecheck
- ESLint
- Tests
- Production build

Railway deploys from GitHub after CI/build depending on your Railway settings.

---

## 13. Troubleshooting Railway

### Build fails

Check Railway build logs.

Try locally:

```bash
npm ci
npm run build
```

---

### App starts but health check fails

Verify:

```text
/api/health
```

Also check that Railway has:

```text
DATABASE_URL
NODE_ENV=production
PGSSLMODE=require
```

---

### Database connection fails

Confirm that:

1. PostgreSQL service exists in the same Railway project.
2. App service has the Postgres variables attached.
3. `DATABASE_URL` is visible in the app service variables.
4. `PGSSLMODE=require` is set.

---

### Frontend loads but API calls fail

On Railway, keep this empty:

```text
VITE_API_BASE_URL=
```

The app should call relative endpoints like:

```text
/api/state
/api/work-items
```

---

### Blank page after deploy

Check browser console and Railway logs.

Also verify that the build completed and the server is serving the Vite `dist` folder.

Expected start command:

```bash
npm start
```

---

## 14. Security Notes

Current app is suitable for POC/demo deployment.

Before using in production, add:

- Real authentication and authorization.
- Passwordless login, OAuth, or username/password authentication.
- Role-based access control on backend endpoints.
- Input validation with a schema library such as Zod.
- Audit logging.
- Rate limiting.
- CSRF/CORS hardening.
- Secure customer-specific access links.
- Server-side customer identity verification.

---

## 15. Future Improvements

Recommended next steps:

1. Add real user authentication.
2. Add customer-specific tracking links.
3. Add email/SMS notifications.
4. Add WebSockets or Server-Sent Events for true realtime updates.
5. Add invoices and payment status.
6. Add technician workload dashboard.
7. Add barcode/QR support for work-item tracking.
8. Add role-level permissions in the backend.
9. Add production-grade API validation and error responses.
10. Add database backups and retention policy in Railway.
