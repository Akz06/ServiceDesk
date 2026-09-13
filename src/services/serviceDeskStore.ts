import { initialServiceDeskState } from '../data/repairShop';
import { statusFlow, terminalStatuses } from '../domain/constants';
import type { Customer, InventoryPart, InvoiceDraft, InvoiceStatus, ServiceDeskState, UserRole, WorkItem, WorkItemDraft, WorkItemStatus } from '../types';

export const STORAGE_KEY = 'service-desk-state-v1';

const nowStamp = () => new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const cloneState = (state: ServiceDeskState): ServiceDeskState => ({
  customers: state.customers.map((customer) => ({ ...customer })),
  workItems: state.workItems.map((item) => ({ ...item, partsRequired: [...item.partsRequired], updates: item.updates.map((update) => ({ ...update })) })),
  inventoryParts: state.inventoryParts.map((part) => ({ ...part, compatibleWith: [...part.compatibleWith] })),
  invoices: state.invoices.map((invoice) => ({ ...invoice })),
});

const nextNumericId = (prefix: string, values: string[], fallback: number) => {
  const max = values.reduce((highest, value) => {
    const numeric = Number(value.replace(`${prefix}-`, ''));
    return Number.isFinite(numeric) ? Math.max(highest, numeric) : highest;
  }, fallback);

  return `${prefix}-${max + 1}`;
};

export const getInitialServiceDeskState = () => cloneState(initialServiceDeskState);

export const loadServiceDeskState = (): ServiceDeskState => {
  if (typeof localStorage === 'undefined') {
    return getInitialServiceDeskState();
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return getInitialServiceDeskState();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<ServiceDeskState>;
    return { ...getInitialServiceDeskState(), ...parsed, invoices: parsed.invoices ?? [] };
  } catch {
    return getInitialServiceDeskState();
  }
};

export const saveServiceDeskState = (state: ServiceDeskState) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
};

export const resetServiceDeskState = () => {
  const initial = getInitialServiceDeskState();
  saveServiceDeskState(initial);
  return initial;
};

export const createWorkItemRecord = (state: ServiceDeskState, draft: WorkItemDraft): ServiceDeskState => {
  const stamp = nowStamp();
  const existingCustomer = state.customers.find(
    (customer) => customer.phone === draft.customerPhone || customer.email.toLowerCase() === draft.customerEmail.toLowerCase(),
  );
  const customer: Customer = existingCustomer ?? {
    id: nextNumericId('CUST', state.customers.map((item) => item.id), 2000),
    name: draft.customerName.trim() || 'Walk-in Customer',
    phone: draft.customerPhone.trim() || 'Phone pending',
    email: draft.customerEmail.trim().toLowerCase() || 'email-pending@example.com',
  };
  const workItemId = nextNumericId('WI', state.workItems.map((item) => item.id), 1023);
  const workItem: WorkItem = {
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

  return {
    ...state,
    customers: existingCustomer ? state.customers : [customer, ...state.customers],
    workItems: [workItem, ...state.workItems],
  };
};

export const updateWorkItemRecord = (
  state: ServiceDeskState,
  id: string,
  patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>,
  actor: UserRole | 'System',
  message: string,
): ServiceDeskState => {
  const stamp = nowStamp();

  return {
    ...state,
    workItems: state.workItems.map((item) => {
      if (item.id !== id) {
        return item;
      }

      return {
        ...item,
        ...patch,
        updatedAt: stamp,
        updates: [
          ...item.updates,
          { id: `${id}-UP-${item.updates.length + 1}`, actor, message, at: stamp },
        ],
      };
    }),
  };
};

export const approveEstimateRecord = (state: ServiceDeskState, id: string): ServiceDeskState =>
  updateWorkItemRecord(
    state,
    id,
    { approvedByCustomer: true, status: 'Customer Approved' },
    'Customer',
    'Customer approved the shared estimate.',
  );

export const cancelWorkItemRecord = (state: ServiceDeskState, id: string, actor: UserRole): ServiceDeskState =>
  updateWorkItemRecord(state, id, { status: 'Cancelled' }, actor, 'Work item cancelled.');

export const adjustInventoryRecord = (state: ServiceDeskState, sku: string, delta: number): ServiceDeskState => ({
  ...state,
  inventoryParts: state.inventoryParts.map((part) =>
    part.sku === sku ? { ...part, quantity: Math.max(0, part.quantity + delta) } : part,
  ),
});

export const addInventoryPartRecord = (state: ServiceDeskState, part: InventoryPart): ServiceDeskState => ({
  ...state,
  inventoryParts: [part, ...state.inventoryParts.filter((item) => item.sku !== part.sku)],
});

export const createInvoiceRecord = (state: ServiceDeskState, draft: InvoiceDraft): ServiceDeskState => {
  const item = state.workItems.find((workItem) => workItem.id === draft.workItemId);
  if (!item) {
    return state;
  }

  return {
    ...state,
    invoices: [
      {
        id: nextNumericId('INV', state.invoices.map((invoice) => invoice.id), 5000),
        workItemId: item.id,
        customerId: item.customerId,
        customerName: item.customerName,
        amount: Number(draft.amount) || item.estimatedPrice,
        status: 'Issued',
        issuedAt: nowStamp(),
        paidAt: '',
        notes: draft.notes,
      },
      ...state.invoices,
    ],
  };
};

export const updateInvoiceStatusRecord = (state: ServiceDeskState, id: string, status: InvoiceStatus): ServiceDeskState => ({
  ...state,
  invoices: state.invoices.map((invoice) => (invoice.id === id ? { ...invoice, status, paidAt: status === 'Paid' ? nowStamp() : '' } : invoice)),
});

export const getNextStatuses = (status: WorkItemStatus): WorkItemStatus[] => {
  if (terminalStatuses.includes(status)) {
    return [];
  }

  const currentIndex = statusFlow.indexOf(status);
  if (currentIndex === -1) {
    return statusFlow;
  }

  return statusFlow.slice(currentIndex);
};

export const getMetrics = (state: ServiceDeskState) => {
  const activeWorkItems = state.workItems.filter((item) => !terminalStatuses.includes(item.status));
  const lowStockParts = state.inventoryParts.filter((part) => part.quantity <= part.reorderLevel);
  const estimatedRevenue = state.workItems.reduce((sum, item) => sum + item.estimatedPrice, 0);
  const invoicedRevenue = state.invoices.filter((invoice) => invoice.status !== 'Void').reduce((sum, invoice) => sum + invoice.amount, 0);
  const paidRevenue = state.invoices.filter((invoice) => invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0);
  const awaitingApproval = state.workItems.filter((item) => item.status === 'Estimate Shared' && !item.approvedByCustomer).length;

  return {
    activeWorkItems: activeWorkItems.length,
    lowStockParts: lowStockParts.length,
    estimatedRevenue,
    invoicedRevenue,
    paidRevenue,
    awaitingApproval,
  };
};
