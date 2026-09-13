import cors from 'cors';
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InventoryPart, UserRole, WorkItem, WorkItemDraft } from '../src/types';
import { runMigrations } from './migrate';
import {
  adjustInventory,
  approveEstimate,
  cancelWorkItem,
  createWorkItem,
  getServiceDeskState,
  replaceAllData,
  seedInitialDataIfEmpty,
  updateWorkItem,
  upsertInventoryPart,
} from './repository';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 3000);
const distPath = join(__dirname, '..', 'dist');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const asyncHandler = (handler: express.RequestHandler): express.RequestHandler => async (request, response, next) => {
  try {
    await handler(request, response, next);
  } catch (error) {
    next(error);
  }
};

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'service-desk', storage: 'postgres' });
});

app.get('/api/state', asyncHandler(async (_request, response) => {
  response.json(await getServiceDeskState());
}));

app.post('/api/work-items', asyncHandler(async (request, response) => {
  response.status(201).json(await createWorkItem(request.body as WorkItemDraft));
}));

app.patch('/api/work-items/:id', asyncHandler(async (request, response) => {
  const body = request.body as {
    patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>;
    actor: UserRole | 'System';
    message: string;
  };
  response.json(await updateWorkItem(String(request.params.id), body.patch, body.actor, body.message));
}));

app.post('/api/work-items/:id/approval', asyncHandler(async (request, response) => {
  response.json(await approveEstimate(String(request.params.id)));
}));

app.post('/api/work-items/:id/cancel', asyncHandler(async (request, response) => {
  const body = request.body as { actor: UserRole };
  response.json(await cancelWorkItem(String(request.params.id), body.actor));
}));

app.patch('/api/inventory/:sku/adjust', asyncHandler(async (request, response) => {
  const body = request.body as { delta: number };
  response.json(await adjustInventory(String(request.params.sku), body.delta));
}));

app.put('/api/inventory/:sku', asyncHandler(async (request, response) => {
  const part = request.body as InventoryPart;
  response.json(await upsertInventoryPart({ ...part, sku: String(request.params.sku).toUpperCase() }));
}));

app.post('/api/reset', asyncHandler(async (_request, response) => {
  const { initialServiceDeskState } = await import('../src/data/repairShop');
  response.json(await replaceAllData(initialServiceDeskState));
}));

app.use(express.static(distPath));
app.get(/.*/, (_request, response) => {
  response.sendFile(join(distPath, 'index.html'));
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  void _next;
  console.error(error);
  console.error(error);
  response.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected server error' });
});

runMigrations()
  .then(seedInitialDataIfEmpty)
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`ServiceDesk listening on port ${port}`);
    });
  })
  .catch((error: unknown) => {
    console.error('Failed to start ServiceDesk', error);
    process.exit(1);
  });
