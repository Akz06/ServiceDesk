import { initialServiceDeskState } from '../src/data/repairShop';
import type {
  Customer,
  InventoryPart,
  Invoice,
  InvoiceDraft,
  InvoiceStatus,
  ServiceDeskState,
  UserRole,
  WorkItem,
  WorkItemDraft,
  WorkItemUpdate,
} from '../src/types';
import { query, withTransaction } from './db';

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string;
}

interface WorkItemRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  source: WorkItem['source'];
  device_type: WorkItem['deviceType'];
  device_model: string;
  serial_number: string;
  issue_summary: string;
  priority: WorkItem['priority'];
  status: WorkItem['status'];
  assigned_technician_id: string;
  analysis: string;
  required_changes: string;
  estimated_price: string;
  approved_by_customer: boolean;
  parts_required: string[];
  created_at: string;
  updated_at: string;
  promised_by: string;
}

interface UpdateRow {
  id: string;
  work_item_id: string;
  actor: WorkItemUpdate['actor'];
  message: string;
  at: string;
}

interface InventoryPartRow {
  sku: string;
  name: string;
  compatible_with: InventoryPart['compatibleWith'];
  quantity: number;
  reorder_level: number;
  unit_cost: string;
}

interface InvoiceRow {
  id: string;
  work_item_id: string;
  customer_id: string;
  customer_name: string;
  amount: string;
  status: InvoiceStatus;
  issued_at: string;
  paid_at: string;
  notes: string;
}

class RepositoryError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const nowStamp = () => new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const nextNumericId = (prefix: string, values: string[], fallback: number) => {
  const max = values.reduce((highest, value) => {
    const numeric = Number(value.replace(`${prefix}-`, ''));
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, fallback);

  return `${prefix}-${max + 1}`;
};

function mapWorkItem(row: WorkItemRow, updates: WorkItemUpdate[]): WorkItem {
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    source: row.source,
    deviceType: row.device_type,
    deviceModel: row.device_model,
    serialNumber: row.serial_number,
    issueSummary: row.issue_summary,
    priority: row.priority,
    status: row.status,
    assignedTechnicianId: row.assigned_technician_id,
    analysis: row.analysis,
    requiredChanges: row.required_changes,
    estimatedPrice: Number(row.estimated_price),
    approvedByCustomer: row.approved_by_customer,
    partsRequired: row.parts_required,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    promisedBy: row.promised_by,
    updates,
  };
}

function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    amount: Number(row.amount),
    status: row.status,
    issuedAt: row.issued_at,
    paidAt: row.paid_at,
    notes: row.notes,
  };
}

function validateWorkItemDraft(draft: WorkItemDraft) {
  if (!draft.customerName?.trim() || !draft.customerPhone?.trim() || !draft.customerEmail?.trim()) {
    throw new RepositoryError('Customer name, phone, and email are required.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.customerEmail.trim())) {
    throw new RepositoryError('A valid customer email is required.');
  }

  if (!draft.deviceModel?.trim() || !draft.issueSummary?.trim()) {
    throw new RepositoryError('Device model and issue summary are required.');
  }
}

export async function getServiceDeskState(): Promise<ServiceDeskState> {
  const [customersResult, workItemsResult, updatesResult, inventoryResult, invoicesResult] = await Promise.all([
    query<CustomerRow>('SELECT id, name, phone, email FROM customers ORDER BY created_at DESC, id DESC'),
    query<WorkItemRow>('SELECT * FROM work_items ORDER BY id DESC'),
    query<UpdateRow>('SELECT id, work_item_id, actor, message, at FROM work_item_updates ORDER BY id ASC'),
    query<InventoryPartRow>('SELECT * FROM inventory_parts ORDER BY sku ASC'),
    query<InvoiceRow>('SELECT * FROM invoices ORDER BY id DESC'),
  ]);

  const updatesByWorkItem = updatesResult.rows.reduce<Record<string, WorkItemUpdate[]>>((grouped, update) => {
    grouped[update.work_item_id] = grouped[update.work_item_id] ?? [];
    grouped[update.work_item_id].push({ id: update.id, actor: update.actor, message: update.message, at: update.at });
    return grouped;
  }, {});

  return {
    customers: customersResult.rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, email: row.email })),
    workItems: workItemsResult.rows.map((row) => mapWorkItem(row, updatesByWorkItem[row.id] ?? [])),
    inventoryParts: inventoryResult.rows.map((row) => ({
      sku: row.sku,
      name: row.name,
      compatibleWith: row.compatible_with,
      quantity: row.quantity,
      reorderLevel: row.reorder_level,
      unitCost: Number(row.unit_cost),
    })),
    invoices: invoicesResult.rows.map(mapInvoice),
  };
}

