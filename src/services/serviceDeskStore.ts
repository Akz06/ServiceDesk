import { initialServiceDeskState } from '../data/repairShop';
import { statusFlow, terminalStatuses } from '../domain/constants';
import type {
  Customer,
  InventoryPart,
  InvoiceDraft,
  InvoicePaymentDraft,
  InvoiceStatus,
  Notification,
  SavedReportDraft,
  ServiceDeskState,
  TechnicianDraft,
  UserRole,
  WorkItem,
  WorkItemDraft,
  WorkItemStatus,
} from '../types';

export const STORAGE_KEY = 'service-desk-state-v1';

const nowStamp = () => new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const cloneState = (state: ServiceDeskState): ServiceDeskState => ({
  customers: state.customers.map((customer) => ({ ...customer })),
  technicians: (state.technicians ?? []).map((technician) => ({ ...technician, specialties: [...technician.specialties] })),
  workItems: state.workItems.map((item) => ({ ...item, partsRequired: [...item.partsRequired], updates: item.updates.map((update) => ({ ...update })) })),
  inventoryParts: state.inventoryParts.map((part) => ({ ...part, compatibleWith: [...part.compatibleWith] })),
  invoices: state.invoices.map((invoice) => ({ ...invoice })),
  notifications: (state.notifications ?? []).map((notification) => ({ ...notification })),
  savedReports: (state.savedReports ?? []).map((report) => ({ ...report, columns: [...report.columns] })),
});

let notificationSequence = 0;

const mockNotification = (state: ServiceDeskState, input: Omit<Notification, 'id' | 'status' | 'provider' | 'createdAt' | 'read'>): Notification => {
  notificationSequence += 1;
  return {
    ...input,
    id: `NOTE-LOCAL-${notificationSequence}`,
    status: 'sent',
    provider: 'mock',
    createdAt: nowStamp(),
    read: false,
  };
};

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
    return {
      ...getInitialServiceDeskState(),
      ...parsed,
      technicians: parsed.technicians ?? getInitialServiceDeskState().technicians,
      invoices: parsed.invoices ?? [],
      notifications: (parsed.notifications ?? []).map((notification) => ({ ...notification, read: notification.read ?? false })),
      savedReports: parsed.savedReports ?? [],
    };
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

export const createWorkItemRecord = (state: ServiceDeskState, draft: WorkItemDraft, actor: string): ServiceDeskState => {
  const stamp = nowStamp();
  const existingCustomer = state.customers.find(
    (customer) => customer.phone === draft.customerPhone || customer.email.toLowerCase() === draft.customerEmail.toLowerCase(),
  );
  const customer: Customer = existingCustomer ?? {
    id: nextNumericId('CUST', state.customers.map((item) => item.id), 2000),
    name: draft.customerName.trim() || 'Walk-in Customer',
    phone: draft.customerPhone.trim() || 'Phone pending',
    email: draft.customerEmail.trim().toLowerCase() || 'email-pending@example.com',
    createdAt: stamp,
    createdBy: actor,
    updatedAt: stamp,
    updatedBy: actor,
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
    analysis: '',
    requiredChanges: 'Pending diagnosis.',
    estimatedPrice: 0,
    laborEstimate: 0,
    partsEstimate: 0,
    diagnosticFee: 0,
    approvedByCustomer: false,
    partsRequired: [],
    createdAt: stamp,
    createdBy: actor,
    updatedAt: stamp,
    updatedBy: actor,
    promisedBy: 'To be confirmed',
    updates: [
      { id: `${workItemId}-UP-1`, actor: 'Agent', message: `${draft.source} request created.`, at: stamp },
      { id: `${workItemId}-UP-2`, actor: 'System', message: 'Work item assigned to technician.', at: stamp },
    ],
  };

  const notification = mockNotification(state, {
    workItemId: workItem.id,
    customerId: customer.id,
    channel: 'sms',
    recipient: customer.phone,
    message: `We received your ${workItem.deviceModel} repair request (${workItem.id}). We'll text you as the status changes.`,
  });

  return {
    ...state,
    customers: existingCustomer ? state.customers : [customer, ...state.customers],
    workItems: [workItem, ...state.workItems],
    notifications: [notification, ...state.notifications],
  };
};

const closingStatuses: WorkItemStatus[] = ['Ready for Pickup', 'Delivered'];

