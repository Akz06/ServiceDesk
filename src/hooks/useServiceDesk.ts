import { useCallback, useEffect, useState } from 'react';
import type { InventoryPart, ServiceDeskState, UserRole, WorkItem, WorkItemDraft } from '../types';
import { isApiPersistenceEnabled, serviceDeskApi } from '../services/apiClient';
import {
  addInventoryPartRecord,
  adjustInventoryRecord,
  approveEstimateRecord,
  cancelWorkItemRecord,
  createWorkItemRecord,
  loadServiceDeskState,
  resetServiceDeskState,
  saveServiceDeskState,
  STORAGE_KEY,
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
  };

  return {
    state,
    isApiBacked: isApiPersistenceEnabled,
    isLoading,
    error,
    refresh: syncFromApi,
    createWorkItem: (draft: WorkItemDraft) => {
      if (isApiPersistenceEnabled) {
        void runApiMutation(() => serviceDeskApi.createWorkItem(draft));
        return;
      }
      setState((current) => createWorkItemRecord(current, draft));
    },
    updateWorkItem: (
      id: string,
      patch: Partial<Omit<WorkItem, 'id' | 'customerId' | 'updates'>>,
      actor: UserRole | 'System',
      message: string,
    ) => {
      if (isApiPersistenceEnabled) {
        void runApiMutation(() => serviceDeskApi.updateWorkItem(id, patch, actor, message));
        return;
      }
      setState((current) => updateWorkItemRecord(current, id, patch, actor, message));
    },
    approveEstimate: (id: string) => {
      if (isApiPersistenceEnabled) {
        void runApiMutation(() => serviceDeskApi.approveEstimate(id));
        return;
      }
      setState((current) => approveEstimateRecord(current, id));
    },
    cancelWorkItem: (id: string, actor: UserRole) => {
      if (isApiPersistenceEnabled) {
        void runApiMutation(() => serviceDeskApi.cancelWorkItem(id, actor));
        return;
      }
      setState((current) => cancelWorkItemRecord(current, id, actor));
    },
    adjustInventory: (sku: string, delta: number) => {
      if (isApiPersistenceEnabled) {
        void runApiMutation(() => serviceDeskApi.adjustInventory(sku, delta));
        return;
      }
      setState((current) => adjustInventoryRecord(current, sku, delta));
    },
    addInventoryPart: (part: InventoryPart) => {
      if (isApiPersistenceEnabled) {
        void runApiMutation(() => serviceDeskApi.addInventoryPart(part));
        return;
      }
      setState((current) => addInventoryPartRecord(current, part));
    },
    reset: () => {
      if (isApiPersistenceEnabled) {
        void runApiMutation(serviceDeskApi.reset);
        return;
      }
      setState(resetServiceDeskState());
    },
  };
}