export async function replaceAllData(state: ServiceDeskState) {
  await withTransaction(async (client) => {
    await client.query('TRUNCATE invoices, work_item_updates, work_items, customers, inventory_parts RESTART IDENTITY CASCADE');

    for (const customer of state.customers) {
      await client.query('INSERT INTO customers (id, name, phone, email) VALUES ($1, $2, $3, $4)', [
        customer.id,
        customer.name,
        customer.phone,
        customer.email,
      ]);
    }

    for (const item of state.workItems) {
      await client.query(
        `INSERT INTO work_items (
          id, customer_id, customer_name, customer_phone, customer_email, source, device_type, device_model,
          serial_number, issue_summary, priority, status, assigned_technician_id, analysis, required_changes,
          estimated_price, approved_by_customer, parts_required, created_at, updated_at, promised_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        [
          item.id,
          item.customerId,
          item.customerName,
          item.customerPhone,
          item.customerEmail,
          item.source,
          item.deviceType,
          item.deviceModel,
          item.serialNumber,
          item.issueSummary,
          item.priority,
          item.status,
          item.assignedTechnicianId,
          item.analysis,
          item.requiredChanges,
          item.estimatedPrice,
          item.approvedByCustomer,
          item.partsRequired,
          item.createdAt,
          item.updatedAt,
          item.promisedBy,
        ],
      );

      for (const update of item.updates) {
        await client.query('INSERT INTO work_item_updates (id, work_item_id, actor, message, at) VALUES ($1, $2, $3, $4, $5)', [
          update.id,
          item.id,
          update.actor,
          update.message,
          update.at,
        ]);
      }
    }

    for (const part of state.inventoryParts) {
      await client.query(
        `INSERT INTO inventory_parts (sku, name, compatible_with, quantity, reorder_level, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [part.sku, part.name, part.compatibleWith, part.quantity, part.reorderLevel, part.unitCost],
      );
    }

    for (const invoice of state.invoices) {
      await client.query(
        `INSERT INTO invoices (id, work_item_id, customer_id, customer_name, amount, status, issued_at, paid_at, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [invoice.id, invoice.workItemId, invoice.customerId, invoice.customerName, invoice.amount, invoice.status, invoice.issuedAt, invoice.paidAt, invoice.notes],
      );
    }
  });

  return getServiceDeskState();
}

export async function seedInitialDataIfEmpty() {
  const result = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM customers');
  if (Number(result.rows[0]?.count ?? 0) === 0) {
    await replaceAllData(initialServiceDeskState);
  }
}

export async function createWorkItem(draft: WorkItemDraft): Promise<ServiceDeskState> {
  validateWorkItemDraft(draft);
  const state = await getServiceDeskState();
  const stamp = nowStamp();
  const customerEmail = draft.customerEmail.trim().toLowerCase();
  const existingCustomer = state.customers.find(
    (customer) => customer.phone === draft.customerPhone.trim() || customer.email.toLowerCase() === customerEmail,
  );
  const customer: Customer = existingCustomer ?? {
    id: nextNumericId('CUST', state.customers.map((item) => item.id), 2000),
    name: draft.customerName.trim(),
    phone: draft.customerPhone.trim(),
    email: customerEmail,
  };
  const workItemId = nextNumericId('WI', state.workItems.map((item) => item.id), 1023);
  const item: WorkItem = {
    id: workItemId,
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    source: draft.source,
    deviceType: draft.deviceType,
    deviceModel: draft.deviceModel.trim(),
    serialNumber: draft.serialNumber.trim() || 'Not provided',
    issueSummary: draft.issueSummary.trim(),
    priority: draft.priority,
    status: 'Assigned',
    assignedTechnicianId: draft.assignedTechnicianId,
    analysis: 'Technician analysis pending.',
    requiredChanges: 'Pending diagnosis.',
    estimatedPrice: 0,
    approvedByCustomer: false,
    partsRequired: [],
    createdAt: stamp,
    updatedAt: stamp,
    promisedBy: 'To be confirmed',
    updates: [
      { id: `${workItemId}-UP-1`, actor: 'Agent', message: `${draft.source} request created.`, at: stamp },
      { id: `${workItemId}-UP-2`, actor: 'System', message: 'Work item assigned to technician.', at: stamp },
    ],
  };

  await withTransaction(async (client) => {
    if (!existingCustomer) {
      await client.query('INSERT INTO customers (id, name, phone, email) VALUES ($1, $2, $3, $4)', [
        customer.id,
        customer.name,
        customer.phone,
        customer.email,
      ]);
    }

    await client.query(
      `INSERT INTO work_items (
        id, customer_id, customer_name, customer_phone, customer_email, source, device_type, device_model,
        serial_number, issue_summary, priority, status, assigned_technician_id, analysis, required_changes,
        estimated_price, approved_by_customer, parts_required, created_at, updated_at, promised_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        item.id,
        item.customerId,
        item.customerName,
        item.customerPhone,
        item.customerEmail,
        item.source,
        item.deviceType,
        item.deviceModel,
        item.serialNumber,
        item.issueSummary,
        item.priority,
        item.status,
        item.assignedTechnicianId,
        item.analysis,
        item.requiredChanges,
        item.estimatedPrice,
        item.approvedByCustomer,
        item.partsRequired,
        item.createdAt,
        item.updatedAt,
        item.promisedBy,
      ],
    );

    for (const update of item.updates) {
      await client.query('INSERT INTO work_item_updates (id, work_item_id, actor, message, at) VALUES ($1, $2, $3, $4, $5)', [
        update.id,
        item.id,
        update.actor,
        update.message,
        update.at,
      ]);
    }
  });

  return getServiceDeskState();
}

export async function updateWorkItem(
  id: string,
  patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>,
  actor: UserRole | 'System',
  message: string,
): Promise<ServiceDeskState> {
  const state = await getServiceDeskState();
  const item = state.workItems.find((workItem) => workItem.id === id);
  if (!item) {
    throw new RepositoryError(`Work item ${id} not found`, 404);
  }

  const next = { ...item, ...patch, updatedAt: nowStamp() };
  const updateId = `${id}-UP-${item.updates.length + 1}`;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE work_items SET
        customer_name = $2, customer_phone = $3, customer_email = $4, source = $5, device_type = $6,
        device_model = $7, serial_number = $8, issue_summary = $9, priority = $10, status = $11,
        assigned_technician_id = $12, analysis = $13, required_changes = $14, estimated_price = $15,
        approved_by_customer = $16, parts_required = $17, updated_at = $18, promised_by = $19
      WHERE id = $1`,
      [
        id,
        next.customerName,
        next.customerPhone,
        next.customerEmail,
        next.source,
        next.deviceType,
        next.deviceModel,
        next.serialNumber,
        next.issueSummary,
        next.priority,
        next.status,
        next.assignedTechnicianId,
        next.analysis,
        next.requiredChanges,
        next.estimatedPrice,
        next.approvedByCustomer,
        next.partsRequired,
        next.updatedAt,
        next.promisedBy,
      ],
    );
    await client.query('INSERT INTO work_item_updates (id, work_item_id, actor, message, at) VALUES ($1, $2, $3, $4, $5)', [
      updateId,
      id,
      actor,
      message.trim() || `Work item updated by ${actor}.`,
      next.updatedAt,
    ]);
  });

  return getServiceDeskState();
}

export async function approveEstimate(id: string): Promise<ServiceDeskState> {
  return updateWorkItem(id, { approvedByCustomer: true, status: 'Customer Approved' }, 'Customer', 'Customer approved the shared estimate.');
}

export async function cancelWorkItem(id: string, actor: UserRole): Promise<ServiceDeskState> {
  return updateWorkItem(id, { status: 'Cancelled' }, actor, 'Work item cancelled.');
}

export async function adjustInventory(sku: string, delta: number): Promise<ServiceDeskState> {
  if (!Number.isFinite(delta)) {
    throw new RepositoryError('Inventory adjustment must be a valid number.');
  }

  const result = await query('UPDATE inventory_parts SET quantity = GREATEST(0, quantity + $2) WHERE sku = $1', [sku.toUpperCase(), delta]);
  if (result.rowCount === 0) {
    throw new RepositoryError(`Inventory part ${sku} not found`, 404);
  }

  return getServiceDeskState();
}

export async function upsertInventoryPart(part: InventoryPart): Promise<ServiceDeskState> {
  if (!part.sku.trim() || !part.name.trim()) {
    throw new RepositoryError('Part SKU and name are required.');
  }

  await query(
    `INSERT INTO inventory_parts (sku, name, compatible_with, quantity, reorder_level, unit_cost)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      compatible_with = EXCLUDED.compatible_with,
      quantity = EXCLUDED.quantity,
      reorder_level = EXCLUDED.reorder_level,
      unit_cost = EXCLUDED.unit_cost`,
    [part.sku.toUpperCase(), part.name.trim(), part.compatibleWith, Math.max(0, part.quantity), Math.max(0, part.reorderLevel), Math.max(0, part.unitCost)],
  );

  return getServiceDeskState();
}

export async function createInvoice(draft: InvoiceDraft): Promise<ServiceDeskState> {
  const state = await getServiceDeskState();
  const item = state.workItems.find((workItem) => workItem.id === draft.workItemId);
  if (!item) {
    throw new RepositoryError('Work item is required to create an invoice.', 404);
  }

  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RepositoryError('Invoice amount must be greater than zero.');
  }

  const invoiceId = nextNumericId('INV', state.invoices.map((invoice) => invoice.id), 5000);
  await query(
    `INSERT INTO invoices (id, work_item_id, customer_id, customer_name, amount, status, issued_at, notes)
     VALUES ($1, $2, $3, $4, $5, 'Issued', $6, $7)`,
    [invoiceId, item.id, item.customerId, item.customerName, amount, nowStamp(), draft.notes.trim()],
  );

  return getServiceDeskState();
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<ServiceDeskState> {
  const paidAt = status === 'Paid' ? nowStamp() : '';
  const result = await query('UPDATE invoices SET status = $2, paid_at = $3 WHERE id = $1', [id, status, paidAt]);
  if (result.rowCount === 0) {
    throw new RepositoryError(`Invoice ${id} not found`, 404);
  }

  return getServiceDeskState();
}
