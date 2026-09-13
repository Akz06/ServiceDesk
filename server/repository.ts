import { initialServiceDeskState } from '../src/data/repairShop';
import type { Customer, InventoryPart, ServiceDeskState, UserRole, WorkItem, WorkItemDraft, WorkItemUpdate } from '../src/types';
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

export async function getServiceDeskState(): Promise<ServiceDeskState> {
  const [customersResult, workItemsResult, updatesResult, inventoryResult] = await Promise.all([
    query<CustomerRow>('SELECT id, name, phone, email FROM customers ORDER BY created_at DESC, id DESC'),
    query<WorkItemRow>('SELECT * FROM work_items ORDER BY id DESC'),
    query<UpdateRow>('SELECT id, work_item_id, actor, message, at FROM work_item_updates ORDER BY id ASC'),
    query<InventoryPartRow>('SELECT * FROM inventory_parts ORDER BY sku ASC'),
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
  };
}

export async function replaceAllData(state: ServiceDeskState) {
  await withTransaction(async (client) => {
    await client.query('TRUNCATE work_item_updates, work_items, customers, inventory_parts RESTART IDENTITY CASCADE');

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
  const state = await getServiceDeskState();
  const stamp = nowStamp();
  const existingCustomer = state.customers.find(
    (customer) => customer.phone === draft.customerPhone || customer.email.toLowerCase() === draft.customerEmail.toLowerCase(),
  );
  const customer: Customer = existingCustomer ?? {
    id: nextNumericId('CUST', state.customers.map((item) => item.id), 2000),
    name: draft.customerName.trim() || 'Walk-in Customer',
    phone: draft.customerPhone.trim() || 'Phone pending',
    email: draft.customerEmail.trim() || 'email-pending@example.com',
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
    deviceModel: draft.deviceModel.trim() || `${draft.deviceType} device`,
    serialNumber: draft.serialNumber.trim() || 'Not provided',
    issueSummary: draft.issueSummary.trim() || 'Issue details pending.',
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
    throw new Error(`Work item ${id} not found`);
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
      message,
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
  await query('UPDATE inventory_parts SET quantity = GREATEST(0, quantity + $2) WHERE sku = $1', [sku, delta]);
  return getServiceDeskState();
}

export async function upsertInventoryPart(part: InventoryPart): Promise<ServiceDeskState> {
  await query(
    `INSERT INTO inventory_parts (sku, name, compatible_with, quantity, reorder_level, unit_cost)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      compatible_with = EXCLUDED.compatible_with,
      quantity = EXCLUDED.quantity,
      reorder_level = EXCLUDED.reorder_level,
      unit_cost = EXCLUDED.unit_cost`,
    [part.sku, part.name, part.compatibleWith, part.quantity, part.reorderLevel, part.unitCost],
  );

  return getServiceDeskState();
}
