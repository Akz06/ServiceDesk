import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ProgressTracker } from './components/ProgressTracker';
import { serviceCategories, technicians } from './data/repairShop';
import {
  authProfiles,
  currencyFormatter,
  defaultModuleForProfile,
  deviceTypes,
  moduleDescriptions,
  moduleLabels,
  priorities,
  terminalStatuses,
} from './domain/constants';
import { useAuth } from './hooks/useAuth';
import { useServiceDesk } from './hooks/useServiceDesk';
import { getInitialModuleFromUrl, getOrCreateSessionId, updateUrlForModule } from './services/routing';
import { getMetrics, getNextStatuses } from './services/serviceDeskStore';
import { isApiPersistenceEnabled, userApi } from './services/apiClient';
import type {
  AuthProfile,
  AuthUser,
  DeviceType,
  InventoryPart,
  InvoiceDraft,
  InvoiceStatus,
  ManagedUser,
  ModuleId,
  UserDraft,
  WorkItem,
  WorkItemDraft,
  WorkItemStatus,
} from './types';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL ?? 'support@example.com';
const supportPhone = import.meta.env.VITE_SUPPORT_PHONE ?? '+1-555-0100';
const appName = import.meta.env.VITE_APP_NAME ?? 'ServiceDesk Repair';

const blankDraft: WorkItemDraft = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  source: 'Walk-in',
  deviceType: 'Laptop',
  deviceModel: '',
  serialNumber: '',
  issueSummary: '',
  priority: 'Normal',
  assignedTechnicianId: 'tech-arun',
};

const blankPart: InventoryPart = {
  sku: '',
  name: '',
  compatibleWith: ['Laptop'],
  quantity: 0,
  reorderLevel: 2,
  unitCost: 0,
};

const blankUser: UserDraft = {
  name: '',
  email: '',
  profile: 'agent',
  password: '',
  active: true,
};

const demoCredentials = [
  { label: 'Admin', email: 'admin@servicedesk.local', password: 'Admin@12345' },
  { label: 'Agent', email: 'agent@servicedesk.local', password: 'Agent@12345' },
  { label: 'Technician', email: 'tech@servicedesk.local', password: 'Tech@12345' },
  { label: 'Customer', email: 'customer@servicedesk.local', password: 'Customer@12345' },
];

function App() {
  const [sessionId] = useState(getOrCreateSessionId);
  const initialModule = getInitialModuleFromUrl();
  const auth = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId | null>(() => {
    if (!auth.user) {
      return null;
    }

    return initialModule && auth.user.moduleAccess.includes(initialModule) ? initialModule : defaultModuleForProfile(auth.user.profile);
  });

  const handleLoginSuccess = (user: AuthUser) => {
    const nextModule = initialModule && user.moduleAccess.includes(initialModule) ? initialModule : defaultModuleForProfile(user.profile);
    setActiveModule(nextModule);
    updateUrlForModule(sessionId, nextModule);
  };

  const handleModuleChange = (moduleId: ModuleId) => {
    if (!auth.user?.moduleAccess.includes(moduleId)) {
      return;
    }

    setActiveModule(moduleId);
    updateUrlForModule(sessionId, moduleId);
  };

  const handleLogout = async () => {
    await auth.logout();
    setActiveModule(null);
    updateUrlForModule(sessionId, null);
  };

  if (!auth.user || !activeModule) {
    return <HomePage auth={auth} onLoginSuccess={handleLoginSuccess} />;
  }

  return <Workspace sessionId={sessionId} user={auth.user} activeModule={activeModule} onModuleChange={handleModuleChange} onLogout={handleLogout} />;
}

