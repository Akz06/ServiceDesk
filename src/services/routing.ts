import type { UserRole } from '../types';

const roleMap: Record<string, UserRole> = {
  agent: 'Agent',
  technician: 'Technician',
  customer: 'Customer',
};

export const normalizeRole = (role: string | null): UserRole | null => {
  if (!role) {
    return null;
  }

  return roleMap[role.toLowerCase()] ?? null;
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

export const getInitialRoleFromUrl = (): UserRole | null => {
  const [, route] = window.location.pathname.split('/');
  if (route !== 'app') {
    return null;
  }

  return normalizeRole(new URLSearchParams(window.location.search).get('role'));
};

export const updateUrlForRole = (sessionId: string, role: UserRole | null) => {
  const url = role ? `/app/${sessionId}?role=${role.toLowerCase()}` : `/login/${sessionId}`;
  window.history.pushState({}, '', url);
};
