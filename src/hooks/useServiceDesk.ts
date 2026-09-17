import { useCallback, useEffect, useState } from 'react';
import type { InventoryPart, InvoiceDraft, InvoicePaymentDraft, InvoiceStatus, SavedReportDraft, ServiceDeskState, UserRole, WorkItem, WorkItemDraft } from '../types';
import { isApiPersistenceEnabled, serviceDeskApi } from '../services/apiClient';
import {
  addInventoryPartRecord,
  adjustInventoryRecord,
  approveEstimateRecord,
  cancelWorkItemRecord,
  createInvoiceRecord,
  createSavedReportRecord,
  createWorkItemRecord,
  deleteSavedReportRecord,
  loadServiceDeskState,
  notifyCustomerNowRecord,
  recordInvoicePaymentRecord,
  resetServiceDeskState,
  saveServiceDeskState,
  STORAGE_KEY,
  updateInvoiceStatusRecord,
  updateWorkItemRecord,
} from '../services/serviceDeskStore';

const POLL_INTERVAL_MS = 5_000;

export function useServiceDesk() {
  const [state, setState] = useState<ServiceDeskState>(() => loadServiceDeskState());
  const [isLoading, setIsLoading] = useState(isApiPersistenceEnabled);
  const [error, setError] = useState<string | null>(null);

  const syncFromApi = useCallback(async () => {
    if (!isApiPersistenceEnabled) {
      return;
    }

    try {
      const next = await serviceDeskApi.getState();
      setState(next);
      saveServiceDeskState(next);
      setError(null);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Unable to load service desk data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isApiPersistenceEnabled) {
      saveServiceDeskState(state);
    }
  }, [state]);

  useEffect(() => {
    const initialSync = window.setTimeout(() => {
      void syncFromApi();
    }, 0);

    if (!isApiPersistenceEnabled) {
      return () => window.clearTimeout(initialSync);
    }

    const interval = window.setInterval(() => {
      void syncFromApi();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialSync);
      window.clearInterval(interval);
    };
  }, [syncFromApi]);

  useEffect(() => {
    if (isApiPersistenceEnabled) {
      return undefined;
    }

    const syncFromStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        setState(JSON.parse(event.newValue) as ServiceDeskState);
      }
    };

    window.addEventListener('storage', syncFromStorage);
    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  const runApiMutation = async (mutation: () => Promise<ServiceDeskState>) => {
    setError(null);
    try {
      const next = await mutation();
      setState(next);
      saveServiceDeskState(next);
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Unable to save service desk data.');
    }
    // Resolves either way — failures are surfaced via `error` state (the sync banner),
    // not by rejecting, so existing fire-and-forget call sites don't need a .catch().
  };

  return {
    state,
    isApiBacked: isApiPersistenceEnabled,
    isLoading,
    error,
    refresh: syncFromApi,
    createWorkItem: (draft: WorkItemDraft) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.createWorkItem(draft));
      }
      setState((current) => createWorkItemRecord(current, draft));
      return Promise.resolve();
    },
    updateWorkItem: (
      id: string,
      patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>,
      actor: UserRole | 'System',
      message: string,
    ) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.updateWorkItem(id, patch, actor, message));
      }
      setState((current) => updateWorkItemRecord(current, id, patch, actor, message));
      return Promise.resolve();
    },
    approveEstimate: (id: string) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.approveEstimate(id));
      }
      setState((current) => approveEstimateRecord(current, id));
      return Promise.resolve();
    },
    cancelWorkItem: (id: string, actor: UserRole) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.cancelWorkItem(id, actor));
      }
      setState((current) => cancelWorkItemRecord(current, id, actor));
      return Promise.resolve();
    },
    adjustInventory: (sku: string, delta: number) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.adjustInventory(sku, delta));
      }
      setState((current) => adjustInventoryRecord(current, sku, delta));
      return Promise.resolve();
    },
    addInventoryPart: (part: InventoryPart) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.addInventoryPart(part));
      }
      setState((current) => addInventoryPartRecord(current, part));
      return Promise.resolve();
    },
    createInvoice: (draft: InvoiceDraft) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.createInvoice(draft));
      }
      setState((current) => createInvoiceRecord(current, draft));
      return Promise.resolve();
    },
    updateInvoiceStatus: (id: string, status: InvoiceStatus) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.updateInvoiceStatus(id, status));
      }
      setState((current) => updateInvoiceStatusRecord(current, id, status));
      return Promise.resolve();
    },
    recordInvoicePayment: (id: string, payment: InvoicePaymentDraft) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.recordInvoicePayment(id, payment));
      }
      setState((current) => recordInvoicePaymentRecord(current, id, payment));
      return Promise.resolve();
    },
    notifyCustomerNow: (workItemId: string) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.notifyCustomerNow(workItemId));
      }
      setState((current) => notifyCustomerNowRecord(current, workItemId));
      return Promise.resolve();
    },
    createSavedReport: (draft: SavedReportDraft, createdBy: string) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.createSavedReport(draft));
      }
      setState((current) => createSavedReportRecord(current, draft, createdBy));
      return Promise.resolve();
    },
    deleteSavedReport: (id: string) => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(() => serviceDeskApi.deleteSavedReport(id));
      }
      setState((current) => deleteSavedReportRecord(current, id));
      return Promise.resolve();
    },
    reset: () => {
      if (isApiPersistenceEnabled) {
        return runApiMutation(serviceDeskApi.reset);
      }
      setState(resetServiceDeskState());
      return Promise.resolve();
    },
  };
}
