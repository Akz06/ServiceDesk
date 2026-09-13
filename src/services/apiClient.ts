import type { InventoryPart, ServiceDeskState, UserRole, WorkItem, WorkItemDraft } from '../types';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const shouldUseApi = configuredBaseUrl !== undefined && configuredBaseUrl !== '' ? true : import.meta.env.PROD;
const apiBaseUrl = configuredBaseUrl ?? '';

export const isApiPersistenceEnabled = shouldUseApi;

async function requestState(path: string, init?: RequestInit): Promise<ServiceDeskState> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`ServiceDesk API request failed (${response.status}): ${details}`);
  }

  return response.json() as Promise<ServiceDeskState>;
}

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
  reset: () => requestState('/api/reset', { method: 'POST' }),
};