export const updateWorkItemRecord = (
  state: ServiceDeskState,
  id: string,
  patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>,
  actor: UserRole | 'System',
  message: string,
): ServiceDeskState => {
  const stamp = nowStamp();
  const current = state.workItems.find((item) => item.id === id);
  if (!current) {
    return state;
  }

  const next = { ...current, ...patch };
  if (closingStatuses.includes(next.status) && !next.analysis.trim()) {
    return state;
  }

  const statusChanged = next.status !== current.status;
  const notification = statusChanged
    ? mockNotification(state, {
        workItemId: id,
        customerId: next.customerId,
        channel: 'sms',
        recipient: next.customerPhone,
        message: `Update on your ${next.deviceModel} repair (${id}): status is now "${next.status}".`,
      })
    : null;

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
        updatedBy: actor,
        updates: [
          ...item.updates,
          { id: `${id}-UP-${item.updates.length + 1}`, actor, message, at: stamp },
        ],
      };
    }),
    notifications: notification ? [notification, ...state.notifications] : state.notifications,
  };
};

export const deleteWorkItemRecord = (state: ServiceDeskState, id: string): ServiceDeskState => ({
  ...state,
  workItems: state.workItems.filter((item) => item.id !== id),
  invoices: state.invoices.filter((invoice) => invoice.workItemId !== id),
});

export const notifyCustomerNowRecord = (state: ServiceDeskState, workItemId: string): ServiceDeskState => {
  const item = state.workItems.find((candidate) => candidate.id === workItemId);
  if (!item) {
    return state;
  }

  const notification = mockNotification(state, {
    workItemId: item.id,
    customerId: item.customerId,
    channel: 'sms',
    recipient: item.customerPhone,
    message: `Update on your ${item.deviceModel} repair (${item.id}): status is "${item.status}".`,
  });

  return { ...state, notifications: [notification, ...state.notifications] };
};

export const markNotificationsReadRecord = (state: ServiceDeskState, ids?: string[]): ServiceDeskState => ({
  ...state,
  notifications: state.notifications.map((notification) =>
    !ids || ids.includes(notification.id) ? { ...notification, read: true } : notification,
  ),
});

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

export const addInventoryPartRecord = (state: ServiceDeskState, part: InventoryPart, actor: string): ServiceDeskState => {
  const stamp = nowStamp();
  const existing = state.inventoryParts.find((item) => item.sku === part.sku);
  const stamped: InventoryPart = {
    ...part,
    createdAt: existing?.createdAt ?? stamp,
    createdBy: existing?.createdBy ?? actor,
    updatedAt: stamp,
    updatedBy: actor,
  };
  return {
    ...state,
    inventoryParts: [stamped, ...state.inventoryParts.filter((item) => item.sku !== part.sku)],
  };
};

export const deleteInventoryPartRecord = (state: ServiceDeskState, sku: string): ServiceDeskState => {
  if (state.workItems.some((item) => item.partsRequired.includes(sku))) {
    return state;
  }
  return { ...state, inventoryParts: state.inventoryParts.filter((part) => part.sku !== sku) };
};

export const updateCustomerRecord = (state: ServiceDeskState, id: string, patch: Pick<Customer, 'name' | 'phone' | 'email'>, actor: string): ServiceDeskState => ({
  ...state,
  customers: state.customers.map((customer) => (customer.id === id ? { ...customer, ...patch, updatedAt: nowStamp(), updatedBy: actor } : customer)),
});

export const deleteCustomerRecord = (state: ServiceDeskState, id: string): ServiceDeskState => {
  if (state.workItems.some((item) => item.customerId === id)) {
    return state;
  }
  return { ...state, customers: state.customers.filter((customer) => customer.id !== id) };
};

export const addTechnicianRecord = (state: ServiceDeskState, draft: TechnicianDraft, actor: string): ServiceDeskState => {
  const stamp = nowStamp();
  return {
    ...state,
    technicians: [
      {
        id: nextNumericId('tech', state.technicians.map((technician) => technician.id), 0),
        name: draft.name.trim(),
        email: draft.email.trim().toLowerCase(),
        specialties: draft.specialties,
        activeJobs: 0,
        createdAt: stamp,
        createdBy: actor,
        updatedAt: stamp,
        updatedBy: actor,
      },
      ...state.technicians,
    ],
  };
};

