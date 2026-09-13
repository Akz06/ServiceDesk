import { useCallback, useState } from 'react';
import type { AuthUser } from '../types';
import { authApi, clearAuthSession, getStoredAuthUser, isApiPersistenceEnabled, storeAuthSession } from '../services/apiClient';

const localDemoUsers: Array<{ email: string; password: string; user: AuthUser }> = [
  { email: 'admin@servicedesk.local', password: 'Admin@12345', user: { id: 'user-admin', name: 'Admin User', email: 'admin@servicedesk.local', role: 'Admin', profile: 'admin', moduleAccess: ['admin', 'agent', 'technician', 'customer'] } },
  { email: 'agent@servicedesk.local', password: 'Agent@12345', user: { id: 'user-agent', name: 'Agent User', email: 'agent@servicedesk.local', role: 'Agent', profile: 'agent', moduleAccess: ['agent'] } },
  { email: 'tech@servicedesk.local', password: 'Tech@12345', user: { id: 'user-technician', name: 'Technician User', email: 'tech@servicedesk.local', role: 'Technician', profile: 'technician', moduleAccess: ['technician'] } },
  { email: 'customer@servicedesk.local', password: 'Customer@12345', user: { id: 'user-customer', name: 'Customer User', email: 'customer@servicedesk.local', role: 'Customer', profile: 'customer', moduleAccess: ['customer'] } },
];

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      if (isApiPersistenceEnabled) {
        const auth = await authApi.login(email, password);
        storeAuthSession(auth);
        setUser(auth.user);
        return auth.user;
      }

      const found = localDemoUsers.find((demoUser) => demoUser.email === email.trim().toLowerCase() && demoUser.password === password);
      if (!found) {
        throw new Error('Invalid email or password.');
      }
      storeAuthSession({ token: 'local-demo-token', user: found.user });
      setUser(found.user);
      return found.user;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to login.';
      setAuthError(message);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (isApiPersistenceEnabled) {
      try {
        await authApi.logout();
      } catch {
        // Ignore logout API failures and clear browser state anyway.
      }
    }
    clearAuthSession();
    setUser(null);
  }, []);

  return { user, login, logout, isAuthenticating, authError };
}
