import type { AuthResponse, AuthUser, PlatformEvent, PlatformOrganizationSummary, PlatformUserSummary } from '../types';

// Deliberately separate from the tenant auth token in apiClient.ts (service-desk-auth-token-v1).
// Both live in the same browser's localStorage, shared across every tab on this origin — reusing
// the tenant key would mean logging into the admin console in one tab silently swaps the token a
// tenant session in another tab is using for its next request.
const PLATFORM_TOKEN_KEY = 'platform-admin-token-v1';

export const getPlatformToken = () => localStorage.getItem(PLATFORM_TOKEN_KEY);
export const storePlatformToken = (token: string) => localStorage.setItem(PLATFORM_TOKEN_KEY, token);
export const clearPlatformToken = () => localStorage.removeItem(PLATFORM_TOKEN_KEY);

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

async function platformFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getPlatformToken();
  let response: Response;

  try {
    response = await fetch(path, {
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

  return (await response.json()) as T;
}

export const platformApi = {
  login: (email: string, password: string) =>
    platformFetch<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => platformFetch<{ user: AuthUser }>('/api/auth/me'),
  organizations: () => platformFetch<{ organizations: PlatformOrganizationSummary[] }>('/api/platform/organizations'),
  organizationUsers: (organizationId: string) =>
    platformFetch<{ users: PlatformUserSummary[] }>(`/api/platform/organizations/${organizationId}/users`),
  impersonate: (userId: string) => platformFetch<AuthResponse>(`/api/platform/impersonate/${userId}`, { method: 'POST' }),
  events: (limit = 100) => platformFetch<{ events: PlatformEvent[] }>(`/api/platform/events?limit=${limit}`),
};
