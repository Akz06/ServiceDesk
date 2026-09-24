import type {
  AuthResponse,
  AuthUser,
  BulkUserCreationResult,
  BulkUserRow,
  Customer,
  InventoryPart,
  InvoiceDraft,
  InvoicePaymentDraft,
  InvoiceStatus,
  ManagedUser,
  OrganizationSignupDraft,
  SavedReportDraft,
  ServiceDeskState,
  TechnicianDraft,
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

async function friendlyErrorMessage(response: Response): Promise<string> {
  const details = await response.text();

  try {
    const parsed = JSON.parse(details) as { error?: string };
    if (parsed.error) {
      return parsed.error;
    }
  } catch {
    // Response body wasn't JSON — fall through to the generic message below.
  }

  if (response.status === 401) {
    return 'Your session has expired. Please log in again.';
  }

  if (response.status === 403) {
    return "You don't have permission to do that.";
  }

  return 'Something went wrong. Please try again.';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredAuthToken();
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('Unable to reach the server. Check your internet connection and try again.');
  }

  if (!response.ok) {
    throw new Error(await friendlyErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

const requestState = (path: string, init?: RequestInit) => requestJson<ServiceDeskState>(path, init);

export const authApi = {
  login: (email: string, password: string) => requestJson<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (draft: OrganizationSignupDraft) => requestJson<AuthResponse>('/api/organizations', { method: 'POST', body: JSON.stringify(draft) }),
  me: () => requestJson<{ user: AuthUser }>('/api/auth/me'),
  logout: () => requestJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
};

export const userApi = {
  list: () => requestJson<{ users: ManagedUser[] }>('/api/admin/users'),
  create: (draft: UserDraft) => requestJson<{ users: ManagedUser[] }>('/api/admin/users', { method: 'POST', body: JSON.stringify(draft) }),
  update: (id: string, draft: UserDraft) => requestJson<{ users: ManagedUser[] }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(draft) }),
  remove: (id: string) => requestJson<{ users: ManagedUser[] }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  bulkCreate: (rows: BulkUserRow[]) => requestJson<BulkUserCreationResult>('/api/admin/users/bulk', { method: 'POST', body: JSON.stringify({ rows }) }),
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
  deleteWorkItem: (id: string) => requestState(`/api/work-items/${id}`, { method: 'DELETE' }),
  adjustInventory: (sku: string, delta: number) => requestState(`/api/inventory/${sku}/adjust`, { method: 'PATCH', body: JSON.stringify({ delta }) }),
  addInventoryPart: (part: InventoryPart) => requestState(`/api/inventory/${part.sku}`, { method: 'PUT', body: JSON.stringify(part) }),
  deleteInventoryPart: (sku: string) => requestState(`/api/inventory/${sku}`, { method: 'DELETE' }),
  addCustomer: (draft: Pick<Customer, 'name' | 'phone' | 'email'>) => requestState('/api/customers', { method: 'POST', body: JSON.stringify(draft) }),
  updateCustomer: (id: string, patch: Pick<Customer, 'name' | 'phone' | 'email'>) => requestState(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCustomer: (id: string) => requestState(`/api/customers/${id}`, { method: 'DELETE' }),
  addTechnician: (draft: TechnicianDraft) => requestState('/api/technicians', { method: 'POST', body: JSON.stringify(draft) }),
  updateTechnician: (id: string, patch: TechnicianDraft) => requestState(`/api/technicians/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTechnician: (id: string) => requestState(`/api/technicians/${id}`, { method: 'DELETE' }),
  createInvoice: (draft: InvoiceDraft) => requestState('/api/invoices', { method: 'POST', body: JSON.stringify(draft) }),
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => requestState(`/api/invoices/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteInvoice: (id: string) => requestState(`/api/invoices/${id}`, { method: 'DELETE' }),
  recordInvoicePayment: (id: string, payment: InvoicePaymentDraft) => requestState(`/api/invoices/${id}/payment`, { method: 'POST', body: JSON.stringify(payment) }),
  notifyCustomerNow: (workItemId: string) => requestState(`/api/work-items/${workItemId}/notify`, { method: 'POST' }),
  markNotificationsRead: (ids?: string[]) => requestState('/api/notifications/read', { method: 'POST', body: JSON.stringify({ ids }) }),
  createSavedReport: (draft: SavedReportDraft) => requestState('/api/reports', { method: 'POST', body: JSON.stringify(draft) }),
  deleteSavedReport: (id: string) => requestState(`/api/reports/${id}`, { method: 'DELETE' }),
  reset: () => requestState('/api/reset', { method: 'POST' }),
};

async function downloadFile(path: string, filename: string) {
  const token = getStoredAuthToken();
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {
    throw new Error('Unable to reach the server. Check your internet connection and try again.');
  }

  if (!response.ok) {
    throw new Error(await friendlyErrorMessage(response));
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
