import { useEffect, useState, type FormEvent } from 'react';
import { storeAuthSession } from './services/apiClient';
import { clearPlatformToken, getPlatformToken, platformApi, storePlatformToken } from './services/platformClient';
import type { AuthUser, PlatformEvent, PlatformOrganizationSummary, PlatformUserSummary } from './types';

function PlatformLogin({ onLoggedIn }: { onLoggedIn: (user: AuthUser, token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await platformApi.login(email, password);
      if (!response.user.isPlatformAdmin) {
        setError('This account does not have platform admin access.');
        return;
      }
      onLoggedIn(response.user, response.token);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to log in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="public-shell">
      <section className="homepage-hero" style={{ gridTemplateColumns: '1fr', justifyItems: 'center' }}>
        <aside className="login-panel" style={{ maxWidth: 420, width: '100%' }} aria-label="Platform admin login">
          <p className="eyebrow">Platform console</p>
          <h2>Admin console login</h2>
          <p className="muted">Restricted to platform operators. All activity here is logged.</p>
          <form className="login-form" onSubmit={(event) => void submit(event)}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
            {error && <div className="login-error">{error}</div>}
            <button className="primary-button full-width" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Logging in…' : 'Login'}</button>
          </form>
        </aside>
      </section>
    </main>
  );
}

function OrganizationRow({ organization }: { organization: PlatformOrganizationSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [users, setUsers] = useState<PlatformUserSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && users === null) {
      setIsLoading(true);
      setError(null);
      try {
        const response = await platformApi.organizationUsers(organization.id);
        setUsers(response.users);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load users.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const impersonate = async (user: PlatformUserSummary) => {
    if (!window.confirm(`Log in as ${user.name} (${user.email}) in ${organization.name}? This is logged.`)) {
      return;
    }
    setImpersonatingId(user.id);
    try {
      const response = await platformApi.impersonate(user.id);
      storeAuthSession(response);
      sessionStorage.setItem('sd-impersonating', '1');
      window.location.assign('/login');
    } catch (impersonateError) {
      window.alert(impersonateError instanceof Error ? impersonateError.message : 'Unable to impersonate this user.');
      setImpersonatingId(null);
    }
  };

  return (
    <>
      <tr className="is-clickable" onClick={() => void toggle()}>
        <td>{organization.name}</td>
        <td>{organization.slug}</td>
        <td>{organization.createdAt}</td>
        <td>{organization.userCount}</td>
        <td>{organization.customerCount}</td>
        <td>{organization.workItemCount}</td>
        <td>{organization.invoiceCount}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ background: 'var(--surface-subtle)' }}>
            {isLoading && <p className="muted">Loading users…</p>}
            {error && <div className="login-error">{error}</div>}
            {users && users.length === 0 && <p className="muted">No users in this organization.</p>}
            {users && users.length > 0 && (
              <table className="data-grid-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>{user.active ? 'Active' : 'Inactive'}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary-dark-button"
                          disabled={!user.active || impersonatingId === user.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void impersonate(user);
                          }}
                        >
                          {impersonatingId === user.id ? 'Logging in…' : 'Impersonate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function PlatformConsole({ admin, onLogout }: { admin: AuthUser; onLogout: () => void }) {
  const [organizations, setOrganizations] = useState<PlatformOrganizationSummary[] | null>(null);
  const [events, setEvents] = useState<PlatformEvent[] | null>(null);
  const [tab, setTab] = useState<'organizations' | 'events'>('organizations');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformApi.organizations().then((response) => setOrganizations(response.organizations)).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load organizations.');
    });
  }, []);

  useEffect(() => {
    if (tab === 'events' && events === null) {
      platformApi.events(200).then((response) => setEvents(response.events)).catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load activity log.');
      });
    }
  }, [tab, events]);

  return (
    <main className="creator-shell">
      <section className="creator-main" style={{ marginLeft: 0, width: '100%' }}>
        <header className="creator-topbar">
          <div className="topbar-heading"><h1>Platform admin console</h1></div>
          <div className="card-actions">
            <span className="muted">{admin.email}</span>
            <button type="button" className="secondary-dark-button" onClick={onLogout}>Logout</button>
          </div>
        </header>

        {error && <div className="login-error" style={{ margin: '14px 0' }}>{error}</div>}

        <div className="auth-tabs" role="tablist" style={{ maxWidth: 420, marginTop: 14 }}>
          <button type="button" role="tab" aria-selected={tab === 'organizations'} className={tab === 'organizations' ? 'auth-tab is-active' : 'auth-tab'} onClick={() => setTab('organizations')}>Organizations</button>
          <button type="button" role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'auth-tab is-active' : 'auth-tab'} onClick={() => setTab('events')}>Activity log</button>
        </div>

        {tab === 'organizations' && (
          <section className="creator-panel data-grid-panel" style={{ marginTop: 16 }}>
            <div className="list-header"><h2>{organizations ? `${organizations.length} organizations` : 'Organizations'}</h2></div>
            <div className="data-grid">
              {organizations === null ? (
                <p className="muted" style={{ padding: 16 }}>Loading…</p>
              ) : (
                <table className="data-grid-table">
                  <thead>
                    <tr><th>Name</th><th>Slug</th><th>Created</th><th>Users</th><th>Customers</th><th>Work items</th><th>Invoices</th></tr>
                  </thead>
                  <tbody>
                    {organizations.map((organization) => <OrganizationRow organization={organization} key={organization.id} />)}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {tab === 'events' && (
          <section className="creator-panel data-grid-panel" style={{ marginTop: 16 }}>
            <div className="list-header"><h2>Recent activity</h2></div>
            <div className="data-grid">
              {events === null ? (
                <p className="muted" style={{ padding: 16 }}>Loading…</p>
              ) : events.length === 0 ? (
                <p className="muted" style={{ padding: 16 }}>No activity recorded yet.</p>
              ) : (
                <table className="data-grid-table">
                  <thead>
                    <tr><th>Time</th><th>Event</th><th>Actor</th><th>Message</th></tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{event.createdAt}</td>
                        <td>{event.eventType}</td>
                        <td>{event.actorEmail ?? '—'}</td>
                        <td>{event.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export default function PlatformAdmin() {
  const [status, setStatus] = useState<'checking' | 'loggedOut' | 'loggedIn'>(() => (getPlatformToken() ? 'checking' : 'loggedOut'));
  const [admin, setAdmin] = useState<AuthUser | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
  }, []);

  useEffect(() => {
    if (status !== 'checking') {
      return;
    }

    platformApi
      .me()
      .then((response) => {
        if (!response.user.isPlatformAdmin) {
          clearPlatformToken();
          setStatus('loggedOut');
          return;
        }
        setAdmin(response.user);
        setStatus('loggedIn');
      })
      .catch(() => {
        clearPlatformToken();
        setStatus('loggedOut');
      });
  }, [status]);

  const handleLoggedIn = (user: AuthUser, token: string) => {
    storePlatformToken(token);
    setAdmin(user);
    setStatus('loggedIn');
  };

  const handleLogout = () => {
    clearPlatformToken();
    setAdmin(null);
    setStatus('loggedOut');
  };

  if (status === 'checking') {
    return <main className="public-shell" />;
  }

  if (status === 'loggedOut' || !admin) {
    return <PlatformLogin onLoggedIn={handleLoggedIn} />;
  }

  return <PlatformConsole admin={admin} onLogout={handleLogout} />;
}
