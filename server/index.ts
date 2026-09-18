import cors from 'cors';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AuthUser,
  InventoryPart,
  InvoiceDraft,
  InvoiceStatus,
  ModuleId,
  PaymentMethod,
  SavedReportDraft,
  UserDraft,
  UserRole,
  WorkItem,
  WorkItemDraft,
} from '../src/types';
import { canAccessModule, createUser, getUserForToken, listUsers, loginWithPassword, logoutToken, seedAuthUsersIfEmpty, updateUser } from './auth';
import { runMigrations } from './migrate';
import {
  adjustInventory,
  approveEstimate,
  cancelWorkItem,
  createInvoice,
  createSavedReport,
  createWorkItem,
  deleteSavedReport,
  getServiceDeskState,
  markNotificationsRead,
  notifyCustomerNow,
  recordInvoicePayment,
  replaceAllData,
  seedInitialDataIfEmpty,
  updateInvoiceStatus,
  updateWorkItem,
  upsertInventoryPart,
} from './repository';

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const toCsv = (headers: string[], rows: Array<Array<string | number>>) =>
  [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3000);
const distPath = join(__dirname, '..', 'dist');

interface AuthenticatedRequest extends express.Request {
  user?: AuthUser;
  authToken?: string;
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const asyncHandler = (handler: express.RequestHandler): express.RequestHandler => async (request, response, next) => {
  try {
    await handler(request, response, next);
  } catch (error) {
    next(error);
  }
};

const getBearerToken = (request: express.Request) => {
  const header = request.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
};

const requireAuth: express.RequestHandler = asyncHandler(async (request: AuthenticatedRequest, response, next) => {
  const token = getBearerToken(request);
  const user = await getUserForToken(token);

  if (!user) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }

  request.user = user;
  request.authToken = token;
  next();
});

const requireModule = (moduleId: ModuleId): express.RequestHandler => (request: AuthenticatedRequest, response, next) => {
  if (!request.user || !canAccessModule(request.user, moduleId)) {
    response.status(403).json({ error: `Access denied for ${moduleId} module.` });
    return;
  }

  next();
};

const requireAnyModule = (...modules: ModuleId[]): express.RequestHandler => (request: AuthenticatedRequest, response, next) => {
  if (!request.user || !modules.some((moduleId) => canAccessModule(request.user as AuthUser, moduleId))) {
    response.status(403).json({ error: 'Access denied.' });
    return;
  }

  next();
};

const requireAdmin: express.RequestHandler = (request: AuthenticatedRequest, response, next) => {
  if (request.user?.profile !== 'admin') {
    response.status(403).json({ error: 'Admin access required.' });
    return;
  }

  next();
};

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'service-desk', storage: 'postgres' });
});

app.post('/api/auth/login', asyncHandler(async (request, response) => {
  const body = request.body as { email?: string; password?: string };
  response.json(await loginWithPassword(String(body.email ?? ''), String(body.password ?? '')));
}));

app.get('/api/auth/me', requireAuth, (request: AuthenticatedRequest, response) => {
  response.json({ user: request.user });
});

app.post('/api/auth/logout', requireAuth, asyncHandler(async (request: AuthenticatedRequest, response) => {
  await logoutToken(String(request.authToken ?? ''));
  response.json({ ok: true });
}));

app.get('/api/admin/users', requireAuth, requireAdmin, asyncHandler(async (_request, response) => {
  response.json({ users: await listUsers() });
}));

app.post('/api/admin/users', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  response.status(201).json({ users: await createUser(request.body as UserDraft) });
}));

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, asyncHandler(async (request: AuthenticatedRequest, response) => {
  response.json({ users: await updateUser(String(request.params.id), request.body as UserDraft, String(request.user?.id ?? '')) });
}));

app.get('/api/state', requireAuth, asyncHandler(async (_request, response) => {
  response.json(await getServiceDeskState());
}));

app.post('/api/work-items', requireAuth, requireModule('agent'), asyncHandler(async (request, response) => {
  response.status(201).json(await createWorkItem(request.body as WorkItemDraft));
}));

app.patch('/api/work-items/:id', requireAuth, requireAnyModule('agent', 'technician'), asyncHandler(async (request, response) => {
  const body = request.body as {
    patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>;
    actor: UserRole | 'System';
    message: string;
  };
  response.json(await updateWorkItem(String(request.params.id), body.patch, body.actor, body.message));
}));

app.post('/api/work-items/:id/approval', requireAuth, requireModule('customer'), asyncHandler(async (request, response) => {
  response.json(await approveEstimate(String(request.params.id)));
}));

