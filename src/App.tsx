import { useEffect, useId, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ProgressTracker } from './components/ProgressTracker';
import { ToastStack } from './components/ToastStack';
import { serviceCategories, technicians } from './data/repairShop';
import {
  authProfiles,
  currencyFormatter,
  defaultModuleForProfile,
  deviceTypes,
  moduleLabels,
  priorities,
  statusFlow,
  terminalStatuses,
} from './domain/constants';
import { useAuth } from './hooks/useAuth';
import { useServiceDesk } from './hooks/useServiceDesk';
import { useToast } from './hooks/useToast';
import type { ToastTone } from './hooks/useToast';
import { getInitialModuleFromUrl, getOrCreateSessionId, updateUrlForModule } from './services/routing';
import { getMetrics, getNextStatuses } from './services/serviceDeskStore';
import { exportApi, isApiPersistenceEnabled, userApi } from './services/apiClient';
import type {
  AuthProfile,
  AuthUser,
  DeviceType,
  Invoice,
  InventoryPart,
  InvoiceDraft,
  InvoicePaymentDraft,
  InvoiceStatus,
  ManagedUser,
  ModuleId,
  PaymentMethod,
  ReportEntity,
  SavedReport,
  SavedReportDraft,
  UserDraft,
  UserRole,
  WorkItem,
  WorkItemDraft,
  WorkItemStatus,
} from './types';

const paymentMethods: PaymentMethod[] = ['Cash', 'Card (Test Mode)', 'Bank Transfer', 'UPI (Test Mode)'];

const reportEntityLabels: Record<ReportEntity, string> = {
  workItems: 'Work items',
  invoices: 'Invoices',
  customers: 'Customers',
  inventory: 'Inventory',
};

const reportColumnOptions: Record<ReportEntity, string[]> = {
  workItems: ['id', 'customerName', 'deviceModel', 'status', 'priority', 'assignedTechnicianId', 'estimatedPrice', 'promisedBy'],
  invoices: ['id', 'customerName', 'amount', 'laborAmount', 'partsAmount', 'diagnosticFee', 'status', 'issuedAt', 'paymentMethod'],
  customers: ['id', 'name', 'phone', 'email'],
  inventory: ['sku', 'name', 'quantity', 'reorderLevel', 'unitCost'],
};

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

const moduleIcons: Record<ModuleId, string> = {
  admin: '⚙️',
  agent: '🧾',
  technician: '🛠️',
  customer: '📱',
};

interface NavItem {
  id: string;
  label: string;
  children?: NavItem[];
}

const navConfigs: Record<ModuleId, NavItem[]> = {
  admin: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'people', label: 'People', children: [
      { id: 'users', label: 'Users' },
      { id: 'customers', label: 'Customers' },
      { id: 'technicians', label: 'Technicians' },
    ] },
    { id: 'inventory', label: 'Inventory' },
    { id: 'workitems', label: 'Work Items', children: [
      { id: 'wi-all', label: 'All Work Items' },
      { id: 'wi-board', label: 'Board' },
      { id: 'wi-walkins', label: 'Walk-ins' },
    ] },
    { id: 'invoices', label: 'Invoices' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'reports', label: 'Export Reports' },
  ],
  agent: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'workitems', label: 'Work Items', children: [
      { id: 'queue', label: 'All Work Items' },
      { id: 'board', label: 'Board' },
      { id: 'walkins', label: 'Walk-ins' },
    ] },
    { id: 'inventory', label: 'Inventory' },
  ],
  technician: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'myjobs', label: 'My Jobs', children: [
      { id: 'assigned', label: 'Assigned' },
      { id: 'estimates', label: 'Estimates' },
      { id: 'repair', label: 'In Repair' },
    ] },
    { id: 'parts', label: 'Parts' },
  ],
  customer: [
    { id: 'repairs', label: 'My Repairs' },
  ],
};

const firstLeafId = (items: NavItem[]): string => (items[0].children ? firstLeafId(items[0].children) : items[0].id);

type ThemeMode = 'light' | 'dark';