function HomePage({ auth, onLoginSuccess }: { auth: ReturnType<typeof useAuth>; onLoginSuccess: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@servicedesk.local');
  const [password, setPassword] = useState('Admin@12345');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = await auth.login(email, password);
    onLoginSuccess(user);
  };

  return (
    <main className="public-shell">
      <nav className="public-nav" aria-label="Homepage navigation">
        <div className="brand"><div className="brand-mark">SD</div><span>{appName}</span></div>
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
      </nav>
      <section className="homepage-hero">
        <div className="homepage-copy">
          <p className="eyebrow">Full-stack repair ERP platform</p>
          <h1>Run your electronics repair shop like a modern ERP.</h1>
          <p>
            {appName} combines repair request intake, technician workflow, customer progress, inventory,
            user administration, invoicing, and reporting in one PostgreSQL-backed application.
          </p>
          <div className="feature-list">
            <Feature title="Admin console" body="Manage users, profiles, invoices, master data, reports, and stock alerts." />
            <Feature title="Agent desk" body="Create online or walk-in work items and assign technicians." />
            <Feature title="Technician bay" body="Diagnose devices, share estimates, consume parts, and update repair status." />
            <Feature title="Customer portal" body="Customers can securely view repair progress and approve estimates." />
          </div>
        </div>
        <aside className="login-panel" aria-label="Login panel">
          <p className="eyebrow">Secure login</p>
          <h2>Login with your profile</h2>
          <p className="muted">Production login is backed by PostgreSQL users and sessions. Demo users are seeded on startup.</p>
          <form className="login-form" onSubmit={(event) => void submit(event)}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
            {auth.authError && <div className="login-error">{auth.authError}</div>}
            <button className="primary-button" type="submit" disabled={auth.isAuthenticating}>{auth.isAuthenticating ? 'Logging in…' : 'Login securely'}</button>
          </form>
          <div className="credential-grid" aria-label="Demo credentials">
            {demoCredentials.map((credential) => (
              <div className="credential-card" key={credential.email}>
                <strong>{credential.label}</strong>
                <span>{credential.email}</span>
                <button type="button" onClick={() => { setEmail(credential.email); setPassword(credential.password); }}>Use demo</button>
              </div>
            ))}
          </div>
          <p className="contact-line">Need help? <a href={`tel:${supportPhone}`}>{supportPhone}</a></p>
        </aside>
      </section>
    </main>
  );
}

