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

const SESSION_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const SESSION_ID_LENGTH = 8;

// This id is a routing/bookmarking convenience only — never an auth credential — so a
// short random string is plenty; it just needs to keep the URL out of the way.
export const createSessionId = (): string => {
  const bytes = new Uint8Array(SESSION_ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => SESSION_ID_ALPHABET[byte % SESSION_ID_ALPHABET.length]).join('');
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