const getInitialTheme = (): ThemeMode => {
  const savedTheme = localStorage.getItem('service-desk-theme');

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

function App() {
  const [sessionId] = useState(getOrCreateSessionId);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const initialModule = getInitialModuleFromUrl();
  const auth = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId | null>(() => {
    if (!auth.user) {
      return null;
    }

    return initialModule && auth.user.moduleAccess.includes(initialModule) ? initialModule : defaultModuleForProfile(auth.user.profile);
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('service-desk-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === 'light' ? 'dark' : 'light'));

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
    return <HomePage auth={auth} theme={theme} onThemeToggle={toggleTheme} onLoginSuccess={handleLoginSuccess} />;
  }

  return <Workspace user={auth.user} activeModule={activeModule} theme={theme} onThemeToggle={toggleTheme} onModuleChange={handleModuleChange} onLogout={handleLogout} />;
}

function HomePage({
  auth,
  theme,
  onThemeToggle,
  onLoginSuccess,
}: {
  auth: ReturnType<typeof useAuth>;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onLoginSuccess: (user: AuthUser) => void;
}) {
  const [email, setEmail] = useState('admin@servicedesk.local');
  const [password, setPassword] = useState('Admin@12345');

  const performLogin = async (loginEmail: string, loginPassword: string) => {
    const user = await auth.login(loginEmail, loginPassword);
    onLoginSuccess(user);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await performLogin(email, password);
  };

  const loginWithCredential = async (credential: (typeof demoCredentials)[number]) => {
    setEmail(credential.email);
    setPassword(credential.password);
    await performLogin(credential.email, credential.password);
  };

  return (
    <main className="public-shell">
      <nav className="public-nav" aria-label="Homepage navigation">
        <div className="brand"><div className="brand-mark">SD</div><span>{appName}</span></div>
        <div className="public-links"><a href="#features">Features</a><a href="#login">Login</a><a href={`mailto:${supportEmail}`}>Contact</a><ThemeToggle theme={theme} onToggle={onThemeToggle} /></div>
      </nav>

      <section className="homepage-hero">
        <div className="homepage-copy">
          <p className="eyebrow">Full-stack repair ERP</p>
          <h1>Repair shop operations, built like a real business app.</h1>
          <p>
            {appName} manages repair requests, technicians, estimates, inventory, customer progress,
            staff accounts, invoices, and reports — all in one place, running on your own server.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#login">Open application</a>
            <a className="secondary-link" href={`tel:${supportPhone}`}>Call {supportPhone}</a>
          </div>
          <div className="creator-preview" aria-label="Application preview">
            <div className="preview-sidebar"><span /><span /><span /></div>
            <div className="preview-content">
              <div className="preview-toolbar" />
              <div className="preview-grid"><span /><span /><span /><span /></div>
              <div className="preview-table"><span /><span /><span /><span /></div>
            </div>
          </div>
        </div>

        <aside className="login-panel" id="login" aria-label="Login panel">
          <p className="eyebrow">Secure workspace</p>
          <h2>Login to your module</h2>
          <p className="muted">Secure login with staff accounts and sessions. Demo accounts are ready to try below.</p>
          <form className="login-form" onSubmit={(event) => void submit(event)}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
            {auth.authError && <div className="login-error">{auth.authError}</div>}
            <button className="primary-button full-width" type="submit" disabled={auth.isAuthenticating}>{auth.isAuthenticating ? 'Logging in…' : 'Login securely'}</button>
          </form>
          <div className="credential-grid" aria-label="Demo credentials">
            {demoCredentials.map((credential) => (
              <button className="credential-card" type="button" key={credential.email} onClick={() => void loginWithCredential(credential)}>
                <strong>{credential.label}</strong>
                <span>{credential.email}</span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="feature-band" id="features">
        <Feature title="Organized like a real business app" body="Modules, reports, forms, record lists, and detail panels instead of a single dashboard." />
        <Feature title="Role-based access" body="Admin sees every module; Agent, Technician, and Customer see only their permitted workspace." />
        <Feature title="Everything in one place" body="Customers, work items, invoices, inventory, and staff accounts stay in sync automatically." />
        <Feature title="Deploy anywhere" body="Runs as a single service you can host wherever you like." />
        <Feature title="You own your data" body="Self-hosted on your own database — no forced vendor migration and no lock-in to switch away from." />
        <Feature title="No surprise price hikes" body="Priced by your own infrastructure cost, not a per-seat subscription that can double overnight." />
      </section>
    </main>
  );
}

function Workspace({
  user,
  activeModule,
  theme,
  onThemeToggle,
  onModuleChange,
  onLogout,
}: {
  user: AuthUser;
  activeModule: ModuleId;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onModuleChange: (moduleId: ModuleId) => void;
  onLogout: () => Promise<void>;
}) {
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('tech-arun');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const serviceDesk = useServiceDesk();
  const { state } = serviceDesk;
  const metrics = getMetrics(state);
  const toast = useToast();

  const activeLabel = moduleLabels[activeModule];
  const navItems = navConfigs[activeModule];
  const [activeView, setActiveView] = useState<string>(() => firstLeafId(navItems));
  const [lastModule, setLastModule] = useState(activeModule);

  if (lastModule !== activeModule) {
    setLastModule(activeModule);
    setActiveView(firstLeafId(navItems));
  }

  const changeModule = (moduleId: ModuleId) => {
    onModuleChange(moduleId);
    setMobileNavOpen(false);
  };

  const navigate = (id: string) => {
    setActiveView(id);
    setMobileNavOpen(false);
  };

  const isDashboard = activeView === 'dashboard';

  return (
    <main className="creator-shell">
      {mobileNavOpen && <div className="nav-overlay" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />}
      <aside className={mobileNavOpen ? 'creator-sidebar nav-open' : 'creator-sidebar'}>
        <div className="brand app-brand"><div className="brand-mark">SD</div><span>{appName}</span></div>
        <div className="sidebar-section">
          <span className="sidebar-label">Modules</span>
          {user.moduleAccess.map((moduleId) => (
            <button className={moduleId === activeModule ? 'nav-item active' : 'nav-item'} key={moduleId} onClick={() => changeModule(moduleId)} type="button">
              <span>{moduleIcons[moduleId]}</span>
              {moduleLabels[moduleId]} module
            </button>
          ))}
        </div>
        {navItems.length > 1 && (
          <div className="sidebar-section">
            <span className="sidebar-label">{activeLabel} sections</span>
            <SidebarNav items={navItems} activeView={activeView} onNavigate={navigate} />
          </div>
        )}
      </aside>

      <section className="creator-main">
        <header className="creator-topbar">
          <div className="topbar-heading">
            <button
              type="button"
              className="mobile-nav-toggle"
              aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? '✕' : '☰'}
            </button>
            <h1 className="topbar-crumb">{activeLabel} workspace</h1>
          </div>
          <div className="user-menu">
            <span>{user.name}</span>
            <small>{user.role}</small>
            <div className="topbar-actions"><ThemeToggle theme={theme} onToggle={onThemeToggle} /><button type="button" className="secondary-button" onClick={() => void onLogout()}>Logout</button></div>
          </div>
        </header>

        <SyncStatus isApiBacked={serviceDesk.isApiBacked} isLoading={serviceDesk.isLoading} error={serviceDesk.error} onRefresh={serviceDesk.refresh} />

        {activeModule !== 'customer' && isDashboard && (
          <section className="creator-kpi-row" aria-label="Operational metrics">
            <MetricCard label="Active WIs" value={String(metrics.activeWorkItems)} helper="Open repair jobs" />
            <MetricCard label="Awaiting approval" value={String(metrics.awaitingApproval)} helper="Estimate decisions" />
            <MetricCard label="Stock alerts" value={String(metrics.lowStockParts)} helper="Low inventory SKUs" />
            <MetricCard label="Paid revenue" value={currencyFormatter.format(metrics.paidRevenue)} helper={`${currencyFormatter.format(metrics.invoicedRevenue)} invoiced`} />
          </section>
        )}

        <section className="creator-page">
          {activeModule === 'admin' && <AdminView {...serviceDesk} currentUser={user} activeView={activeView} pushToast={toast.push} />}
          {activeModule === 'agent' && <AgentView {...serviceDesk} activeView={activeView} pushToast={toast.push} />}
          {activeModule === 'technician' && (
            <TechnicianView
              selectedTechnicianId={selectedTechnicianId}
              setSelectedTechnicianId={setSelectedTechnicianId}
              activeView={activeView}
              pushToast={toast.push}
              {...serviceDesk}
            />
          )}
          {activeModule === 'customer' && <CustomerView {...serviceDesk} pushToast={toast.push} />}
        </section>
      </section>
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </main>
  );
}

function SidebarNav({ items, activeView, onNavigate }: { items: NavItem[]; activeView: string; onNavigate: (id: string) => void }) {
  return (
    <>
      {items.map((item) => {
        const isParentActive = item.id === activeView || (item.children?.some((child) => child.id === activeView) ?? false);
        return (
          <div className="sidebar-nav-group" key={item.id}>
            <button
              type="button"
              className={isParentActive ? 'nav-item active' : 'nav-item'}
              onClick={() => onNavigate(item.children ? item.children[0].id : item.id)}
            >
              {item.label}
            </button>
            {item.children && isParentActive && (
              <div className="sidebar-subnav">
                {item.children.map((child) => (
                  <button type="button" key={child.id} className={child.id === activeView ? 'nav-subitem active' : 'nav-subitem'} onClick={() => onNavigate(child.id)}>
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

const blankInvoiceDraft = (item?: WorkItem): InvoiceDraft => ({
  workItemId: item?.id ?? '',
  amount: item?.estimatedPrice ?? 0,
  laborAmount: item?.laborEstimate ?? 0,
  partsAmount: item?.partsEstimate ?? 0,
  diagnosticFee: item?.diagnosticFee ?? 0,
  notes: '',
});

function AdminView(props: DeskActions & { currentUser: AuthUser; activeView: string; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const { state, createInvoice, updateInvoiceStatus, recordInvoicePayment, createSavedReport, deleteSavedReport, createWorkItem, updateWorkItem, cancelWorkItem, notifyCustomerNow, currentUser, activeView, pushToast } = props;
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
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(() => blankInvoiceDraft(state.workItems[0]));
  const [selectedDeviceType, setSelectedDeviceType] = useState<DeviceType | 'All'>('All');

  const visibleCategories = useMemo(
    () => serviceCategories.filter((category) => selectedDeviceType === 'All' || category.deviceType === selectedDeviceType),
    [selectedDeviceType],
  );

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
      pushToast(`Created user ${userDraft.name || userDraft.email}.`);
      return;
    }

    try {
      const response = await userApi.create(userDraft);
      setUsers(response.users);
      setUserDraft(blankUser);
      pushToast(`Created user ${userDraft.name || userDraft.email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create user.';
      setUserError(message);
      pushToast(message, 'error');
    }
  };

  const toggleUser = async (managedUser: ManagedUser) => {
    if (managedUser.active && !window.confirm(`Deactivate ${managedUser.name}? They will immediately lose access to their module.`)) {
      return;
    }

    if (!isApiPersistenceEnabled) {
      setUsers((current) => current.map((item) => (item.id === managedUser.id ? { ...item, active: !item.active } : item)));
      pushToast(`${managedUser.active ? 'Deactivated' : 'Activated'} ${managedUser.name}.`);
      return;
    }

    try {
      const response = await userApi.update(managedUser.id, { name: managedUser.name, email: managedUser.email, profile: managedUser.profile, active: !managedUser.active, password: '' });
      setUsers(response.users);
      pushToast(`${managedUser.active ? 'Deactivated' : 'Activated'} ${managedUser.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update user.';
      setUserError(message);
      pushToast(message, 'error');
    }
  };

  const invoiceTotal = invoiceDraft.laborAmount + invoiceDraft.partsAmount + invoiceDraft.diagnosticFee || invoiceDraft.amount;

  const submitInvoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createInvoice(invoiceDraft);
    setInvoiceDraft(blankInvoiceDraft(state.workItems[0]));
    pushToast(`Invoice issued for ${currencyFormatter.format(invoiceTotal)}.`);
  };

  const changeInvoiceStatus = (invoiceId: string, status: InvoiceStatus) => {
    if (status === 'Void' && !window.confirm('Void this invoice? This cannot be undone.')) {
      return;
    }

    updateInvoiceStatus(invoiceId, status);
    pushToast(`Invoice ${invoiceId} marked ${status}.`);
  };

  const submitPayment = (invoiceId: string, payment: InvoicePaymentDraft) => {
    recordInvoicePayment(invoiceId, payment);
    pushToast(`Payment recorded for ${invoiceId} via ${payment.method}.`);
  };

  return (
    <ModuleFrame title="Admin control center" subtitle="Creator-style reports and forms for user administration, master data, billing, and business monitoring.">
      {activeView === 'dashboard' && (
        <div className="creator-page">
          <div className="creator-report-grid">
            <MetricCard label="Customers" value={String(state.customers.length)} helper="Customer master records" />
            <MetricCard label="Technicians" value={String(technicians.length)} helper="Repair bench users" />
            <MetricCard label="Invoices" value={String(state.invoices.length)} helper={`${currencyFormatter.format(metrics.invoicedRevenue)} total`} />
            <MetricCard label="Parts" value={String(state.inventoryParts.length)} helper="Inventory SKUs" />
          </div>
          <div className="creator-record-grid">
            <RecordTable
              title="Recent work items"
              rows={state.workItems.slice(0, 6).map((item) => ({ id: item.id, primary: item.deviceModel, secondary: `${item.customerName} · ${item.status}`, meta: currencyFormatter.format(item.estimatedPrice) }))}
            />
            <RecordTable
              title="Low stock alerts"
              rows={state.inventoryParts.filter((part) => part.quantity <= part.reorderLevel).map((part) => ({ id: part.sku, primary: part.name, secondary: `${part.quantity} available · reorder at ${part.reorderLevel}`, meta: currencyFormatter.format(part.unitCost) }))}
            />
          </div>
        </div>
      )}

      {activeView === 'users' && (
        <CreatorSplit>
          <CreatorFormCard title="Create user" eyebrow="User form">
            <form className="creator-form" onSubmit={(event) => void submitUser(event)}>
              <label>Name<input required value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} placeholder="New staff or customer" /></label>
              <label>Email<input required type="email" value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} placeholder="name@example.com" /></label>
              <div className="form-row"><label>Profile<select value={userDraft.profile} onChange={(event) => setUserDraft({ ...userDraft, profile: event.target.value as AuthProfile })}>{authProfiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}</select></label><label>Password<input required type="password" minLength={8} value={userDraft.password} onChange={(event) => setUserDraft({ ...userDraft, password: event.target.value })} placeholder="Minimum 8 chars" /></label></div>
              <label className="inline-check"><input type="checkbox" checked={userDraft.active} onChange={(event) => setUserDraft({ ...userDraft, active: event.target.checked })} /> Active user</label>
              {userError && <div className="login-error">{userError}</div>}
              <button className="primary-button" type="submit">Create user</button>
            </form>
          </CreatorFormCard>
          <div className="creator-list-panel">
            <ListHeader title="Users report" count={users.length} />
            {users.map((managedUser) => (
              <div className="record-row" key={managedUser.id}>
                <div><strong>{managedUser.name}</strong><span>{managedUser.email}</span></div>
                <span className="pill">{managedUser.profile}</span>
                <button className={managedUser.active ? 'danger-button' : 'secondary-dark-button'} type="button" onClick={() => void toggleUser(managedUser)} disabled={managedUser.id === currentUser.id}>{managedUser.active ? 'Deactivate' : 'Activate'}</button>
              </div>
            ))}
          </div>
        </CreatorSplit>
      )}

      {activeView === 'customers' && (
        <>
          <div className="card-actions"><button type="button" className="secondary-dark-button" onClick={() => {
            if (isApiPersistenceEnabled) {
              void exportApi.customersCsv().catch((error: unknown) => pushToast(error instanceof Error ? error.message : 'Export failed.', 'error'));
              return;
            }
            exportCustomersCsvLocally(state);
          }}>Export CSV</button></div>
          <RecordTable title="Customer master" rows={state.customers.map((customer) => ({ id: customer.id, primary: customer.name, secondary: `${customer.phone} · ${customer.email}`, meta: `${state.workItems.filter((item) => item.customerId === customer.id).length} repairs` }))} />
        </>
      )}
      {activeView === 'technicians' && <RecordTable title="Technician master" rows={technicians.map((tech) => ({ id: tech.id, primary: tech.name, secondary: `${tech.email} · ${tech.specialties.join(', ')}`, meta: `${state.workItems.filter((item) => item.assignedTechnicianId === tech.id && !terminalStatuses.includes(item.status)).length} active` }))} />}

      {activeView === 'invoices' && (
        <CreatorSplit>
          <CreatorFormCard title="Create invoice" eyebrow="Invoice form">
            <form className="creator-form" onSubmit={submitInvoice}>
              <label>Work item<select value={invoiceDraft.workItemId} onChange={(event) => {
                const item = state.workItems.find((workItem) => workItem.id === event.target.value);
                setInvoiceDraft(blankInvoiceDraft(item));
              }}>{state.workItems.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.customerName} · {item.deviceModel}</option>)}</select></label>
              <div className="form-row">
                <label>Labor<input type="number" min="0" value={invoiceDraft.laborAmount} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, laborAmount: Number(event.target.value) })} /></label>
                <label>Parts<input type="number" min="0" value={invoiceDraft.partsAmount} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, partsAmount: Number(event.target.value) })} /></label>
              </div>
              <label>Diagnostic fee<input type="number" min="0" value={invoiceDraft.diagnosticFee} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, diagnosticFee: Number(event.target.value) })} /></label>
              <p className="cost-breakdown"><span>Total <strong>{currencyFormatter.format(invoiceTotal)}</strong></span></p>
              <label>Notes<textarea value={invoiceDraft.notes} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, notes: event.target.value })} placeholder={selectedWorkItem?.requiredChanges ?? 'Invoice notes'} /></label>
              <button className="primary-button" type="submit">Issue invoice</button>
            </form>
          </CreatorFormCard>
          <InvoiceList invoices={state.invoices} updateInvoiceStatus={changeInvoiceStatus} recordPayment={submitPayment} pushToast={pushToast} />
        </CreatorSplit>
      )}

      {activeView === 'inventory' && <InventoryView {...props} canManage canReset pushToast={pushToast} />}

      {activeView === 'wi-board' && <KanbanBoard workItems={state.workItems} updateWorkItem={updateWorkItem} pushToast={pushToast} />}

      {(activeView === 'wi-all' || activeView === 'wi-walkins') && (
        <WorkItemsSection
          subView={activeView === 'wi-walkins' ? 'walkins' : 'all'}
          actorRole="Admin"
          state={state}
          createWorkItem={createWorkItem}
          updateWorkItem={updateWorkItem}
          cancelWorkItem={cancelWorkItem}
          notifyCustomerNow={notifyCustomerNow}
          pushToast={pushToast}
        />
      )}

      {activeView === 'catalog' && (
        <ServiceCatalog selectedDeviceType={selectedDeviceType} setSelectedDeviceType={setSelectedDeviceType} visibleCategories={visibleCategories} />
      )}

      {activeView === 'notifications' && <NotificationLog notifications={state.notifications} />}

      {activeView === 'reports' && (
        <ReportBuilder
          state={state}
          savedReports={state.savedReports}
          createSavedReport={(draft) => createSavedReport(draft, currentUser.id)}
          deleteSavedReport={deleteSavedReport}
          pushToast={pushToast}
        />
      )}
    </ModuleFrame>
  );
}

