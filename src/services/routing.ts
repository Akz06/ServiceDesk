import type { ModuleId } from '../types';

const moduleMap: Record<string, ModuleId> = {
  admin: 'admin',
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

// Only an authenticated session gets an id in the URL. An anonymous visit to `/` or
// `/login` reuses nothing and mints nothing — the id only appears once a login actually
// succeeds (see handleLoginSuccess in App.tsx), so a logged-out visitor never sees one.
export const getExistingSessionId = (): string | null => {
  const [, route, id] = window.location.pathname.split('/');
  return (route === 'login' || route === 'app') && id ? id : null;
};

export const getInitialModuleFromUrl = (): ModuleId | null => {
  const [, route] = window.location.pathname.split('/');
  if (route !== 'app') {
    return null;
  }

  return normalizeModule(new URLSearchParams(window.location.search).get('module'));
};

export const updateUrlForModule = (sessionId: string | null, moduleId: ModuleId | null) => {
  const url = sessionId && moduleId ? `/app/${sessionId}?module=${moduleId}` : '/login';
  window.history.pushState({}, '', url);
};