function Workspace({
  sessionId,
  user,
  activeModule,
  onModuleChange,
  onLogout,
}: {
  sessionId: string;
  user: AuthUser;
  activeModule: ModuleId;
  onModuleChange: (moduleId: ModuleId) => void;
  onLogout: () => Promise<void>;
}) {
  const [selectedDeviceType, setSelectedDeviceType] = useState<DeviceType | 'All'>('All');
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('tech-arun');
  const serviceDesk = useServiceDesk();
  const { state } = serviceDesk;
  const metrics = getMetrics(state);

  const visibleCategories = useMemo(
    () => serviceCategories.filter((category) => selectedDeviceType === 'All' || category.deviceType === selectedDeviceType),
    [selectedDeviceType],
  );

  return (
    <main className="app-shell">
      <header className="hero compact-hero">
        <nav className="topbar" aria-label="Application navigation">
          <div className="brand"><div className="brand-mark">SD</div><span>{appName}</span></div>
          <span className="session-chip">{user.name} · {user.role}</span>
          <span className="session-chip">Session: {sessionId.slice(0, 8)}</span>
          <div className="topbar-actions">
            <button type="button" className="secondary-button" onClick={() => void onLogout()}>Logout</button>
          </div>
        </nav>
        <section className="hero-grid dashboard-hero">
          <div>
            <p className="eyebrow">{moduleLabels[activeModule]} workspace</p>
            <h1>Repair workflow command center</h1>
            <p className="hero-copy">
              Modules are controlled by the logged-in profile. Admin users see the ERP control center plus Agent,
              Technician, and Customer modules.
            </p>
          </div>
          <aside className="hero-card">
            <span>Operational snapshot</span>
            <strong>{metrics.activeWorkItems} active WIs</strong>
            <p>{metrics.lowStockParts} stock alerts · {currencyFormatter.format(metrics.estimatedRevenue)} estimate pipeline</p>
          </aside>
        </section>
      </header>

      <nav className="module-tabs" aria-label="Available modules">
        {user.moduleAccess.map((moduleId) => (
          <button className={moduleId === activeModule ? 'module-tab active' : 'module-tab'} key={moduleId} onClick={() => onModuleChange(moduleId)} type="button">
            {moduleLabels[moduleId]} module
          </button>
        ))}
      </nav>

      <section className="section-card">
        <p className="eyebrow">Module overview</p>
        <h2>{moduleLabels[activeModule]} module</h2>
        <p className="muted">{moduleDescriptions[activeModule]}</p>
      </section>

      <SyncStatus isApiBacked={serviceDesk.isApiBacked} isLoading={serviceDesk.isLoading} error={serviceDesk.error} onRefresh={serviceDesk.refresh} />

      <section className="metrics-grid" aria-label="Operational metrics">
        <MetricCard label="Active WIs" value={String(metrics.activeWorkItems)} helper="Open repair jobs" />
        <MetricCard label="Awaiting approval" value={String(metrics.awaitingApproval)} helper="Estimates shared" />
        <MetricCard label="Low-stock parts" value={String(metrics.lowStockParts)} helper="Inventory reorder alerts" />
        <MetricCard label="Paid revenue" value={currencyFormatter.format(metrics.paidRevenue)} helper={`${currencyFormatter.format(metrics.invoicedRevenue)} invoiced`} />
      </section>

      {activeModule === 'admin' && <AdminView {...serviceDesk} currentUser={user} />}
      {activeModule === 'agent' && <AgentView {...serviceDesk} />}
      {activeModule === 'technician' && (
        <TechnicianView
          selectedTechnicianId={selectedTechnicianId}
          setSelectedTechnicianId={setSelectedTechnicianId}
          {...serviceDesk}
        />
      )}
      {activeModule === 'customer' && <CustomerView {...serviceDesk} />}

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Service catalog</p><h2>Repair categories</h2></div>
          <label className="filter-control">Device type
            <select value={selectedDeviceType} onChange={(event) => setSelectedDeviceType(event.target.value as DeviceType | 'All')}>
              <option value="All">All</option>
              {deviceTypes.map((deviceType) => <option key={deviceType} value={deviceType}>{deviceType}</option>)}
            </select>
          </label>
        </div>
        <div className="service-grid">
          {visibleCategories.map((category) => (
            <article className="service-card" key={category.id}>
              <span className="pill">{category.deviceType}</span>
              <h3>{category.title}</h3>
              <p>{category.description}</p>
              <ul>{category.commonIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              <footer><strong>From {currencyFormatter.format(category.startingPrice)}</strong><span>{category.averageTurnaround}</span></footer>
            </article>
          ))}
        </div>
      </section>

      {(activeModule === 'admin' || activeModule === 'agent' || activeModule === 'technician') && (
        <InventoryView {...serviceDesk} canManage={activeModule === 'admin' || activeModule === 'agent'} canReset={user.profile === 'admin'} />
      )}
    </main>
  );
}

function AdminView({ state, createInvoice, updateInvoiceStatus, currentUser }: DeskActions & { currentUser: AuthUser }) {
  const metrics = getMetrics(state);
  const localDemoManagedUsers: ManagedUser[] = [
    { ...currentUser, active: true, createdAt: 'Local demo' },
    { id: 'user-agent', name: 'Agent User', email: 'agent@servicedesk.local', role: 'Agent', profile: 'agent', moduleAccess: ['agent'], active: true, createdAt: 'Local demo' },
    { id: 'user-technician', name: 'Technician User', email: 'tech@servicedesk.local', role: 'Technician', profile: 'technician', moduleAccess: ['technician'], active: true, createdAt: 'Local demo' },
    { id: 'user-customer', name: 'Customer User', email: 'customer@servicedesk.local', role: 'Customer', profile: 'customer', moduleAccess: ['customer'], active: true, createdAt: 'Local demo' },
  ];
  const [users, setUsers] = useState<ManagedUser[]>(() => (isApiPersistenceEnabled ? [] : localDemoManagedUsers));
  const [userDraft, setUserDraft] = useState<UserDraft>(blankUser);
  const [userError, setUserError] = useState<string | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>({ workItemId: state.workItems[0]?.id ?? '', amount: state.workItems[0]?.estimatedPrice ?? 0, notes: '' });

  useEffect(() => {
    if (!isApiPersistenceEnabled) {
      return;
    }

    void userApi.list().then((response) => setUsers(response.users)).catch((error: unknown) => setUserError(error instanceof Error ? error.message : 'Unable to load users.'));
  }, []);

  const selectedWorkItem = state.workItems.find((item) => item.id === invoiceDraft.workItemId);

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserError(null);
    if (!isApiPersistenceEnabled) {
      setUsers((current) => [{ id: `local-${Date.now()}`, role: profileToRole(userDraft.profile), moduleAccess: profileToModules(userDraft.profile), createdAt: 'Local demo', ...userDraft }, ...current]);
      setUserDraft(blankUser);
      return;
    }

    try {
      const response = await userApi.create(userDraft);
      setUsers(response.users);
      setUserDraft(blankUser);
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Unable to create user.');
    }
  };

  const toggleUser = async (managedUser: ManagedUser) => {
    if (!isApiPersistenceEnabled) {
      setUsers((current) => current.map((item) => (item.id === managedUser.id ? { ...item, active: !item.active } : item)));
      return;
    }

    try {
      const response = await userApi.update(managedUser.id, { name: managedUser.name, email: managedUser.email, profile: managedUser.profile, active: !managedUser.active, password: '' });
      setUsers(response.users);
    } catch (error) {
      setUserError(error instanceof Error ? error.message : 'Unable to update user.');
    }
  };

  const submitInvoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createInvoice(invoiceDraft);
    setInvoiceDraft({ workItemId: state.workItems[0]?.id ?? '', amount: state.workItems[0]?.estimatedPrice ?? 0, notes: '' });
  };

  return (
    <section className="admin-grid">
      <section className="section-card">
        <p className="eyebrow">Admin ERP dashboard</p>
        <h2>Business control center</h2>
        <div className="admin-metric-list">
          <MetricCard label="Customers" value={String(state.customers.length)} helper="Customer master records" />
          <MetricCard label="Technicians" value={String(technicians.length)} helper="Repair bench users" />
          <MetricCard label="Invoices" value={String(state.invoices.length)} helper={`${currencyFormatter.format(metrics.invoicedRevenue)} total`} />
          <MetricCard label="Parts" value={String(state.inventoryParts.length)} helper="Inventory SKUs" />
        </div>
      </section>

      <section className="section-card split-section">
        <div>
          <p className="eyebrow">User management</p>
          <h2>Create user</h2>
          <form className="booking-form compact-form" onSubmit={(event) => void submitUser(event)}>
            <label>Name<input required value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} placeholder="New staff or customer" /></label>
            <label>Email<input required type="email" value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} placeholder="name@example.com" /></label>
            <div className="form-row"><label>Profile<select value={userDraft.profile} onChange={(event) => setUserDraft({ ...userDraft, profile: event.target.value as AuthProfile })}>{authProfiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}</select></label><label>Password<input required value={userDraft.password} onChange={(event) => setUserDraft({ ...userDraft, password: event.target.value })} placeholder="Minimum 8 chars" /></label></div>
            <label className="inline-check"><input type="checkbox" checked={userDraft.active} onChange={(event) => setUserDraft({ ...userDraft, active: event.target.checked })} /> Active user</label>
            {userError && <div className="login-error">{userError}</div>}
            <button className="primary-button" type="submit">Create user</button>
          </form>
        </div>
        <div className="table-card">
          <h3>Users</h3>
          {users.map((managedUser) => (
            <div className="table-row" key={managedUser.id}>
              <div><strong>{managedUser.name}</strong><span>{managedUser.email}</span></div>
              <span className="pill">{managedUser.profile}</span>
              <button className={managedUser.active ? 'danger-button' : 'secondary-dark-button'} type="button" onClick={() => void toggleUser(managedUser)} disabled={managedUser.id === currentUser.id}>{managedUser.active ? 'Deactivate' : 'Activate'}</button>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card split-section">
        <div>
          <p className="eyebrow">Invoices & payments</p>
          <h2>Create invoice</h2>
          <form className="booking-form compact-form" onSubmit={submitInvoice}>
            <label>Work item<select value={invoiceDraft.workItemId} onChange={(event) => {
              const item = state.workItems.find((workItem) => workItem.id === event.target.value);
              setInvoiceDraft({ ...invoiceDraft, workItemId: event.target.value, amount: item?.estimatedPrice ?? invoiceDraft.amount });
            }}>{state.workItems.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.customerName} · {item.deviceModel}</option>)}</select></label>
            <label>Amount<input type="number" min="1" value={invoiceDraft.amount} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, amount: Number(event.target.value) })} /></label>
            <label>Notes<textarea value={invoiceDraft.notes} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, notes: event.target.value })} placeholder={selectedWorkItem?.requiredChanges ?? 'Invoice notes'} /></label>
            <button className="primary-button" type="submit">Issue invoice</button>
          </form>
        </div>
        <InvoiceList invoices={state.invoices} updateInvoiceStatus={updateInvoiceStatus} />
      </section>

      <section className="section-card split-section">
        <MasterList title="Customer master" items={state.customers.map((customer) => ({ id: customer.id, primary: customer.name, secondary: `${customer.phone} · ${customer.email}` }))} />
        <MasterList title="Technician master" items={technicians.map((tech) => ({ id: tech.id, primary: tech.name, secondary: `${tech.email} · ${tech.specialties.join(', ')}` }))} />
      </section>
    </section>
  );
}