function AgentView(props: DeskActions & { activeView: string; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const { state, updateWorkItem, cancelWorkItem, createWorkItem, notifyCustomerNow, activeView, pushToast } = props;

  return (
    <ModuleFrame title="Agent desk" subtitle="Create customer requests and manage the repair queue using form and report views.">
      {activeView === 'dashboard' && (
        <div className="creator-record-grid">
          <RecordTable
            title="Recent work items"
            rows={state.workItems.slice(0, 6).map((item) => ({ id: item.id, primary: item.deviceModel, secondary: `${item.customerName} · ${item.status}`, meta: currencyFormatter.format(item.estimatedPrice) }))}
          />
          <RecordTable
            title="Low stock alerts"
            rows={state.inventoryParts.filter((part) => part.quantity <= part.reorderLevel).map((part) => ({ id: part.sku, primary: part.name, secondary: `${part.quantity} available · reorder at ${part.reorderLevel}`, meta: currencyFormatter.format(part.unitCost) }))}
          />
        </div>
      )}
      {activeView === 'inventory' && <InventoryView {...props} canManage canReset={false} />}
      {activeView === 'board' && <KanbanBoard workItems={state.workItems} updateWorkItem={updateWorkItem} pushToast={pushToast} />}
      {(activeView === 'queue' || activeView === 'walkins') && (
        <WorkItemsSection
          subView={activeView === 'walkins' ? 'walkins' : 'all'}
          actorRole="Agent"
          state={state}
          createWorkItem={createWorkItem}
          updateWorkItem={updateWorkItem}
          cancelWorkItem={cancelWorkItem}
          notifyCustomerNow={notifyCustomerNow}
          pushToast={pushToast}
        />
      )}
    </ModuleFrame>
  );
}

function WorkItemsSection({
  subView,
  actorRole,
  state,
  createWorkItem,
  updateWorkItem,
  cancelWorkItem,
  notifyCustomerNow,
  pushToast,
}: {
  subView: 'all' | 'walkins';
  actorRole: UserRole;
  state: DeskActions['state'];
  createWorkItem: DeskActions['createWorkItem'];
  updateWorkItem: DeskActions['updateWorkItem'];
  cancelWorkItem: DeskActions['cancelWorkItem'];
  notifyCustomerNow: DeskActions['notifyCustomerNow'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draft, setDraft] = useState<WorkItemDraft>(blankDraft);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(state.workItems[0]?.id ?? '');

  const filtered = state.workItems.filter((item) =>
    `${item.id} ${item.customerName} ${item.deviceModel} ${item.status}`.toLowerCase().includes(query.toLowerCase()),
  );
  const list = subView === 'walkins' ? filtered.filter((item) => item.source === 'Walk-in') : filtered;
  const selected = state.workItems.find((item) => item.id === selectedId) ?? list[0];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createWorkItem(draft);
    pushToast(<>Created work item for <strong>{draft.customerName}</strong> · <strong>{draft.deviceModel}</strong>.</>);
    setDraft(blankDraft);
    setShowCreateForm(false);
  };

  const cancelItem = (workItemId: string) => {
    if (!window.confirm('Cancel this work item? The customer will be notified and this cannot be undone.')) {
      return;
    }

    cancelWorkItem(workItemId, actorRole);
    pushToast('Work item cancelled.');
  };

  if (showCreateForm) {
    return (
      <CreatorSplit>
        <CreatorFormCard title="Create a work item" eyebrow="Request form">
          <p className="muted">Capture online and walk-in customer requests, then assign the WI to a technician.</p>
          <form className="creator-form" onSubmit={submit}>
            <label>Customer name<input required value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} placeholder="Jane Doe" /></label>
            <div className="form-row"><label>Phone<input required value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} placeholder="+1 555 0100" /></label><label>Email<input required type="email" value={draft.customerEmail} onChange={(event) => setDraft({ ...draft, customerEmail: event.target.value })} placeholder="jane@example.com" /></label></div>
            <div className="form-row"><label>Source<select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as WorkItemDraft['source'] })}><option>Walk-in</option><option>Online</option></select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as WorkItemDraft['priority'] })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label></div>
            <div className="form-row"><label>Device type<select value={draft.deviceType} onChange={(event) => setDraft({ ...draft, deviceType: event.target.value as DeviceType })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Assigned technician<select value={draft.assignedTechnicianId} onChange={(event) => setDraft({ ...draft, assignedTechnicianId: event.target.value })}>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}</select></label></div>
            <label>Device model<input required value={draft.deviceModel} onChange={(event) => setDraft({ ...draft, deviceModel: event.target.value })} placeholder="MacBook Pro M2 / iPhone 14 / Gaming PC" /></label>
            <label>Serial number<input value={draft.serialNumber} onChange={(event) => setDraft({ ...draft, serialNumber: event.target.value })} placeholder="Optional serial / IMEI" /></label>
            <label>Issue summary<textarea required value={draft.issueSummary} onChange={(event) => setDraft({ ...draft, issueSummary: event.target.value })} placeholder="Describe symptoms, damage, accessories received, and urgency" /></label>
            <div className="card-actions">
              <button type="submit" className="primary-button">Create WI</button>
              <button type="button" className="secondary-button" onClick={() => setShowCreateForm(false)}>Cancel</button>
            </div>
          </form>
        </CreatorFormCard>
        <RecordTable title="Recently created" rows={state.workItems.slice(0, 5).map(workItemToRow)} />
      </CreatorSplit>
    );
  }

  return (
    <CreatorRecordBrowser
      title={subView === 'walkins' ? 'Walk-in requests' : 'All work items'}
      records={list}
      selected={selected}
      query={query}
      setQuery={setQuery}
      setSelectedId={setSelectedId}
      toolbar={<button type="button" className="primary-button" onClick={() => setShowCreateForm(true)}>+ New work item</button>}
      detail={selected && (
        <WorkItemCard item={selected}>
          <div className="card-actions">
            <select value={selected.assignedTechnicianId} onChange={(event) => updateWorkItem(selected.id, { assignedTechnicianId: event.target.value, status: 'Assigned' }, actorRole, `${actorRole} reassigned the work item.`)}>
              {technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
            </select>
            <button type="button" className="secondary-dark-button" onClick={() => { notifyCustomerNow(selected.id); pushToast('Sent a status update to the customer (mock SMS).'); }}>Notify customer</button>
            {!terminalStatuses.includes(selected.status) && <button type="button" className="danger-button" onClick={() => cancelItem(selected.id)}>Cancel</button>}
          </div>
        </WorkItemCard>
      )}
    />
  );
}

