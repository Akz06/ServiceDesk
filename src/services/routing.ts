import type { ModuleId } from '../types';

const moduleMap: Record<string, ModuleId> = {
  agent: 'agent',
  technician: 'technician',
  customer: 'customer',
};

export const normalizeModule = (moduleId: string | null): ModuleId | null => {
  if (!moduleId) {
    return null;
  }

  return moduleMap[moduleId.toLowerCase()] ?? null;
};

export const getOrCreateSessionId = () => {
  const [, route, id] = window.location.pathname.split('/');
  if ((route === 'login' || route === 'app') && id) {
    return id;
  }

  const generatedId = crypto.randomUUID();
  window.history.replaceState({}, '', `/login/${generatedId}`);
  return generatedId;
};

export const getInitialModuleFromUrl = (): ModuleId | null => {
  const [, route] = window.location.pathname.split('/');
  if (route !== 'app') {
    return null;
  }

  return normalizeModule(new URLSearchParams(window.location.search).get('module'));
};

export const updateUrlForModule = (sessionId: string, moduleId: ModuleId | null) => {
  const url = moduleId ? `/app/${sessionId}?module=${moduleId}` : `/login/${sessionId}`;
  window.history.pushState({}, '', url);
};