function AgentView({ state, createWorkItem, updateWorkItem, cancelWorkItem }: DeskActions) {
  const [draft, setDraft] = useState<WorkItemDraft>(blankDraft);
  const [query, setQuery] = useState('');

  const filtered = state.workItems.filter((item) =>
    `${item.id} ${item.customerName} ${item.deviceModel} ${item.status}`.toLowerCase().includes(query.toLowerCase()),
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createWorkItem(draft);
    setDraft(blankDraft);
  };

  return (
    <section className="section-card split-section wide-left">
      <div>
        <p className="eyebrow">Agent module</p>
        <h2>Create a work item</h2>
        <p className="muted">Agents capture online and walk-in customer requests, then assign the WI to a technician.</p>
        <form className="booking-form" onSubmit={submit}>
          <label>Customer name<input required value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} placeholder="Jane Doe" /></label>
          <div className="form-row"><label>Phone<input required value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} placeholder="+1 555 0100" /></label><label>Email<input required type="email" value={draft.customerEmail} onChange={(event) => setDraft({ ...draft, customerEmail: event.target.value })} placeholder="jane@example.com" /></label></div>
          <div className="form-row"><label>Source<select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as WorkItemDraft['source'] })}><option>Walk-in</option><option>Online</option></select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as WorkItemDraft['priority'] })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label></div>
          <div className="form-row"><label>Device type<select value={draft.deviceType} onChange={(event) => setDraft({ ...draft, deviceType: event.target.value as DeviceType })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Assigned technician<select value={draft.assignedTechnicianId} onChange={(event) => setDraft({ ...draft, assignedTechnicianId: event.target.value })}>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}</select></label></div>
          <label>Device model<input required value={draft.deviceModel} onChange={(event) => setDraft({ ...draft, deviceModel: event.target.value })} placeholder="MacBook Pro M2 / iPhone 14 / Gaming PC" /></label>
          <label>Serial number<input value={draft.serialNumber} onChange={(event) => setDraft({ ...draft, serialNumber: event.target.value })} placeholder="Optional serial / IMEI" /></label>
          <label>Issue summary<textarea required value={draft.issueSummary} onChange={(event) => setDraft({ ...draft, issueSummary: event.target.value })} placeholder="Describe symptoms, damage, accessories received, and urgency" /></label>
          <button type="submit" className="primary-button">Create WI</button>
        </form>
      </div>
      <div>
        <div className="section-heading compact"><div><p className="eyebrow">Queue control</p><h2>All work items</h2></div></div>
        <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search WI, customer, device, status" />
        <div className="ticket-board single-column">
          {filtered.map((item) => (
            <WorkItemCard key={item.id} item={item}>
              <div className="card-actions">
                <select value={item.assignedTechnicianId} onChange={(event) => updateWorkItem(item.id, { assignedTechnicianId: event.target.value, status: 'Assigned' }, 'Agent', 'Agent reassigned the work item.')}>
                  {technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
                </select>
                {!terminalStatuses.includes(item.status) && <button type="button" className="danger-button" onClick={() => cancelWorkItem(item.id, 'Agent')}>Cancel</button>}
              </div>
            </WorkItemCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function TechnicianView({ state, selectedTechnicianId, setSelectedTechnicianId, updateWorkItem, adjustInventory }: DeskActions & { selectedTechnicianId: string; setSelectedTechnicianId: (id: string) => void }) {
  const assignedItems = state.workItems.filter((item) => item.assignedTechnicianId === selectedTechnicianId && item.status !== 'Cancelled');

  return (
    <section className="section-card">
      <div className="section-heading">
        <div><p className="eyebrow">Technician module</p><h2>Analysis, estimates, and repair updates</h2></div>
        <label className="filter-control">Technician<select value={selectedTechnicianId} onChange={(event) => setSelectedTechnicianId(event.target.value)}>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}</select></label>
      </div>
      <div className="ticket-board">
        {assignedItems.map((item) => <TechnicianWorkItem key={item.id} item={item} parts={state.inventoryParts} updateWorkItem={updateWorkItem} adjustInventory={adjustInventory} />)}
      </div>
    </section>
  );
}

function TechnicianWorkItem({ item, parts, updateWorkItem, adjustInventory }: { item: WorkItem; parts: InventoryPart[]; updateWorkItem: DeskActions['updateWorkItem']; adjustInventory: DeskActions['adjustInventory'] }) {
  const [analysis, setAnalysis] = useState(item.analysis);
  const [requiredChanges, setRequiredChanges] = useState(item.requiredChanges);
  const [estimatedPrice, setEstimatedPrice] = useState(String(item.estimatedPrice));
  const [status, setStatus] = useState<WorkItemStatus>(item.status);
  const [promisedBy, setPromisedBy] = useState(item.promisedBy);
  const [partSku, setPartSku] = useState(parts[0]?.sku ?? '');

  const save = () => {
    const selectedParts = partSku ? Array.from(new Set([...item.partsRequired, partSku])) : item.partsRequired;
    updateWorkItem(item.id, { analysis, requiredChanges, estimatedPrice: Number(estimatedPrice) || 0, status, promisedBy, partsRequired: selectedParts }, 'Technician', `Technician updated status to ${status}.`);
  };

  const consumePart = () => {
    if (!partSku) return;
    adjustInventory(partSku, -1);
    updateWorkItem(item.id, { partsRequired: Array.from(new Set([...item.partsRequired, partSku])) }, 'Technician', `Technician consumed inventory part ${partSku}.`);
  };

  return (
    <article className="ticket-card editor-card">
      <WorkItemCard item={item} />
      <label>Analysis<textarea value={analysis} onChange={(event) => setAnalysis(event.target.value)} /></label>
      <label>Required changes<textarea value={requiredChanges} onChange={(event) => setRequiredChanges(event.target.value)} /></label>
      <div className="form-row"><label>Estimate<input type="number" value={estimatedPrice} onChange={(event) => setEstimatedPrice(event.target.value)} /></label><label>Promised by<input value={promisedBy} onChange={(event) => setPromisedBy(event.target.value)} /></label></div>
      <div className="form-row"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as WorkItemStatus)}>{getNextStatuses(item.status).map((value) => <option key={value}>{value}</option>)}</select></label><label>Part<select value={partSku} onChange={(event) => setPartSku(event.target.value)}>{parts.map((part) => <option value={part.sku} key={part.sku}>{part.name} ({part.quantity})</option>)}</select></label></div>
      <div className="card-actions"><button type="button" className="primary-button" onClick={save}>Save technician update</button><button type="button" className="secondary-dark-button" onClick={consumePart}>Use part</button></div>
    </article>
  );
}

function CustomerView({ state, approveEstimate }: DeskActions) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(state.customers[0]?.id ?? '');
  const customerItems = state.workItems.filter((item) => item.customerId === selectedCustomerId);

  return (
    <section className="section-card">
      <div className="section-heading">
        <div><p className="eyebrow">Customer module</p><h2>Realtime repair progress</h2></div>
        <label className="filter-control">Customer<select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>{state.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
      </div>
      <div className="ticket-board">
        {customerItems.map((item) => (
          <article className="ticket-card" key={item.id}>
            <WorkItemCard item={item} />
            {item.status === 'Estimate Shared' && !item.approvedByCustomer && <button type="button" className="primary-button" onClick={() => approveEstimate(item.id)}>Approve estimate</button>}
            <ProgressTracker status={item.status} />
            <h3>Live updates</h3>
            <ul className="timeline">{item.updates.map((update) => <li key={update.id}><strong>{update.actor}</strong> · {update.message}<span>{update.at}</span></li>)}</ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkItemCard({ item, children }: { item: WorkItem; children?: React.ReactNode }) {
  const technician = technicians.find((tech) => tech.id === item.assignedTechnicianId);
  return (
    <article className="workitem-summary">
      <div className="ticket-header"><strong>{item.id}</strong><span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span></div>
      <h3>{item.deviceModel}</h3>
      <p>{item.issueSummary}</p>
      <dl>
        <div><dt>Customer</dt><dd>{item.customerName}</dd></div><div><dt>Source</dt><dd>{item.source}</dd></div><div><dt>Priority</dt><dd>{item.priority}</dd></div><div><dt>Technician</dt><dd>{technician?.name ?? 'Unassigned'}</dd></div><div><dt>Estimate</dt><dd>{currencyFormatter.format(item.estimatedPrice)}</dd></div><div><dt>Promised</dt><dd>{item.promisedBy}</dd></div><div><dt>Serial</dt><dd>{item.serialNumber}</dd></div><div><dt>Parts</dt><dd>{item.partsRequired.length ? item.partsRequired.join(', ') : 'None yet'}</dd></div>
      </dl>
      <p><strong>Analysis:</strong> {item.analysis}</p>
      <p><strong>Changes:</strong> {item.requiredChanges}</p>
      {children}
    </article>
  );
}

function InventoryView({ state, adjustInventory, addInventoryPart, reset, canManage, canReset }: DeskActions & { canManage: boolean; canReset: boolean }) {
  const [part, setPart] = useState<InventoryPart>(blankPart);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addInventoryPart({ ...part, sku: part.sku.toUpperCase(), compatibleWith: [part.compatibleWith[0] ?? 'Laptop'] });
    setPart(blankPart);
  };

  return (
    <section className="section-card split-section">
      <div>
        <p className="eyebrow">Inventory</p><h2>Spare parts readiness</h2>
        {canManage ? (
          <form className="booking-form compact-form" onSubmit={submit}>
            <label>SKU<input required value={part.sku} onChange={(event) => setPart({ ...part, sku: event.target.value })} placeholder="BAT-MBP-2024" /></label>
            <label>Name<input required value={part.name} onChange={(event) => setPart({ ...part, name: event.target.value })} placeholder="MacBook Battery" /></label>
            <div className="form-row"><label>Device<select value={part.compatibleWith[0]} onChange={(event) => setPart({ ...part, compatibleWith: [event.target.value as DeviceType] })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Quantity<input type="number" value={part.quantity} onChange={(event) => setPart({ ...part, quantity: Number(event.target.value) })} /></label></div>
            <div className="form-row"><label>Reorder at<input type="number" value={part.reorderLevel} onChange={(event) => setPart({ ...part, reorderLevel: Number(event.target.value) })} /></label><label>Cost<input type="number" value={part.unitCost} onChange={(event) => setPart({ ...part, unitCost: Number(event.target.value) })} /></label></div>
            <div className="card-actions"><button className="primary-button" type="submit">Add / update part</button>{canReset && <button className="secondary-dark-button" type="button" onClick={reset}>Reset demo data</button>}</div>
          </form>
        ) : <p className="muted">Technicians can view and consume parts. Agents/admins manage part records.</p>}
      </div>
      <div className="inventory-list">
        {state.inventoryParts.map((inventoryPart) => {
          const lowStock = inventoryPart.quantity <= inventoryPart.reorderLevel;
          return (
            <article className="inventory-row" key={inventoryPart.sku}>
              <div><strong>{inventoryPart.name}</strong><span>{inventoryPart.sku} · {inventoryPart.compatibleWith.join(', ')}</span></div>
              <div className="inventory-meta"><span className={lowStock ? 'stock-low' : 'stock-ok'}>{inventoryPart.quantity} in stock</span><small>Reorder at {inventoryPart.reorderLevel} · Cost {currencyFormatter.format(inventoryPart.unitCost)}</small></div>
              <div className="stepper"><button type="button" onClick={() => adjustInventory(inventoryPart.sku, -1)}>-</button><button type="button" onClick={() => adjustInventory(inventoryPart.sku, 1)}>+</button></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function InvoiceList({ invoices, updateInvoiceStatus }: { invoices: DeskActions['state']['invoices']; updateInvoiceStatus: DeskActions['updateInvoiceStatus'] }) {
  return (
    <div className="table-card">
      <h3>Invoice register</h3>
      {invoices.map((invoice) => (
        <div className="table-row" key={invoice.id}>
          <div><strong>{invoice.id} · {invoice.customerName}</strong><span>{invoice.workItemId} · {currencyFormatter.format(invoice.amount)} · {invoice.issuedAt}</span></div>
          <select value={invoice.status} onChange={(event) => updateInvoiceStatus(invoice.id, event.target.value as InvoiceStatus)}>
            {(['Draft', 'Issued', 'Paid', 'Void'] satisfies InvoiceStatus[]).map((status) => <option key={status}>{status}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function MasterList({ title, items }: { title: string; items: Array<{ id: string; primary: string; secondary: string }> }) {
  return <div className="table-card"><h3>{title}</h3>{items.map((item) => <div className="table-row" key={item.id}><div><strong>{item.primary}</strong><span>{item.id} · {item.secondary}</span></div></div>)}</div>;
}

function profileToRole(profile: AuthProfile) {
  return profile === 'admin' ? 'Admin' : profile === 'technician' ? 'Technician' : profile === 'customer' ? 'Customer' : 'Agent';
}

function profileToModules(profile: AuthProfile): ModuleId[] {
  return profile === 'admin' ? ['admin', 'agent', 'technician', 'customer'] : [profile];
}

function Feature({ title, body }: { title: string; body: string }) {
  return <article className="feature-item"><strong>{title}</strong><span>{body}</span></article>;
}

type DeskActions = ReturnType<typeof useServiceDesk>;

function SyncStatus({
  isApiBacked,
  isLoading,
  error,
  onRefresh,
}: {
  isApiBacked: boolean;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="sync-banner" aria-live="polite">
      <span>{isApiBacked ? 'PostgreSQL API persistence enabled' : 'Local demo persistence enabled'}</span>
      {isLoading && <strong>Loading latest data…</strong>}
      {error && <strong className="sync-error">{error}</strong>}
      {isApiBacked && <button type="button" className="secondary-dark-button" onClick={() => void onRefresh()}>Refresh</button>}
    </section>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><p>{helper}</p></article>;
}

export default App;