function KanbanBoard({
  workItems,
  updateWorkItem,
  pushToast,
}: {
  workItems: WorkItem[];
  updateWorkItem: DeskActions['updateWorkItem'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const columns = statusFlow;
  const advance = (item: WorkItem) => {
    const next = getNextStatuses(item.status)[1];
    if (!next) {
      return;
    }

    if (['Ready for Pickup', 'Delivered'].includes(next) && !item.analysis.trim()) {
      pushToast('Add a diagnosis/analysis note before moving this to Ready for Pickup or Delivered.', 'error');
      return;
    }

    updateWorkItem(item.id, { status: next }, 'Agent', `Moved to ${next} from the board.`);
    pushToast(`${item.id} moved to ${next}.`);
  };

  return (
    <div className="kanban-board">
      {columns.map((column) => {
        const items = workItems.filter((item) => item.status === column);
        return (
          <div className="kanban-column" key={column}>
            <h4>{column} <span>{items.length}</span></h4>
            {items.map((item) => (
              <article className="kanban-card" key={item.id}>
                <strong>{item.deviceModel}</strong>
                <span>{item.id} · {item.customerName}</span>
                {getNextStatuses(item.status)[1] && (
                  <button type="button" className="secondary-dark-button" onClick={() => advance(item)}>
                    Advance to {getNextStatuses(item.status)[1]}
                  </button>
                )}
              </article>
            ))}
            {!items.length && <span className="muted">No jobs</span>}
          </div>
        );
      })}
    </div>
  );
}

function TechnicianView(props: DeskActions & { activeView: string; selectedTechnicianId: string; setSelectedTechnicianId: (id: string) => void; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const { state, activeView, selectedTechnicianId, setSelectedTechnicianId, updateWorkItem, adjustInventory, pushToast } = props;
  const assignedItems = state.workItems.filter((item) => item.assignedTechnicianId === selectedTechnicianId && item.status !== 'Cancelled');
  const estimateItems = assignedItems.filter((item) => item.status === 'Diagnosis' || item.status === 'Estimate Shared');
  const repairItems = assignedItems.filter((item) => item.status === 'Customer Approved' || item.status === 'In Repair' || item.status === 'Waiting for Parts' || item.status === 'Quality Check');
  const visibleItems = activeView === 'estimates' ? estimateItems : activeView === 'repair' ? repairItems : assignedItems;

  return (
    <ModuleFrame
      title="Analysis, estimates, and repair updates"
      subtitle="Technicians work from assigned reports, open a record, update diagnosis, consume parts, and move status forward."
      toolbar={activeView !== 'parts' ? <label className="filter-control compact-control">Technician<select value={selectedTechnicianId} onChange={(event) => setSelectedTechnicianId(event.target.value)}>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}</select></label> : undefined}
    >
      {activeView === 'dashboard' && (
        <RecordTable title="My assigned jobs" rows={assignedItems.map(workItemToRow)} />
      )}
      {activeView === 'parts' && <InventoryView {...props} canManage={false} canReset={false} />}
      {(activeView === 'assigned' || activeView === 'estimates' || activeView === 'repair') && (
        <div className="creator-record-grid">
          {visibleItems.map((item) => <TechnicianWorkItem key={item.id} item={item} parts={state.inventoryParts} updateWorkItem={updateWorkItem} adjustInventory={adjustInventory} pushToast={pushToast} />)}
          {!visibleItems.length && <EmptyState title="No records in this view" body="Change the technician or view filter to see more work items." />}
        </div>
      )}
    </ModuleFrame>
  );
}

function TechnicianWorkItem({ item, parts, updateWorkItem, adjustInventory, pushToast }: { item: WorkItem; parts: InventoryPart[]; updateWorkItem: DeskActions['updateWorkItem']; adjustInventory: DeskActions['adjustInventory']; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const [analysis, setAnalysis] = useState(item.analysis);
  const [requiredChanges, setRequiredChanges] = useState(item.requiredChanges);
  const [laborEstimate, setLaborEstimate] = useState(String(item.laborEstimate));
  const [partsEstimate, setPartsEstimate] = useState(String(item.partsEstimate));
  const [diagnosticFee, setDiagnosticFee] = useState(String(item.diagnosticFee));
  const [status, setStatus] = useState<WorkItemStatus>(item.status);
  const [promisedBy, setPromisedBy] = useState(item.promisedBy);
  const [partSku, setPartSku] = useState(parts[0]?.sku ?? '');

  const closingStatuses: WorkItemStatus[] = ['Ready for Pickup', 'Delivered'];
  const blockedByMissingAnalysis = closingStatuses.includes(status) && !analysis.trim();
  const estimatedPrice = (Number(laborEstimate) || 0) + (Number(partsEstimate) || 0) + (Number(diagnosticFee) || 0);

  const save = () => {
    if (blockedByMissingAnalysis) {
      pushToast('Add a diagnosis/analysis note before moving this to Ready for Pickup or Delivered.', 'error');
      return;
    }

    const selectedParts = partSku ? Array.from(new Set([...item.partsRequired, partSku])) : item.partsRequired;
    updateWorkItem(
      item.id,
      { analysis, requiredChanges, estimatedPrice, laborEstimate: Number(laborEstimate) || 0, partsEstimate: Number(partsEstimate) || 0, diagnosticFee: Number(diagnosticFee) || 0, status, promisedBy, partsRequired: selectedParts },
      'Technician',
      `Technician updated status to ${status}.`,
    );
    pushToast(`${item.id} updated — status set to ${status}.`);
  };

  const consumePart = () => {
    if (!partSku) return;
    const part = parts.find((candidate) => candidate.sku === partSku);
    adjustInventory(partSku, -1);
    updateWorkItem(item.id, { partsRequired: Array.from(new Set([...item.partsRequired, partSku])) }, 'Technician', `Technician consumed inventory part ${partSku}.`);
    pushToast(`Used 1× ${part?.name ?? partSku} on ${item.id}.`);
  };

  return (
    <article className="creator-record-card ticket-card editor-card">
      <WorkItemCard item={item} />
      <label>Analysis<textarea value={analysis} onChange={(event) => setAnalysis(event.target.value)} /></label>
      <label>Required changes<textarea value={requiredChanges} onChange={(event) => setRequiredChanges(event.target.value)} /></label>
      <div className="form-row">
        <label>Labor<input type="number" min="0" value={laborEstimate} onChange={(event) => setLaborEstimate(event.target.value)} /></label>
        <label>Parts<input type="number" min="0" value={partsEstimate} onChange={(event) => setPartsEstimate(event.target.value)} /></label>
      </div>
      <div className="form-row">
        <label>Diagnostic fee<input type="number" min="0" value={diagnosticFee} onChange={(event) => setDiagnosticFee(event.target.value)} /></label>
        <label>Promised by<input value={promisedBy} onChange={(event) => setPromisedBy(event.target.value)} /></label>
      </div>
      <p className="cost-breakdown"><span>Total estimate <strong>{currencyFormatter.format(estimatedPrice)}</strong></span></p>
      <div className="form-row"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as WorkItemStatus)}>{getNextStatuses(item.status).map((value) => <option key={value}>{value}</option>)}</select></label><label>Part<select value={partSku} onChange={(event) => setPartSku(event.target.value)}>{parts.map((part) => <option value={part.sku} key={part.sku}>{part.name} ({part.quantity})</option>)}</select></label></div>
      {blockedByMissingAnalysis && <p className="workflow-warning">Add a diagnosis/analysis note before this status can be saved.</p>}
      <div className="card-actions"><button type="button" className="primary-button" onClick={save} disabled={blockedByMissingAnalysis}>Save technician update</button><button type="button" className="secondary-dark-button" onClick={consumePart}>Use part</button></div>
    </article>
  );
}

function CustomerView({ state, approveEstimate, pushToast }: DeskActions & { pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(state.customers[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState('');
  const customerItems = state.workItems.filter((item) => item.customerId === selectedCustomerId);
  const selected = customerItems.find((item) => item.id === selectedId) ?? customerItems[0];
  const awaitingMyApproval = customerItems.filter((item) => item.status === 'Estimate Shared' && !item.approvedByCustomer).length;
  const completedRepairs = customerItems.filter((item) => item.status === 'Delivered').length;
  const totalPaid = state.invoices.filter((invoice) => invoice.customerId === selectedCustomerId && invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0);

  const approve = (workItemId: string) => {
    approveEstimate(workItemId);
    pushToast('Estimate approved — the technician has been notified.');
  };

  return (
    <ModuleFrame
      title="Realtime repair progress"
      subtitle="A customer-facing report and detail view for tracking repair status, estimates, and updates."
      toolbar={<label className="filter-control compact-control">Customer<select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>{state.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>}
    >
      <section className="creator-kpi-row" aria-label="My repair summary">
        <MetricCard label="My repairs" value={String(customerItems.length)} helper="Total repair records" />
        <MetricCard label="Awaiting my approval" value={String(awaitingMyApproval)} helper="Estimates to review" />
        <MetricCard label="Completed" value={String(completedRepairs)} helper="Delivered to me" />
        <MetricCard label="Paid to date" value={currencyFormatter.format(totalPaid)} helper="Across my invoices" />
      </section>
      <CreatorRecordBrowser
        title="My repair records"
        records={customerItems}
        selected={selected}
        query=""
        setQuery={() => undefined}
        setSelectedId={setSelectedId}
        hideSearch
        detail={selected && (
          <article className="customer-detail-card">
            <WorkItemCard item={selected} />
            {selected.status === 'Estimate Shared' && !selected.approvedByCustomer && <button type="button" className="primary-button" onClick={() => approve(selected.id)}>Approve estimate</button>}
            <ProgressTracker status={selected.status} />
            <h3>Live updates</h3>
            <ul className="timeline">{selected.updates.map((update) => <li key={update.id}><strong>{update.actor}</strong> · {update.message}<span>{update.at}</span></li>)}</ul>
            {state.notifications.some((notification) => notification.workItemId === selected.id) && (
              <>
                <h3>Messages sent to you</h3>
                <ul className="timeline">
                  {state.notifications
                    .filter((notification) => notification.workItemId === selected.id)
                    .map((notification) => <li key={notification.id}><strong>{notification.channel.toUpperCase()}</strong> · {notification.message}<span>{notification.createdAt}</span></li>)}
                </ul>
              </>
            )}
          </article>
        )}
      />
    </ModuleFrame>
  );
}

function ServiceCatalog({ selectedDeviceType, setSelectedDeviceType, visibleCategories }: { selectedDeviceType: DeviceType | 'All'; setSelectedDeviceType: (value: DeviceType | 'All') => void; visibleCategories: typeof serviceCategories }) {
  return (
    <section className="creator-panel service-catalog-panel">
      <div className="creator-panel-header">
        <div><p className="eyebrow">Service catalog</p><h2>Repair categories</h2></div>
        <label className="filter-control compact-control">Device type
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
  );
}

function WorkItemCard({ item, children }: { item: WorkItem; children?: ReactNode }) {
  const technician = technicians.find((tech) => tech.id === item.assignedTechnicianId);
  return (
    <article className="workitem-summary">
      <div className="ticket-header"><strong>{item.id}</strong><span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span></div>
      <h3>{item.deviceModel}</h3>
      <p>{item.issueSummary}</p>
      <dl>
        <div><dt>Customer</dt><dd>{item.customerName}</dd></div><div><dt>Source</dt><dd>{item.source}</dd></div><div><dt>Priority</dt><dd>{item.priority}</dd></div><div><dt>Technician</dt><dd>{technician?.name ?? 'Unassigned'}</dd></div><div><dt>Estimate</dt><dd>{currencyFormatter.format(item.estimatedPrice)}</dd></div><div><dt>Promised</dt><dd>{item.promisedBy}</dd></div><div><dt>Serial</dt><dd>{item.serialNumber || 'Not captured'}</dd></div><div><dt>Parts</dt><dd>{item.partsRequired.length ? item.partsRequired.join(', ') : 'None yet'}</dd></div>
      </dl>
      {item.estimatedPrice > 0 && (
        <p className="cost-breakdown">
          <span>Labor <strong>{currencyFormatter.format(item.laborEstimate)}</strong></span>
          <span>Parts <strong>{currencyFormatter.format(item.partsEstimate)}</strong></span>
          <span>Diagnostic <strong>{currencyFormatter.format(item.diagnosticFee)}</strong></span>
        </p>
      )}
      <p><strong>Analysis:</strong> {item.analysis || 'Pending technician analysis'}</p>
      <p><strong>Changes:</strong> {item.requiredChanges || 'Pending estimate'}</p>
      {children}
    </article>
  );
}

function InventoryView({ state, adjustInventory, addInventoryPart, reset, canManage, canReset, pushToast }: DeskActions & { canManage: boolean; canReset: boolean; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const [part, setPart] = useState<InventoryPart>(blankPart);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addInventoryPart({ ...part, sku: part.sku.toUpperCase(), compatibleWith: [part.compatibleWith[0] ?? 'Laptop'] });
    pushToast(`Saved part ${part.sku.toUpperCase() || part.name}.`);
    setPart(blankPart);
  };

  const confirmReset = () => {
    if (!window.confirm('Reset all demo data? This permanently wipes every local work item, invoice, and inventory change.')) {
      return;
    }

    reset();
    pushToast('Demo data reset.');
  };

  return (
    <section className="creator-panel">
      <div className="creator-panel-header"><div><p className="eyebrow">Inventory application view</p><h2>Spare parts</h2></div></div>
      <CreatorSplit>
        <CreatorFormCard title="Part form" eyebrow="Inventory">
          {canManage ? (
            <form className="creator-form" onSubmit={submit}>
              <label>SKU<input required value={part.sku} onChange={(event) => setPart({ ...part, sku: event.target.value })} placeholder="BAT-MBP-2024" /></label>
              <label>Name<input required value={part.name} onChange={(event) => setPart({ ...part, name: event.target.value })} placeholder="MacBook Battery" /></label>
              <div className="form-row"><label>Device<select value={part.compatibleWith[0]} onChange={(event) => setPart({ ...part, compatibleWith: [event.target.value as DeviceType] })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Quantity<input type="number" value={part.quantity} onChange={(event) => setPart({ ...part, quantity: Number(event.target.value) })} /></label></div>
              <div className="form-row"><label>Reorder at<input type="number" value={part.reorderLevel} onChange={(event) => setPart({ ...part, reorderLevel: Number(event.target.value) })} /></label><label>Cost<input type="number" value={part.unitCost} onChange={(event) => setPart({ ...part, unitCost: Number(event.target.value) })} /></label></div>
              <div className="card-actions"><button className="primary-button" type="submit">Add / update part</button>{canReset && <button className="secondary-dark-button" type="button" onClick={confirmReset}>Reset demo data</button>}</div>
            </form>
          ) : <p className="muted">Technicians can view and consume parts. Agents/admins manage part records.</p>}
        </CreatorFormCard>
        <div className="creator-list-panel">
          <ListHeader title="Inventory report" count={state.inventoryParts.length} />
          {state.inventoryParts.map((inventoryPart) => {
            const lowStock = inventoryPart.quantity <= inventoryPart.reorderLevel;
            return (
              <article className="record-row inventory-record" key={inventoryPart.sku}>
                <div><strong>{inventoryPart.name}</strong><span>{inventoryPart.sku} · {inventoryPart.compatibleWith.join(', ')}</span></div>
                <div className="inventory-meta"><span className={lowStock ? 'stock-low' : 'stock-ok'}>{inventoryPart.quantity} in stock</span><small>Reorder at {inventoryPart.reorderLevel} · Cost {currencyFormatter.format(inventoryPart.unitCost)}</small></div>
                <div className="stepper">
                  <button type="button" aria-label={`Decrease ${inventoryPart.name} quantity`} onClick={() => adjustInventory(inventoryPart.sku, -1)}>-</button>
                  <button type="button" aria-label={`Increase ${inventoryPart.name} quantity`} onClick={() => adjustInventory(inventoryPart.sku, 1)}>+</button>
                </div>
              </article>
            );
          })}
        </div>
      </CreatorSplit>
    </section>
  );
}

function InvoiceList({
  invoices,
  updateInvoiceStatus,
  recordPayment,
  pushToast,
}: {
  invoices: Invoice[];
  updateInvoiceStatus: DeskActions['updateInvoiceStatus'];
  recordPayment: (invoiceId: string, payment: InvoicePaymentDraft) => void;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const exportCsv = () => {
    if (isApiPersistenceEnabled) {
      exportApi.invoicesCsv().catch((error: unknown) => pushToast(error instanceof Error ? error.message : 'Export failed.', 'error'));
      return;
    }
    exportInvoicesCsvLocally(invoices);
  };

  return (
    <div className="creator-list-panel">
      <div className="list-header"><h3>Invoice register</h3><div className="card-actions"><span>{invoices.length} records</span><button type="button" className="secondary-dark-button" onClick={exportCsv}>Export CSV</button></div></div>
      {invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} updateInvoiceStatus={updateInvoiceStatus} recordPayment={recordPayment} />
      ))}
    </div>
  );
}

function InvoiceRow({
  invoice,
  updateInvoiceStatus,
  recordPayment,
}: {
  invoice: Invoice;
  updateInvoiceStatus: DeskActions['updateInvoiceStatus'];
  recordPayment: (invoiceId: string, payment: InvoicePaymentDraft) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('Card (Test Mode)');
  const [reference, setReference] = useState('');

  return (
    <div className="creator-record-card">
      <div className="ticket-header">
        <div><strong>{invoice.id} · {invoice.customerName}</strong><span>{invoice.workItemId} · {invoice.issuedAt}</span></div>
        <span className={`status ${invoice.status.toLowerCase()}`}>{invoice.status}</span>
      </div>
      <p className="cost-breakdown">
        <span>Labor <strong>{currencyFormatter.format(invoice.laborAmount)}</strong></span>
        <span>Parts <strong>{currencyFormatter.format(invoice.partsAmount)}</strong></span>
        <span>Diagnostic <strong>{currencyFormatter.format(invoice.diagnosticFee)}</strong></span>
        <span>Total <strong>{currencyFormatter.format(invoice.amount)}</strong></span>
      </p>
      {invoice.status === 'Paid' ? (
        <span className="muted">Paid via {invoice.paymentMethod || 'unknown method'} · Ref {invoice.paymentReference || '—'}</span>
      ) : invoice.status === 'Issued' ? (
        <div className="card-actions">
          <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {paymentMethods.map((option) => <option key={option}>{option}</option>)}
          </select>
          <input placeholder="Reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} />
          <button type="button" className="primary-button" onClick={() => recordPayment(invoice.id, { method, reference })}>Record payment</button>
          <button type="button" className="danger-button" onClick={() => updateInvoiceStatus(invoice.id, 'Void')}>Void</button>
        </div>
      ) : (
        <select value={invoice.status} onChange={(event) => updateInvoiceStatus(invoice.id, event.target.value as InvoiceStatus)}>
          {(['Draft', 'Issued', 'Void'] satisfies InvoiceStatus[]).map((status) => <option key={status}>{status}</option>)}
        </select>
      )}
    </div>
  );
}

function NotificationLog({ notifications }: { notifications: DeskActions['state']['notifications'] }) {
  const channelIcon: Record<string, string> = { sms: '💬', whatsapp: '🟢', email: '✉️' };

  return (
    <div className="creator-panel">
      <div className="creator-panel-header"><div><p className="eyebrow">Outbound customer notifications</p><h2>Notification log</h2></div></div>
      <div className="creator-list-panel">
        <ListHeader title="Sent messages" count={notifications.length} />
        {notifications.length ? notifications.map((notification) => (
          <div className="record-row notification-row" key={notification.id}>
            <span className="channel-badge">{channelIcon[notification.channel] ?? '🔔'} {notification.channel}</span>
            <div><strong>{notification.recipient}</strong><span>{notification.message}</span></div>
            <span className="record-meta">{notification.createdAt}</span>
          </div>
        )) : <EmptyState title="No notifications yet" body="Status changes on a work item automatically text the customer (mock provider — no SMS account is connected yet)." />}
      </div>
    </div>
  );
}

function ReportBuilder({
  state,
  savedReports,
  createSavedReport,
  deleteSavedReport,
  pushToast,
}: {
  state: DeskActions['state'];
  savedReports: SavedReport[];
  createSavedReport: (draft: SavedReportDraft) => void;
  deleteSavedReport: (id: string) => void;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [entity, setEntity] = useState<ReportEntity>('workItems');
  const [columns, setColumns] = useState<string[]>(reportColumnOptions.workItems.slice(0, 4));
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [reportName, setReportName] = useState('');

  const changeEntity = (nextEntity: ReportEntity) => {
    setEntity(nextEntity);
    setColumns(reportColumnOptions[nextEntity].slice(0, 4));
    setFilterField('');
    setFilterValue('');
  };

  const toggleColumn = (column: string) => {
    setColumns((current) => (current.includes(column) ? current.filter((value) => value !== column) : [...current, column]));
  };

  const rows = useMemo(() => buildReportRows(state, entity, columns, filterField, filterValue), [state, entity, columns, filterField, filterValue]);

  const runSavedReport = (report: SavedReport) => {
    setEntity(report.entity);
    setColumns(report.columns);
    setFilterField(report.filterField);
    setFilterValue(report.filterValue);
  };

  const saveReport = () => {
    if (!reportName.trim() || !columns.length) {
      pushToast('Give the report a name and at least one column.', 'error');
      return;
    }

    createSavedReport({ name: reportName, entity, columns, filterField, filterValue });
    pushToast(`Saved report "${reportName}".`);
    setReportName('');
  };

  return (
    <CreatorSplit>
      <CreatorFormCard title="Report builder" eyebrow="Build-your-own report">
        <div className="creator-form">
          <label>Entity<select value={entity} onChange={(event) => changeEntity(event.target.value as ReportEntity)}>
            {(Object.keys(reportEntityLabels) as ReportEntity[]).map((option) => <option key={option} value={option}>{reportEntityLabels[option]}</option>)}
          </select></label>
          <label>Columns
            <span className="checkbox-grid">
              {reportColumnOptions[entity].map((column) => (
                <label className="inline-check" key={column}><input type="checkbox" checked={columns.includes(column)} onChange={() => toggleColumn(column)} /> {column}</label>
              ))}
            </span>
          </label>
          <div className="form-row">
            <label>Filter field<select value={filterField} onChange={(event) => setFilterField(event.target.value)}>
              <option value="">No filter</option>
              {reportColumnOptions[entity].map((column) => <option key={column} value={column}>{column}</option>)}
            </select></label>
            <label>Contains<input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} placeholder="Filter value" disabled={!filterField} /></label>
          </div>
          <div className="form-row">
            <label>Report name<input value={reportName} onChange={(event) => setReportName(event.target.value)} placeholder="e.g. Overdue invoices" /></label>
          </div>
          <div className="card-actions">
            <button type="button" className="primary-button" onClick={saveReport}>Save report</button>
            <button type="button" className="secondary-dark-button" onClick={() => downloadRowsAsCsv(`${entity}-report.csv`, columns, rows)}>Export CSV</button>
          </div>
        </div>
      </CreatorFormCard>
      <div className="creator-list-panel">
        <ListHeader title={`Preview · ${reportEntityLabels[entity]}`} count={rows.length} />
        {rows.length ? rows.slice(0, 25).map((row, index) => (
          <div className="record-row" key={index}>
            <div><strong>{row[columns[0]] ?? ''}</strong><span>{columns.slice(1).map((column) => row[column]).filter(Boolean).join(' · ')}</span></div>
          </div>
        )) : <EmptyState title="No matching records" body="Adjust the filter or pick different columns." />}
        {savedReports.length > 0 && (
          <>
            <ListHeader title="Saved reports" count={savedReports.length} />
            {savedReports.map((report) => (
              <div className="record-row" key={report.id}>
                <div><strong>{report.name}</strong><span>{reportEntityLabels[report.entity]} · {report.columns.length} columns</span></div>
                <div className="card-actions">
                  <button type="button" className="secondary-dark-button" onClick={() => runSavedReport(report)}>Run</button>
                  <button type="button" className="danger-button" onClick={() => deleteSavedReport(report.id)}>Delete</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </CreatorSplit>
  );
}

function getEntityRows(state: DeskActions['state'], entity: ReportEntity): Array<Record<string, unknown>> {
  const rows: unknown[] = (() => {
    switch (entity) {
      case 'workItems':
        return state.workItems;
      case 'invoices':
        return state.invoices;
      case 'customers':
        return state.customers;
      case 'inventory':
        return state.inventoryParts;
      default:
        return [];
    }
  })();

  return rows as Array<Record<string, unknown>>;
}

function buildReportRows(state: DeskActions['state'], entity: ReportEntity, columns: string[], filterField: string, filterValue: string): Array<Record<string, string>> {
  let rows = getEntityRows(state, entity);

  if (filterField && filterValue.trim()) {
    rows = rows.filter((row) => String(row[filterField] ?? '').toLowerCase().includes(filterValue.trim().toLowerCase()));
  }

  return rows.map((row) => {
    const projected: Record<string, string> = {};
    for (const column of columns) {
      const value = row[column];
      projected[column] = value === undefined || value === null ? '' : String(value);
    }
    return projected;
  });
}

function downloadRowsAsCsv(filename: string, headers: string[], rows: Array<Record<string, string>>) {
  const escapeCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  const lines = [headers.join(','), ...rows.map((row) => headers.map((header) => escapeCell(row[header] ?? '')).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCustomersCsvLocally(state: DeskActions['state']) {
  downloadRowsAsCsv(
    'customers.csv',
    ['Customer ID', 'Name', 'Phone', 'Email', 'Repairs'],
    state.customers.map((customer) => ({
      'Customer ID': customer.id,
      Name: customer.name,
      Phone: customer.phone,
      Email: customer.email,
      Repairs: String(state.workItems.filter((item) => item.customerId === customer.id).length),
    })),
  );
}

function exportInvoicesCsvLocally(invoices: Invoice[]) {
  downloadRowsAsCsv(
    'invoices.csv',
    ['Invoice ID', 'Work Item', 'Customer', 'Labor', 'Parts', 'Diagnostic Fee', 'Total', 'Status', 'Issued At', 'Paid At', 'Payment Method', 'Payment Reference'],
    invoices.map((invoice) => ({
      'Invoice ID': invoice.id,
      'Work Item': invoice.workItemId,
      Customer: invoice.customerName,
      Labor: String(invoice.laborAmount),
      Parts: String(invoice.partsAmount),
      'Diagnostic Fee': String(invoice.diagnosticFee),
      Total: String(invoice.amount),
      Status: invoice.status,
      'Issued At': invoice.issuedAt,
      'Paid At': invoice.paidAt,
      'Payment Method': invoice.paymentMethod,
      'Payment Reference': invoice.paymentReference,
    })),
  );
}

function ModuleFrame({
  title,
  subtitle,
  toolbar,
  children,
}: {
  title: string;
  subtitle: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="module-frame">
      <div className="module-header">
        <div><p className="eyebrow">Module</p><h2>{title}</h2><p className="module-subtitle">{subtitle}</p></div>
        {toolbar}
      </div>
      <div className="view-canvas">{children}</div>
    </section>
  );
}

function CreatorSplit({ children }: { children: ReactNode }) {
  return <div className="creator-split">{children}</div>;
}

function CreatorFormCard({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="creator-form-card"><p className="eyebrow">{eyebrow}</p><h3>{title}</h3>{children}</section>;
}

function CreatorRecordBrowser({ title, records, selected, query, setQuery, setSelectedId, detail, hideSearch = false, toolbar }: { title: string; records: WorkItem[]; selected?: WorkItem; query: string; setQuery: (query: string) => void; setSelectedId: (id: string) => void; detail?: ReactNode; hideSearch?: boolean; toolbar?: ReactNode }) {
  const searchId = useId();

  return (
    <div className="record-browser">
      <div className="creator-list-panel">
        <div className="list-header"><h3>{title}</h3><div className="card-actions"><span>{records.length} records</span>{toolbar}</div></div>
        {!hideSearch && (
          <>
            <label className="visually-hidden" htmlFor={searchId}>Search {title}</label>
            <input id={searchId} className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" />
          </>
        )}
        <div className="record-list">
          {records.map((item) => (
            <button type="button" className={selected?.id === item.id ? 'record-row selectable active' : 'record-row selectable'} key={item.id} onClick={() => setSelectedId(item.id)}>
              <div><strong>{item.deviceModel}</strong><span>{item.id} · {item.customerName}</span></div>
              <span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="creator-detail-panel">
        {detail ?? <EmptyState title="Select a record" body="Choose a record from the report to open its detail view." />}
      </div>
    </div>
  );
}

function RecordTable({ title, rows }: { title: string; rows: Array<{ id: string; primary: string; secondary: string; meta?: string }> }) {
  return (
    <div className="creator-list-panel">
      <ListHeader title={title} count={rows.length} />
      {rows.length ? rows.map((row) => <div className="record-row" key={row.id}><div><strong>{row.primary}</strong><span>{row.id} · {row.secondary}</span></div>{row.meta && <span className="record-meta">{row.meta}</span>}</div>) : <EmptyState title="No records" body="This report does not have records yet." />}
    </div>
  );
}

function ListHeader({ title, count }: { title: string; count: number }) {
  return <div className="list-header"><h3>{title}</h3><span>{count} records</span></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{body}</span></div>;
}

function workItemToRow(item: WorkItem) {
  return { id: item.id, primary: item.deviceModel, secondary: `${item.customerName} · ${item.status}`, meta: currencyFormatter.format(item.estimatedPrice) };
}

function profileToRole(profile: AuthProfile): UserRole {
  return profile === 'admin' ? 'Admin' : profile === 'technician' ? 'Technician' : profile === 'customer' ? 'Customer' : 'Agent';
}

function profileToModules(profile: AuthProfile): ModuleId[] {
  return profile === 'admin' ? ['admin', 'agent', 'technician', 'customer'] : [profile];
}

function Feature({ title, body }: { title: string; body: string }) {
  return <article className="feature-item"><strong>{title}</strong><span>{body}</span></article>;
}

function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const nextTheme = theme === 'light' ? 'dark' : 'light';

  return (
    <button className="theme-toggle" type="button" onClick={onToggle} aria-label={`Switch to ${nextTheme} mode`}>
      <span aria-hidden="true">{theme === 'light' ? '🌙' : '☀️'}</span>
      <span className="toggle-label">{theme === 'light' ? 'Dark' : 'Light'} mode</span>
    </button>
  );
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
  if (!error && !isLoading && isApiBacked) {
    return null;
  }

  return (
    <section className={error ? 'sync-banner sync-banner-error' : 'sync-banner'} aria-live="polite">
      {error ? (
        <strong className="sync-error">{error}</strong>
      ) : isLoading ? (
        <span>Loading your data…</span>
      ) : (
        <span>Working offline — changes are only saved on this device.</span>
      )}
      {error && <button type="button" className="secondary-dark-button" onClick={() => void onRefresh()}>Try again</button>}
    </section>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><p>{helper}</p></article>;
}

export default App;