app.post('/api/work-items/:id/cancel', requireAuth, requireModule('agent'), asyncHandler(async (request, response) => {
  const body = request.body as { actor: UserRole };
  response.json(await cancelWorkItem(String(request.params.id), body.actor));
}));

app.patch('/api/inventory/:sku/adjust', requireAuth, requireAnyModule('admin', 'agent', 'technician'), asyncHandler(async (request, response) => {
  const body = request.body as { delta: number };
  response.json(await adjustInventory(String(request.params.sku), Number(body.delta)));
}));

app.put('/api/inventory/:sku', requireAuth, requireAnyModule('admin', 'agent'), asyncHandler(async (request, response) => {
  const part = request.body as InventoryPart;
  response.json(await upsertInventoryPart({ ...part, sku: String(request.params.sku).toUpperCase() }));
}));

app.post('/api/invoices', requireAuth, requireAnyModule('admin', 'agent'), asyncHandler(async (request, response) => {
  response.status(201).json(await createInvoice(request.body as InvoiceDraft));
}));

app.patch('/api/invoices/:id', requireAuth, requireAnyModule('admin', 'agent'), asyncHandler(async (request, response) => {
  const body = request.body as { status: InvoiceStatus };
  response.json(await updateInvoiceStatus(String(request.params.id), body.status));
}));

app.post('/api/invoices/:id/payment', requireAuth, requireAnyModule('admin', 'agent'), asyncHandler(async (request, response) => {
  const body = request.body as { method: PaymentMethod; reference: string };
  response.json(await recordInvoicePayment(String(request.params.id), body.method, String(body.reference ?? '')));
}));

app.post('/api/work-items/:id/notify', requireAuth, requireAnyModule('admin', 'agent'), asyncHandler(async (request, response) => {
  response.json(await notifyCustomerNow(String(request.params.id)));
}));

app.post('/api/notifications/read', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const { ids } = request.body as { ids?: string[] };
  response.json(await markNotificationsRead(ids));
}));

app.post('/api/reports', requireAuth, requireAdmin, asyncHandler(async (request: AuthenticatedRequest, response) => {
  response.status(201).json(await createSavedReport(request.body as SavedReportDraft, String(request.user?.id ?? '')));
}));

app.delete('/api/reports/:id', requireAuth, requireAdmin, asyncHandler(async (request: AuthenticatedRequest, response) => {
  response.json(await deleteSavedReport(String(request.params.id), String(request.user?.id ?? '')));
}));

app.get('/api/export/invoices.csv', requireAuth, requireAdmin, asyncHandler(async (_request, response) => {
  const state = await getServiceDeskState();
  const csv = toCsv(
    ['Invoice ID', 'Work Item', 'Customer', 'Labor', 'Parts', 'Diagnostic Fee', 'Total', 'Status', 'Issued At', 'Paid At', 'Payment Method', 'Payment Reference'],
    state.invoices.map((invoice) => [
      invoice.id,
      invoice.workItemId,
      invoice.customerName,
      invoice.laborAmount,
      invoice.partsAmount,
      invoice.diagnosticFee,
      invoice.amount,
      invoice.status,
      invoice.issuedAt,
      invoice.paidAt,
      invoice.paymentMethod,
      invoice.paymentReference,
    ]),
  );
  response.setHeader('Content-Type', 'text/csv');
  response.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  response.send(csv);
}));

app.get('/api/export/customers.csv', requireAuth, requireAdmin, asyncHandler(async (_request, response) => {
  const state = await getServiceDeskState();
  const csv = toCsv(
    ['Customer ID', 'Name', 'Phone', 'Email', 'Repairs'],
    state.customers.map((customer) => [
      customer.id,
      customer.name,
      customer.phone,
      customer.email,
      state.workItems.filter((item) => item.customerId === customer.id).length,
    ]),
  );
  response.setHeader('Content-Type', 'text/csv');
  response.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  response.send(csv);
}));

app.post('/api/reset', requireAuth, requireAdmin, asyncHandler(async (_request, response) => {
  const { initialServiceDeskState } = await import('../src/data/repairShop');
  response.json(await replaceAllData(initialServiceDeskState));
}));

app.use(express.static(distPath));
app.get(/.*/, (_request, response) => {
  response.sendFile(join(distPath, 'index.html'));
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  void _next;
  const statusCode = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (statusCode >= 500) {
    console.error(error);
  }
  response.status(statusCode).json({ error: error instanceof Error ? error.message : 'Unexpected server error' });
});

runMigrations()
  .then(seedInitialDataIfEmpty)
  .then(seedAuthUsersIfEmpty)
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`ServiceDesk listening on port ${port}`);
    });
  })
  .catch((error: unknown) => {
    console.error('Failed to start ServiceDesk', error);
    process.exit(1);
  });