export const updateTechnicianRecord = (state: ServiceDeskState, id: string, patch: TechnicianDraft, actor: string): ServiceDeskState => ({
  ...state,
  technicians: state.technicians.map((technician) =>
    technician.id === id
      ? { ...technician, name: patch.name.trim(), email: patch.email.trim().toLowerCase(), specialties: patch.specialties, updatedAt: nowStamp(), updatedBy: actor }
      : technician,
  ),
});

export const deleteTechnicianRecord = (state: ServiceDeskState, id: string): ServiceDeskState => {
  if (state.workItems.some((item) => item.assignedTechnicianId === id)) {
    return state;
  }
  return { ...state, technicians: state.technicians.filter((technician) => technician.id !== id) };
};

export const createInvoiceRecord = (state: ServiceDeskState, draft: InvoiceDraft, actor: string): ServiceDeskState => {
  const item = state.workItems.find((workItem) => workItem.id === draft.workItemId);
  if (!item) {
    return state;
  }

  const laborAmount = Math.max(0, Number(draft.laborAmount) || 0);
  const partsAmount = Math.max(0, Number(draft.partsAmount) || 0);
  const diagnosticFee = Math.max(0, Number(draft.diagnosticFee) || 0);
  const breakdownTotal = laborAmount + partsAmount + diagnosticFee;
  const stamp = nowStamp();

  return {
    ...state,
    invoices: [
      {
        id: nextNumericId('INV', state.invoices.map((invoice) => invoice.id), 5000),
        workItemId: item.id,
        customerId: item.customerId,
        customerName: item.customerName,
        amount: breakdownTotal > 0 ? breakdownTotal : Number(draft.amount) || item.estimatedPrice,
        laborAmount,
        partsAmount,
        diagnosticFee,
        status: 'Issued',
        issuedAt: stamp,
        paidAt: '',
        paymentMethod: '',
        paymentReference: '',
        notes: draft.notes,
        createdAt: stamp,
        createdBy: actor,
        updatedAt: stamp,
        updatedBy: actor,
      },
      ...state.invoices,
    ],
  };
};

export const updateInvoiceStatusRecord = (state: ServiceDeskState, id: string, status: InvoiceStatus, actor: string): ServiceDeskState => ({
  ...state,
  invoices: state.invoices.map((invoice) =>
    invoice.id === id ? { ...invoice, status, paidAt: status === 'Paid' ? nowStamp() : '', updatedAt: nowStamp(), updatedBy: actor } : invoice,
  ),
});

export const deleteInvoiceRecord = (state: ServiceDeskState, id: string): ServiceDeskState => ({
  ...state,
  invoices: state.invoices.filter((invoice) => invoice.id !== id),
});

export const recordInvoicePaymentRecord = (state: ServiceDeskState, id: string, payment: InvoicePaymentDraft, actor: string): ServiceDeskState => {
  const invoice = state.invoices.find((candidate) => candidate.id === id);
  if (!invoice || invoice.status === 'Void') {
    return state;
  }

  const stamp = nowStamp();
  const notification = mockNotification(state, {
    workItemId: invoice.workItemId,
    customerId: invoice.customerId,
    channel: 'email',
    recipient: invoice.customerName,
    message: `Payment received for invoice ${id} (${payment.method}). Thank you!`,
  });

  return {
    ...state,
    invoices: state.invoices.map((candidate) =>
      candidate.id === id
        ? { ...candidate, status: 'Paid', paidAt: stamp, paymentMethod: payment.method, paymentReference: payment.reference.trim() || `TEST-${id}`, updatedAt: stamp, updatedBy: actor }
        : candidate,
    ),
    notifications: [notification, ...state.notifications],
  };
};

export const createSavedReportRecord = (state: ServiceDeskState, draft: SavedReportDraft, createdBy: string): ServiceDeskState => {
  if (!draft.name.trim() || !draft.columns.length) {
    return state;
  }

  return {
    ...state,
    savedReports: [
      {
        id: `RPT-LOCAL-${Date.now()}`,
        createdBy,
        name: draft.name.trim(),
        entity: draft.entity,
        columns: draft.columns,
        filterField: draft.filterField,
        filterValue: draft.filterValue,
        createdAt: nowStamp(),
      },
      ...state.savedReports,
    ],
  };
};

export const deleteSavedReportRecord = (state: ServiceDeskState, id: string): ServiceDeskState => ({
  ...state,
  savedReports: state.savedReports.filter((report) => report.id !== id),
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
