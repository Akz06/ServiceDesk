import type {
  AuthResponse,
  AuthUser,
  InventoryPart,
  InvoiceDraft,
  InvoicePaymentDraft,
  InvoiceStatus,
  ManagedUser,
  SavedReportDraft,
  ServiceDeskState,
  UserDraft,
  UserRole,
  WorkItem,
  WorkItemDraft,
} from '../types';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const shouldUseApi = configuredBaseUrl !== undefined && configuredBaseUrl !== '' ? true : import.meta.env.PROD;
const apiBaseUrl = configuredBaseUrl ?? '';
const AUTH_TOKEN_KEY = 'service-desk-auth-token-v1';
const AUTH_USER_KEY = 'service-desk-auth-user-v1';

export const isApiPersistenceEnabled = shouldUseApi;

export function getStoredAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function getStoredAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function storeAuthSession(auth: AuthResponse) {
  localStorage.setItem(AUTH_TOKEN_KEY, auth.token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(auth.user));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredAuthToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ServiceDesk API request failed (${response.status}): ${details}`);
  }

  return response.json() as Promise<T>;
}

const requestState = (path: string, init?: RequestInit) => requestJson<ServiceDeskState>(path, init);

export const authApi = {
  login: (email: string, password: string) => requestJson<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => requestJson<{ user: AuthUser }>('/api/auth/me'),
  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
};

export const userApi = {
  list: () => requestJson<{ users: ManagedUser[] }>('/api/admin/users'),
  create: (draft: UserDraft) => requestJson<{ users: ManagedUser[] }>('/api/admin/users', { method: 'POST', body: JSON.stringify(draft) }),
  update: (id: string, draft: UserDraft) => requestJson<{ users: ManagedUser[] }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(draft) }),
};

export const serviceDeskApi = {
  getState: () => requestState('/api/state'),
  createWorkItem: (draft: WorkItemDraft) => requestState('/api/work-items', { method: 'POST', body: JSON.stringify(draft) }),
  updateWorkItem: (
    id: string,
    patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>,
    actor: UserRole | 'System',
    message: string,
  ) => requestState(`/api/work-items/${id}`, { method: 'PATCH', body: JSON.stringify({ patch, actor, message }) }),
  approveEstimate: (id: string) => requestState(`/api/work-items/${id}/approval`, { method: 'POST' }),
  cancelWorkItem: (id: string, actor: UserRole) => requestState(`/api/work-items/${id}/cancel`, { method: 'POST', body: JSON.stringify({ actor }) }),
  adjustInventory: (sku: string, delta: number) => requestState(`/api/inventory/${sku}/adjust`, { method: 'PATCH', body: JSON.stringify({ delta }) }),
  addInventoryPart: (part: InventoryPart) => requestState(`/api/inventory/${part.sku}`, { method: 'PUT', body: JSON.stringify(part) }),
  createInvoice: (draft: InvoiceDraft) => requestState('/api/invoices', { method: 'POST', body: JSON.stringify(draft) }),
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => requestState(`/api/invoices/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  recordInvoicePayment: (id: string, payment: InvoicePaymentDraft) => requestState(`/api/invoices/${id}/payment`, { method: 'POST', body: JSON.stringify(payment) }),
  notifyCustomerNow: (workItemId: string) => requestState(`/api/work-items/${workItemId}/notify`, { method: 'POST' }),
  createSavedReport: (draft: SavedReportDraft) => requestState('/api/reports', { method: 'POST', body: JSON.stringify(draft) }),
  deleteSavedReport: (id: string) => requestState(`/api/reports/${id}`, { method: 'DELETE' }),
  reset: () => requestState('/api/reset', { method: 'POST' }),
};

async function downloadFile(path: string, filename: string) {
  const token = getStoredAuthToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Export failed (${response.status}): ${await response.text()}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const exportApi = {
  invoicesCsv: () => downloadFile('/api/export/invoices.csv', 'invoices.csv'),
  customersCsv: () => downloadFile('/api/export/customers.csv', 'customers.csv'),
};
