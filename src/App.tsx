import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Cog,
  Columns3,
  Copy,
  CreditCard,
  Download,
  FileBarChart2,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  Minus,
  Pencil,
  Pin,
  Plus,
  Receipt,
  Search,
  SlidersHorizontal,
  Smartphone,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ProgressTracker } from './components/ProgressTracker';
import { ToastStack } from './components/ToastStack';
import { serviceCategories } from './data/repairShop';
import {
  authProfiles,
  currencyFormatter,
  defaultModuleForProfile,
  deviceTypes,
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
import { isApiPersistenceEnabled, userApi } from './services/apiClient';
import type {
  AuthProfile,
  AuthUser,
  BulkUserCreationResult,
  BulkUserRow,
  Customer,
  DeviceType,
  Invoice,
  InventoryPart,
  InvoiceDraft,
  InvoicePaymentDraft,
  InvoiceStatus,
  ManagedUser,
  ModuleId,
  PaymentMethod,
  Priority,
  ReportEntity,
  ReportFilter,
  SavedReport,
  SavedReportDraft,
  Technician,
  TechnicianDraft,
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

const nowStamp = () => new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
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

interface NavItem {
  id: string;
  label: string;
  modules: ModuleId[];
  icon?: LucideIcon;
  children?: NavItem[];
}

interface SectionMeta {
  title: string;
  subtitle: string;
}

/**
 * One master list for the whole app. Visibility per logged-in user is just a
 * show/hide filter against `user.moduleAccess` — not a separate nav tree per
 * role. Admin's moduleAccess covers all four tags, so Admin sees everything.
 */
const masterNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', modules: ['admin', 'agent', 'technician'], icon: LayoutDashboard },
  { id: 'people', label: 'People', modules: ['admin'], icon: UsersIcon, children: [
    { id: 'users', label: 'Users', modules: ['admin'] },
    { id: 'customers', label: 'Customers', modules: ['admin'] },
    { id: 'technicians', label: 'Technicians', modules: ['admin'] },
  ] },
  { id: 'inventory-report', label: 'Inventory', modules: ['admin', 'agent'], icon: Boxes },
  { id: 'workitems', label: 'Work Items', modules: ['admin', 'agent'], icon: Wrench, children: [
    { id: 'wi-all', label: 'All Work Items', modules: ['admin', 'agent'] },
    { id: 'wi-board', label: 'Board', modules: ['admin', 'agent'] },
    { id: 'wi-walkins', label: 'Walk-ins', modules: ['admin', 'agent'] },
  ] },
  { id: 'myjobs', label: 'My Jobs', modules: ['admin', 'technician'], icon: ClipboardList, children: [
    { id: 'myjobs-assigned', label: 'Assigned', modules: ['admin', 'technician'] },
    { id: 'myjobs-estimates', label: 'Estimates', modules: ['admin', 'technician'] },
    { id: 'myjobs-repair', label: 'In Repair', modules: ['admin', 'technician'] },
  ] },
  { id: 'parts', label: 'Parts', modules: ['admin', 'technician'], icon: Cog },
  { id: 'invoices-report', label: 'Invoices', modules: ['admin'], icon: Receipt },
  { id: 'catalog', label: 'Catalog', modules: ['admin'], icon: BookOpen },
  { id: 'reports', label: 'Export Reports', modules: ['admin'], icon: FileBarChart2 },
  { id: 'repairs', label: 'My Repairs', modules: ['admin', 'customer'], icon: Smartphone },
  { id: 'organization', label: 'Organization', modules: ['admin'], icon: Building2 },
];

const sectionMeta: Record<string, SectionMeta> = {
  dashboard: { title: 'Dashboard', subtitle: 'A quick operational summary of active work, revenue, and stock.' },
  organization: { title: 'Organization', subtitle: 'Manage your organization profile and bulk-add staff accounts.' },
  people: { title: 'People directory', subtitle: 'Manage staff accounts and customer/technician master data.' },
  'inventory-report': { title: 'Inventory', subtitle: 'Manage spare-parts stock levels and reorder points.' },
  workitems: { title: 'Work Items', subtitle: 'Create, assign, track, and update repair work items.' },
  myjobs: { title: 'My Jobs', subtitle: 'Diagnose, estimate, and update assigned repair jobs.' },
  'myjobs-assigned': { title: 'Assigned jobs', subtitle: 'Every open job assigned to this technician.' },
  'myjobs-estimates': { title: 'Estimates', subtitle: 'Jobs awaiting diagnosis or an estimate to share with the customer.' },
  'myjobs-repair': { title: 'In repair', subtitle: 'Jobs approved and in progress — repair, parts, or quality check.' },
  'wi-board': { title: 'Work item board', subtitle: 'Drag jobs through their repair status.' },
  parts: { title: 'Parts', subtitle: 'Read-only view of spare-parts stock.' },
  'invoices-report': { title: 'Invoices', subtitle: 'Create invoices, record payments, and export for accounting.' },
  catalog: { title: 'Service catalog', subtitle: 'Browse repair categories, common issues, and starting prices.' },
  reports: { title: 'Export Reports', subtitle: 'Build, save, and export custom reports.' },
  repairs: { title: 'My Repairs', subtitle: 'Track repair progress, updates, and approve shared estimates.' },
};

// Most leaf views render their own heading (a DataGrid or form card title), so the
// generic module header would just repeat it and eat space. Only views with no
// title of their own — dashboard, the card-style My Jobs tabs, and the Kanban board — need it.
const viewsNeedingModuleHeader = new Set(['dashboard', 'organization', 'myjobs-assigned', 'myjobs-estimates', 'myjobs-repair', 'wi-board']);

const visibleNavFor = (moduleAccess: ModuleId[]): NavItem[] => {
  const isVisible = (item: NavItem) => item.modules.some((moduleId) => moduleAccess.includes(moduleId));
  return masterNav
    .filter(isVisible)
    .map((item) => (item.children ? { ...item, children: item.children.filter(isVisible) } : item))
    .filter((item) => !item.children || item.children.length > 0);
};

const firstLeafId = (items: NavItem[]): string => (items[0].children ? firstLeafId(items[0].children) : items[0].id);

const leafIdsOf = (items: NavItem[]): string[] => items.flatMap((item) => (item.children ? leafIdsOf(item.children) : [item.id]));

const viewFromHash = (navItems: NavItem[]): string | null => {
  const [hashId] = window.location.hash.replace(/^#/, '').split(':');
  return hashId && leafIdsOf(navItems).includes(hashId) ? hashId : null;
};

const recordIdFromHash = (): string | null => {
  const [, recordId] = window.location.hash.replace(/^#/, '').split(':');
  return recordId || null;
};

const groupIdFor = (activeView: string): string => {
  const parent = masterNav.find((item) => item.id === activeView || (item.children?.some((child) => child.id === activeView) ?? false));
  return parent?.id ?? activeView;
};

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

  useEffect(() => {
    // Light/dark mode is hidden for now — the app always runs in its dark, "rich" palette.
    document.documentElement.dataset.theme = 'dark';
  }, []);

  const handleLoginSuccess = (user: AuthUser) => {
    const nextModule = initialModule && user.moduleAccess.includes(initialModule) ? initialModule : defaultModuleForProfile(user.profile);
    setActiveModule(nextModule);
    updateUrlForModule(sessionId, nextModule);
  };

  const handleLogout = async () => {
    await auth.logout();
    setActiveModule(null);
    updateUrlForModule(sessionId, null);
  };

  if (!auth.user || !activeModule) {
    return <HomePage auth={auth} onLoginSuccess={handleLoginSuccess} />;
  }

  return <Workspace user={auth.user} onLogout={handleLogout} onRenameOrganization={auth.renameOrganization} />;
}

function HomePage({
  auth,
  onLoginSuccess,
}: {
  auth: ReturnType<typeof useAuth>;
  onLoginSuccess: (user: AuthUser) => void;
}) {
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('admin@servicedesk.local');
  const [password, setPassword] = useState('Admin@12345');
  const [organizationName, setOrganizationName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

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

  const submitSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = await auth.signup({ organizationName, adminName, adminEmail: signupEmail, adminPassword: signupPassword });
    onLoginSuccess(user);
  };

  return (
    <main className="public-shell">
      <nav className="public-nav" aria-label="Homepage navigation">
        <div className="brand"><div className="brand-mark">SD</div><span>{appName}</span></div>
        <div className="public-links"><a href="#features">Features</a><a href="#login">Login</a><a href={`mailto:${supportEmail}`}>Contact</a></div>
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
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={authTab === 'login'} className={authTab === 'login' ? 'auth-tab is-active' : 'auth-tab'} onClick={() => setAuthTab('login')}>Login</button>
            <button type="button" role="tab" aria-selected={authTab === 'signup'} className={authTab === 'signup' ? 'auth-tab is-active' : 'auth-tab'} onClick={() => setAuthTab('signup')}>Create organization</button>
          </div>

          {authTab === 'login' ? (
            <>
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
            </>
          ) : (
            <>
              <p className="eyebrow">Organization setup</p>
              <h2>Create your organization</h2>
              <p className="muted">Set up a brand-new, fully isolated workspace and become its first Admin.</p>
              <form className="login-form" onSubmit={(event) => void submitSignup(event)}>
                <label>Organization name<input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required placeholder="Acme Repairs" /></label>
                <label>Your name<input value={adminName} onChange={(event) => setAdminName(event.target.value)} required placeholder="Jane Doe" /></label>
                <label>Email<input type="email" value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} required placeholder="jane@acme.com" /></label>
                <label>Password<input type="password" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} required minLength={8} placeholder="Minimum 8 characters" /></label>
                {auth.authError && <div className="login-error">{auth.authError}</div>}
                <button className="primary-button full-width" type="submit" disabled={auth.isAuthenticating}>{auth.isAuthenticating ? 'Creating organization…' : 'Create organization'}</button>
              </form>
            </>
          )}
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
  onLogout,
  onRenameOrganization,
}: {
  user: AuthUser;
  onLogout: () => Promise<void>;
  onRenameOrganization: (name: string) => Promise<AuthUser>;
}) {
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('tech-arun');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('service-desk-sidebar-collapsed') === 'true');
  const serviceDesk = useServiceDesk();
  const { state } = serviceDesk;
  const metrics = getMetrics(state);
  const toast = useToast();
  const effectiveCustomerId = selectedCustomerId || state.customers[0]?.id || '';

  const navItems = useMemo(() => visibleNavFor(user.moduleAccess), [user.moduleAccess]);
  const [activeView, setActiveView] = useState<string>(() => viewFromHash(navItems) ?? firstLeafId(navItems));
  const [focusRecordId, setFocusRecordId] = useState<string | null>(() => recordIdFromHash());

  useEffect(() => {
    window.history.replaceState(null, '', `#${activeView}${focusRecordId ? `:${focusRecordId}` : ''}`);
  }, [activeView, focusRecordId]);

  const navigate = (id: string, recordId?: string) => {
    setActiveView(id);
    setFocusRecordId(recordId ?? null);
    setMobileNavOpen(false);
  };

  const availableLeafIds = useMemo(() => leafIdsOf(navItems), [navItems]);
  const findNavTarget = (candidates: string[]): string | undefined => candidates.find((id) => availableLeafIds.includes(id));

  useEffect(() => {
    if (!mobileNavOpen) {
      return undefined;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    localStorage.setItem('service-desk-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const groupId = groupIdFor(activeView);
  const isDashboard = activeView === 'dashboard';
  const meta = sectionMeta[activeView] ?? sectionMeta[groupId] ?? { title: appName, subtitle: '' };
  const toolbar =
    groupId === 'myjobs' ? (
      <label className="filter-control compact-control">
        Technician
        <select value={selectedTechnicianId} onChange={(event) => setSelectedTechnicianId(event.target.value)}>
          {user.role === 'Admin' && <option value="all">All technicians</option>}
          {state.technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
        </select>
      </label>
    ) : groupId === 'repairs' ? (
      <label className="filter-control compact-control">
        Customer
        <select value={effectiveCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
          {user.role === 'Admin' && <option value="all">All customers</option>}
          {state.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
        </select>
      </label>
    ) : undefined;

  return (
    <main className={sidebarCollapsed ? 'creator-shell sidebar-collapsed' : 'creator-shell'}>
      {mobileNavOpen && <div className="nav-overlay" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />}
      <aside className={mobileNavOpen ? 'creator-sidebar nav-open' : 'creator-sidebar'}>
        <div className="brand app-brand">
          <div className="brand-mark">SD</div>
          <span>{appName}</span>
          <button
            type="button"
            className="sidebar-pin-toggle"
            aria-label="Unpin sidebar"
            aria-pressed="true"
            onClick={() => setSidebarCollapsed(true)}
          >
            <Pin aria-hidden="true" size={14} />
          </button>
          {user.moduleAccess.includes('admin') && <NotificationBell notifications={state.notifications} markNotificationsRead={serviceDesk.markNotificationsRead} />}
        </div>
        <div className="sidebar-section">
          <span className="sidebar-label">{user.role} sections</span>
          <SidebarNav items={navItems} activeView={activeView} onNavigate={navigate} />
        </div>
        <div className="sidebar-card">
          <strong>{user.name}</strong>
          <span>{user.role}</span>
          <button type="button" className="sidebar-logout" onClick={() => void onLogout()}>
            <LogOut aria-hidden="true" size={15} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
      <button
        type="button"
        className="sidebar-rail"
        aria-label="Expand sidebar"
        onClick={() => setSidebarCollapsed(false)}
      >
        <ChevronRight aria-hidden="true" size={13} />
      </button>

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
              {mobileNavOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
            </button>
          </div>
        </header>

        <SyncStatus isApiBacked={serviceDesk.isApiBacked} isLoading={serviceDesk.isLoading} error={serviceDesk.error} onRefresh={serviceDesk.refresh} />

        {user.profile !== 'customer' && isDashboard && (
          <section className="creator-kpi-row" aria-label="Operational metrics">
            <MetricCard
              label="Active WIs"
              value={String(metrics.activeWorkItems)}
              helper="Open repair jobs"
              onClick={findNavTarget(['wi-all', 'myjobs-assigned']) ? () => navigate(findNavTarget(['wi-all', 'myjobs-assigned'])!) : undefined}
            />
            <MetricCard
              label="Awaiting approval"
              value={String(metrics.awaitingApproval)}
              helper="Estimate decisions"
              onClick={findNavTarget(['wi-all', 'myjobs-estimates']) ? () => navigate(findNavTarget(['wi-all', 'myjobs-estimates'])!) : undefined}
            />
            <MetricCard
              label="Stock alerts"
              value={String(metrics.lowStockParts)}
              helper="Low inventory SKUs"
              onClick={findNavTarget(['inventory-report', 'parts']) ? () => navigate(findNavTarget(['inventory-report', 'parts'])!) : undefined}
            />
            <MetricCard
              label="Paid revenue"
              value={currencyFormatter.format(metrics.paidRevenue)}
              helper={`${currencyFormatter.format(metrics.invoicedRevenue)} invoiced`}
              onClick={findNavTarget(['invoices-report']) ? () => navigate(findNavTarget(['invoices-report'])!) : undefined}
            />
          </section>
        )}

        <section className="creator-page">
          <WorkspaceContent
            {...serviceDesk}
            activeView={activeView}
            title={meta.title}
            subtitle={meta.subtitle}
            toolbar={toolbar}
            currentUser={user}
            selectedTechnicianId={selectedTechnicianId}
            selectedCustomerId={effectiveCustomerId}
            pushToast={toast.push}
            navigate={navigate}
            focusRecordId={focusRecordId}
            onRenameOrganization={onRenameOrganization}
          />
        </section>
      </section>
      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </main>
  );
}

function SidebarNav({ items, activeView, onNavigate }: { items: NavItem[]; activeView: string; onNavigate: (id: string) => void }) {
  return (
    <nav aria-label="Sections">
      {items.map((item) => {
        const isParentActive = item.id === activeView || (item.children?.some((child) => child.id === activeView) ?? false);
        const hasChildren = Boolean(item.children);
        const Icon = item.icon;
        return (
          <div className="sidebar-nav-group" key={item.id}>
            <button
              type="button"
              className={isParentActive ? 'nav-item active' : 'nav-item'}
              aria-expanded={hasChildren ? isParentActive : undefined}
              aria-current={!hasChildren && isParentActive ? 'page' : undefined}
              onClick={() => onNavigate(item.children ? item.children[0].id : item.id)}
            >
              <span className="nav-item-label">{Icon && <Icon aria-hidden="true" size={18} />}<span>{item.label}</span></span>
              {hasChildren && <ChevronRight className="nav-chevron" aria-hidden="true" size={16} />}
            </button>
            {item.children && isParentActive && (
              <div className="sidebar-subnav">
                {item.children.map((child) => (
                  <button
                    type="button"
                    key={child.id}
                    className={child.id === activeView ? 'nav-subitem active' : 'nav-subitem'}
                    aria-current={child.id === activeView ? 'page' : undefined}
                    onClick={() => onNavigate(child.id)}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
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

function WorkspaceContent(
  props: DeskActions & {
    activeView: string;
    title: string;
    subtitle: string;
    toolbar?: ReactNode;
    currentUser: AuthUser;
    selectedTechnicianId: string;
    selectedCustomerId: string;
    pushToast: (message: ReactNode, tone?: ToastTone) => void;
    navigate: (id: string, recordId?: string) => void;
    focusRecordId: string | null;
    onRenameOrganization: (name: string) => Promise<AuthUser>;
  },
) {
  const {
    state,
    activeView,
    title,
    subtitle,
    toolbar,
    currentUser,
    selectedTechnicianId,
    selectedCustomerId,
    createWorkItem,
    updateWorkItem,
    cancelWorkItem,
    deleteWorkItem,
    adjustInventory,
    addInventoryPart,
    deleteInventoryPart,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addTechnician,
    updateTechnician,
    deleteTechnician,
    notifyCustomerNow,
    createInvoice,
    updateInvoiceStatus,
    recordInvoicePayment,
    deleteInvoice,
    createSavedReport,
    deleteSavedReport,
    approveEstimate,
    reset,
    pushToast,
    navigate,
    focusRecordId,
    onRenameOrganization,
  } = props;
  const [selectedDeviceType, setSelectedDeviceType] = useState<DeviceType | 'All'>('All');

  const visibleCategories = useMemo(
    () => serviceCategories.filter((category) => selectedDeviceType === 'All' || category.deviceType === selectedDeviceType),
    [selectedDeviceType],
  );

  return (
    <ModuleFrame title={title} subtitle={subtitle} toolbar={toolbar} showHeader={viewsNeedingModuleHeader.has(activeView)}>
      {activeView === 'dashboard' && (
        <DashboardPanel profile={currentUser.profile} state={state} selectedTechnicianId={selectedTechnicianId} navigate={navigate} moduleAccess={currentUser.moduleAccess} />
      )}

      {activeView === 'organization' && (
        <OrganizationPanel currentUser={currentUser} navigate={navigate} onRenameOrganization={onRenameOrganization} pushToast={pushToast} />
      )}

      {activeView === 'users' && <UsersReport currentUser={currentUser} pushToast={pushToast} />}
      {activeView === 'customers' && (
        <CustomersPanel state={state} addCustomer={addCustomer} updateCustomer={updateCustomer} deleteCustomer={deleteCustomer} currentUser={currentUser} pushToast={pushToast} />
      )}
      {activeView === 'technicians' && (
        <TechniciansPanel
          state={state}
          addTechnician={addTechnician}
          updateTechnician={updateTechnician}
          deleteTechnician={deleteTechnician}
          currentUser={currentUser}
          pushToast={pushToast}
        />
      )}

      {activeView === 'inventory-report' && (
        <InventoryReport
          state={state}
          adjustInventory={adjustInventory}
          addInventoryPart={addInventoryPart}
          deleteInventoryPart={deleteInventoryPart}
          reset={reset}
          currentUser={currentUser}
          pushToast={pushToast}
        />
      )}

      {activeView === 'wi-board' && <KanbanBoard workItems={state.workItems} updateWorkItem={updateWorkItem} pushToast={pushToast} />}
      {(activeView === 'wi-all' || activeView === 'wi-walkins') && (
        <WorkItemsSection
          subView={activeView === 'wi-walkins' ? 'walkins' : 'all'}
          actorRole={currentUser.role}
          state={state}
          initialSelectedId={focusRecordId}
          createWorkItem={createWorkItem}
          updateWorkItem={updateWorkItem}
          cancelWorkItem={cancelWorkItem}
          deleteWorkItem={deleteWorkItem}
          notifyCustomerNow={notifyCustomerNow}
          pushToast={pushToast}
        />
      )}

      {(activeView === 'myjobs-assigned' || activeView === 'myjobs-estimates' || activeView === 'myjobs-repair') && (
        <MyJobsPanel activeView={activeView} state={state} selectedTechnicianId={selectedTechnicianId} updateWorkItem={updateWorkItem} adjustInventory={adjustInventory} pushToast={pushToast} />
      )}
      {activeView === 'parts' && <InventoryView state={state} adjustInventory={adjustInventory} />}

      {activeView === 'invoices-report' && (
        <InvoicesReport
          state={state}
          createInvoice={createInvoice}
          updateInvoiceStatus={updateInvoiceStatus}
          recordInvoicePayment={recordInvoicePayment}
          deleteInvoice={deleteInvoice}
          currentUser={currentUser}
          pushToast={pushToast}
        />
      )}

      {activeView === 'catalog' && (
        <ServiceCatalog selectedDeviceType={selectedDeviceType} setSelectedDeviceType={setSelectedDeviceType} visibleCategories={visibleCategories} />
      )}

      {activeView === 'reports' && (
        <ReportBuilder
          state={state}
          savedReports={state.savedReports}
          createSavedReport={(draft) => createSavedReport(draft, currentUser.id)}
          deleteSavedReport={deleteSavedReport}
          pushToast={pushToast}
        />
      )}

      {activeView === 'repairs' && (
        <RepairsPanel state={state} selectedCustomerId={selectedCustomerId} approveEstimate={approveEstimate} pushToast={pushToast} />
      )}
    </ModuleFrame>
  );
}

function WorkItemStatusChart({ workItems }: { workItems: WorkItem[] }) {
  const counts = statusFlow
    .map((status) => ({ status, count: workItems.filter((item) => item.status === status).length }))
    .filter((entry) => entry.count > 0);
  const max = Math.max(1, ...counts.map((entry) => entry.count));

  if (!counts.length) {
    return <EmptyState title="No active work items" body="Create a work item to see the status breakdown." />;
  }

  return (
    <div className="chart-widget">
      {counts.map((entry) => (
        <div className="chart-bar-row" key={entry.status}>
          <span className="chart-bar-label">{entry.status}</span>
          <div className="chart-bar-track">
            <div className={`chart-bar-fill status-${entry.status.toLowerCase().replaceAll(' ', '-')}`} style={{ width: `${(entry.count / max) * 100}%` }} />
          </div>
          <span className="chart-bar-value">{entry.count}</span>
        </div>
      ))}
    </div>
  );
}

function LowStockChart({ parts, onSelect }: { parts: (InventoryPart & { id: string })[]; onSelect: () => void }) {
  if (!parts.length) {
    return <EmptyState title="Stock levels are healthy" body="No parts are at or below their reorder point." />;
  }

  const max = Math.max(1, ...parts.map((part) => Math.max(part.quantity, part.reorderLevel)));

  return (
    <div className="chart-widget">
      {parts.map((part) => {
        const severity = part.quantity <= part.reorderLevel / 2 ? 'danger' : 'warning';
        return (
          <button type="button" className="chart-bar-row chart-bar-row-clickable" key={part.id} onClick={onSelect}>
            <span className="chart-bar-label">{part.name}</span>
            <div className="chart-bar-track">
              <div className={`chart-bar-fill severity-${severity}`} style={{ width: `${Math.min(100, (part.quantity / max) * 100)}%` }} />
            </div>
            <span className="chart-bar-value">{part.quantity}</span>
          </button>
        );
      })}
    </div>
  );
}

function RecentWorkItemsList({ items, onSelect }: { items: WorkItem[]; onSelect: (item: WorkItem) => void }) {
  if (!items.length) {
    return <EmptyState title="No work items yet" body="Create a work item to see it here." />;
  }

  return (
    <div className="activity-list">
      {items.map((item) => (
        <button type="button" className="activity-row" key={item.id} onClick={() => onSelect(item)}>
          <span className="activity-row-main">
            <strong>{item.deviceModel}</strong>
            <span>{item.customerName} · {item.id}</span>
          </span>
          <span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span>
        </button>
      ))}
    </div>
  );
}

function DashboardPanel({
  profile,
  state,
  selectedTechnicianId,
  navigate,
  moduleAccess,
}: {
  profile: AuthProfile;
  state: DeskActions['state'];
  selectedTechnicianId: string;
  navigate: (id: string, recordId?: string) => void;
  moduleAccess: ModuleId[];
}) {
  const metrics = getMetrics(state);
  const stockSectionId = moduleAccess.includes('admin') || moduleAccess.includes('agent') ? 'inventory-report' : 'parts';
  const lowStockParts = state.inventoryParts.filter((part) => part.quantity <= part.reorderLevel).map((part) => ({ ...part, id: part.sku }));

  if (profile === 'admin') {
    return (
      <div className="creator-page">
        <div className="creator-report-grid">
          <MetricCard label="Customers" value={String(state.customers.length)} helper="Customer master records" onClick={() => navigate('customers')} />
          <MetricCard label="Technicians" value={String(state.technicians.length)} helper="Repair bench users" onClick={() => navigate('technicians')} />
          <MetricCard label="Invoices" value={String(state.invoices.length)} helper={`${currencyFormatter.format(metrics.invoicedRevenue)} total`} onClick={() => navigate('invoices-report')} />
          <MetricCard label="Parts" value={String(state.inventoryParts.length)} helper="Inventory SKUs" onClick={() => navigate('parts')} />
        </div>
        <div className="creator-record-grid">
          <div className="creator-list-panel">
            <ListHeader title="Work items by status" count={state.workItems.length} />
            <WorkItemStatusChart workItems={state.workItems} />
          </div>
          <div className="creator-list-panel">
            <ListHeader title="Low stock alerts" count={lowStockParts.length} />
            <LowStockChart parts={lowStockParts} onSelect={() => navigate(stockSectionId)} />
          </div>
        </div>
        <div className="creator-list-panel">
          <ListHeader title="Recent work items" count={Math.min(6, state.workItems.length)} />
          <RecentWorkItemsList items={state.workItems.slice(0, 6)} onSelect={(item) => navigate('wi-all', item.id)} />
        </div>
      </div>
    );
  }

  if (profile === 'technician') {
    const assignedItems = state.workItems.filter((item) => item.assignedTechnicianId === selectedTechnicianId && item.status !== 'Cancelled');
    return <DataGrid title="My assigned jobs" columns={workItemGridColumns} rows={assignedItems} onRowClick={() => navigate('myjobs-assigned')} />;
  }

  return (
    <div className="creator-page">
      <div className="creator-record-grid">
        <div className="creator-list-panel">
          <ListHeader title="Work items by status" count={state.workItems.length} />
          <WorkItemStatusChart workItems={state.workItems} />
        </div>
        <div className="creator-list-panel">
          <ListHeader title="Low stock alerts" count={lowStockParts.length} />
          <LowStockChart parts={lowStockParts} onSelect={() => navigate(stockSectionId)} />
        </div>
      </div>
      <div className="creator-list-panel">
        <ListHeader title="Recent work items" count={Math.min(6, state.workItems.length)} />
        <RecentWorkItemsList items={state.workItems.slice(0, 6)} onSelect={(item) => navigate('wi-all', item.id)} />
      </div>
    </div>
  );
}

const MANAGED_USERS_STORAGE_KEY = 'service-desk-managed-users';

const seedManagedUsers = (currentUser: AuthUser): ManagedUser[] => [
  { ...currentUser, active: true, createdAt: 'Local demo', createdBy: 'System', updatedAt: 'Local demo', updatedBy: 'System' },
  { id: 'user-agent', name: 'Agent User', email: 'agent@servicedesk.local', role: 'Agent', profile: 'agent', moduleAccess: ['agent'], organizationId: currentUser.organizationId, organizationName: currentUser.organizationName, active: true, createdAt: 'Local demo', createdBy: 'System', updatedAt: 'Local demo', updatedBy: 'System' },
  { id: 'user-technician', name: 'Technician User', email: 'tech@servicedesk.local', role: 'Technician', profile: 'technician', moduleAccess: ['technician'], organizationId: currentUser.organizationId, organizationName: currentUser.organizationName, active: true, createdAt: 'Local demo', createdBy: 'System', updatedAt: 'Local demo', updatedBy: 'System' },
  { id: 'user-customer', name: 'Customer User', email: 'customer@servicedesk.local', role: 'Customer', profile: 'customer', moduleAccess: ['customer'], organizationId: currentUser.organizationId, organizationName: currentUser.organizationName, active: true, createdAt: 'Local demo', createdBy: 'System', updatedAt: 'Local demo', updatedBy: 'System' },
];

const loadLocalManagedUsers = (currentUser: AuthUser): ManagedUser[] => {
  try {
    const raw = localStorage.getItem(MANAGED_USERS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as ManagedUser[];
    }
  } catch {
    // Ignore malformed storage and fall back to the seed below.
  }
  return seedManagedUsers(currentUser);
};

const saveLocalManagedUsers = (users: ManagedUser[]) => {
  try {
    localStorage.setItem(MANAGED_USERS_STORAGE_KEY, JSON.stringify(users));
  } catch {
    // Ignore write failures (e.g. private browsing storage limits).
  }
};

function NewUserForm({ currentUser, pushToast, onDone }: { currentUser: AuthUser; pushToast: (message: ReactNode, tone?: ToastTone) => void; onDone: () => void }) {
  const [userDraft, setUserDraft] = useState<UserDraft>(blankUser);
  const [userError, setUserError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserError(null);
    if (!isApiPersistenceEnabled) {
      const created: ManagedUser = {
        id: `local-${Date.now()}`,
        role: profileToRole(userDraft.profile),
        moduleAccess: profileToModules(userDraft.profile),
        organizationId: currentUser.organizationId,
        organizationName: currentUser.organizationName,
        createdAt: nowStamp(),
        createdBy: currentUser.name,
        updatedAt: nowStamp(),
        updatedBy: currentUser.name,
        ...userDraft,
      };
      saveLocalManagedUsers([created, ...loadLocalManagedUsers(currentUser)]);
      pushToast(`Created user ${userDraft.name || userDraft.email}.`);
      onDone();
      return;
    }

    setIsSubmitting(true);
    try {
      await userApi.create(userDraft);
      pushToast(`Created user ${userDraft.name || userDraft.email}.`);
      onDone();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create user.';
      setUserError(message);
      pushToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreatorFormCard title="Create user" eyebrow="User form">
      <form className="creator-form" onSubmit={(event) => void submitUser(event)}>
        <label>Name<input required value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} placeholder="New staff or customer" /></label>
        <label>Email<input required type="email" value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} placeholder="name@example.com" /></label>
        <div className="form-row"><label>Profile<select value={userDraft.profile} onChange={(event) => setUserDraft({ ...userDraft, profile: event.target.value as AuthProfile })}>{authProfiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}</select></label><label>Password<input required type="password" minLength={8} value={userDraft.password} onChange={(event) => setUserDraft({ ...userDraft, password: event.target.value })} placeholder="Minimum 8 chars" /></label></div>
        <label className="inline-check"><input type="checkbox" checked={userDraft.active} onChange={(event) => setUserDraft({ ...userDraft, active: event.target.checked })} /> Active user</label>
        {userError && <div className="login-error">{userError}</div>}
        <div className="card-actions">
          <button className="primary-button icon-button" type="submit" disabled={isSubmitting}><UserPlus aria-hidden="true" size={16} /><span>{isSubmitting ? 'Creating…' : 'Create user'}</span></button>
          <button type="button" className="secondary-button" onClick={onDone} disabled={isSubmitting}>Cancel</button>
        </div>
      </form>
    </CreatorFormCard>
  );
}

function UserEditForm({
  managedUser,
  onSave,
  onDone,
  pushToast,
}: {
  managedUser: ManagedUser;
  onSave: (draft: UserDraft) => Promise<void>;
  onDone: () => void;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [draft, setDraft] = useState({ name: managedUser.name, email: managedUser.email, profile: managedUser.profile });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSave({ ...draft, active: managedUser.active, password: '' });
      pushToast(`Saved changes for ${draft.name}.`);
      onDone();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to save user.';
      setError(message);
      pushToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreatorFormCard title="Edit user" eyebrow="User form">
      <form className="creator-form" onSubmit={(event) => void submit(event)}>
        <label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Email<input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label>Profile<select value={draft.profile} onChange={(event) => setDraft({ ...draft, profile: event.target.value as AuthProfile })}>{authProfiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}</select></label>
        {error && <div className="login-error">{error}</div>}
        <div className="card-actions">
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button>
          <button className="secondary-button" type="button" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </CreatorFormCard>
  );
}

function OrganizationPanel({
  currentUser,
  navigate,
  onRenameOrganization,
  pushToast,
}: {
  currentUser: AuthUser;
  navigate: (id: string, recordId?: string) => void;
  onRenameOrganization: (name: string) => Promise<AuthUser>;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [organizationName, setOrganizationName] = useState(currentUser.organizationName);
  const [lastSyncedName, setLastSyncedName] = useState(currentUser.organizationName);
  const [isSaving, setIsSaving] = useState(false);

  if (currentUser.organizationName !== lastSyncedName) {
    setLastSyncedName(currentUser.organizationName);
    setOrganizationName(currentUser.organizationName);
  }

  const hasChanges = organizationName.trim().length > 0 && organizationName.trim() !== currentUser.organizationName;

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onRenameOrganization(organizationName);
      pushToast('Organization settings saved.');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Unable to save organization settings.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="creator-page">
      <section className="creator-panel">
        <div className="creator-panel-header">
          <div>
            <p className="eyebrow">Organization profile</p>
            <h2>{currentUser.organizationName}</h2>
            <p className="module-subtitle">Organization ID: {currentUser.organizationId}</p>
          </div>
          <div className="card-actions">
            <button type="button" className="secondary-dark-button" onClick={() => navigate('users')}>View all users</button>
            <button type="button" className="primary-button icon-button" onClick={() => setShowBulkAdd(true)}>
              <UserPlus aria-hidden="true" size={16} />
              <span>Bulk add users</span>
            </button>
          </div>
        </div>
      </section>

      <section className="creator-panel">
        <div className="creator-panel-header"><div><p className="eyebrow">Organization settings</p><h2>General</h2></div></div>
        <form className="creator-form view-canvas" onSubmit={(event) => void saveSettings(event)}>
          <label>
            Organization name
            <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required minLength={2} />
          </label>
          <div className="card-actions">
            <button type="submit" className="primary-button" disabled={!hasChanges || isSaving}>{isSaving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </section>

      {showBulkAdd && (
        <Modal title="Bulk add users" onClose={() => setShowBulkAdd(false)}>
          <BulkAddUsersForm currentUser={currentUser} onDone={() => setShowBulkAdd(false)} />
        </Modal>
      )}
    </div>
  );
}

function parseUserCsv(text: string): { rows: BulkUserRow[]; errors: Array<{ row: number; reason: string }> } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (!lines.length) {
    return { rows: [], errors: [] };
  }

  const firstCells = lines[0].split(',').map((cell) => cell.trim().toLowerCase());
  const hasHeader = firstCells.includes('name') && firstCells.includes('email');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const rows: BulkUserRow[] = [];
  const errors: Array<{ row: number; reason: string }> = [];

  dataLines.forEach((line, index) => {
    const rowNumber = index + 1;
    const [name = '', email = '', profileRaw = ''] = line.split(',').map((cell) => cell.trim());

    if (!name || !email || !profileRaw) {
      errors.push({ row: rowNumber, reason: 'Expected 3 columns: name, email, profile.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: rowNumber, reason: `Invalid email "${email}".` });
      return;
    }
    const profile = profileRaw.toLowerCase() as AuthProfile;
    if (!authProfiles.includes(profile)) {
      errors.push({ row: rowNumber, reason: `Invalid profile "${profileRaw}" — use one of ${authProfiles.join(', ')}.` });
      return;
    }

    rows.push({ name, email: email.toLowerCase(), profile });
  });

  return { rows, errors };
}

function generateTemporaryPassword(): string {
  return `${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6)}Aa1`;
}

function BulkAddUsersForm({ currentUser, onDone }: { currentUser: AuthUser; onDone: () => void }) {
  const [csvText, setCsvText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<BulkUserCreationResult | null>(null);

  const { rows: parsedRows, errors: parseErrors } = useMemo(() => parseUserCsv(csvText), [csvText]);

  const submit = async () => {
    if (!parsedRows.length) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (!isApiPersistenceEnabled) {
        const existing = loadLocalManagedUsers(currentUser);
        const existingEmails = new Set(existing.map((user) => user.email.toLowerCase()));
        const created: BulkUserCreationResult['created'] = [];
        const failed: BulkUserCreationResult['failed'] = [];
        const newUsers: ManagedUser[] = [];
        const stamp = nowStamp();

        parsedRows.forEach((row, index) => {
          if (existingEmails.has(row.email)) {
            failed.push({ row: index + 1, reason: 'A user with this email already exists.' });
            return;
          }
          const temporaryPassword = generateTemporaryPassword();
          newUsers.push({
            id: `local-${Date.now()}-${index}`,
            name: row.name,
            email: row.email,
            profile: row.profile,
            role: profileToRole(row.profile),
            moduleAccess: profileToModules(row.profile),
            organizationId: currentUser.organizationId,
            organizationName: currentUser.organizationName,
            active: true,
            createdAt: stamp,
            createdBy: currentUser.name,
            updatedAt: stamp,
            updatedBy: currentUser.name,
          });
          existingEmails.add(row.email);
          created.push({ name: row.name, email: row.email, profile: row.profile, temporaryPassword });
        });

        saveLocalManagedUsers([...newUsers, ...existing]);
        setResult({ created, failed });
      } else {
        setResult(await userApi.bulkCreate(parsedRows));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="creator-form">
        {result.created.length > 0 && (
          <div className="creator-list-panel">
            <ListHeader title="Created" count={result.created.length} />
            {result.created.map((user) => (
              <div className="record-row" key={user.email}>
                <div><strong>{user.name}</strong><span>{user.email} · {user.profile}</span></div>
                <div className="card-actions">
                  <code>{user.temporaryPassword}</code>
                  <button
                    type="button"
                    className="icon-toolbar-button"
                    aria-label={`Copy password for ${user.name}`}
                    onClick={() => void navigator.clipboard.writeText(user.temporaryPassword)}
                  >
                    <Copy aria-hidden="true" size={14} />
                  </button>
                </div>
              </div>
            ))}
            <p className="workflow-warning">These temporary passwords are shown once — copy and share them with each user now.</p>
          </div>
        )}
        {result.failed.length > 0 && (
          <div className="creator-list-panel">
            <ListHeader title="Failed" count={result.failed.length} />
            {result.failed.map((failure) => (
              <div className="record-row" key={failure.row}>
                <div><strong>Row {failure.row}</strong><span>{failure.reason}</span></div>
              </div>
            ))}
          </div>
        )}
        <div className="card-actions">
          <button type="button" className="primary-button" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="creator-form">
      <label>
        Paste CSV — one user per line: name, email, profile ({authProfiles.join('/')})
        <textarea
          rows={8}
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder={'Jane Doe, jane@example.com, agent\nJohn Smith, john@example.com, technician'}
        />
      </label>
      {parseErrors.length > 0 && (
        <ul className="timeline">
          {parseErrors.map((error) => <li key={error.row}>Row {error.row}: {error.reason}</li>)}
        </ul>
      )}
      {parsedRows.length > 0 && <p className="muted">{parsedRows.length} valid row{parsedRows.length === 1 ? '' : 's'} ready to create.</p>}
      <div className="card-actions">
        <button type="button" className="primary-button" onClick={() => void submit()} disabled={!parsedRows.length || isSubmitting}>
          {isSubmitting ? 'Creating…' : `Create ${parsedRows.length || ''} user${parsedRows.length === 1 ? '' : 's'}`}
        </button>
        <button type="button" className="secondary-button" onClick={onDone} disabled={isSubmitting}>Cancel</button>
      </div>
    </div>
  );
}

function UsersReport({ currentUser, pushToast }: { currentUser: AuthUser; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const [users, setUsers] = useState<ManagedUser[]>(() => (isApiPersistenceEnabled ? [] : loadLocalManagedUsers(currentUser)));
  const [userError, setUserError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const editingUser = editingId ? users.find((managedUser) => managedUser.id === editingId) : undefined;

  const refreshUsers = () => {
    if (!isApiPersistenceEnabled) {
      setUsers(loadLocalManagedUsers(currentUser));
      return;
    }
    void userApi.list().then((response) => setUsers(response.users)).catch((error: unknown) => setUserError(error instanceof Error ? error.message : 'Unable to load users.'));
  };

  useEffect(() => {
    if (!isApiPersistenceEnabled) {
      return;
    }

    void userApi.list().then((response) => setUsers(response.users)).catch((error: unknown) => setUserError(error instanceof Error ? error.message : 'Unable to load users.'));
  }, []);

  const toggleUser = async (managedUser: ManagedUser) => {
    if (managedUser.active && !window.confirm(`Deactivate ${managedUser.name}? They will immediately lose access to their module.`)) {
      return;
    }

    if (!isApiPersistenceEnabled) {
      const next = users.map((item) => (item.id === managedUser.id ? { ...item, active: !item.active } : item));
      setUsers(next);
      saveLocalManagedUsers(next);
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

  const saveUser = async (managedUser: ManagedUser, draft: UserDraft) => {
    if (!isApiPersistenceEnabled) {
      const next = users.map((item) =>
        item.id === managedUser.id
          ? { ...item, name: draft.name, email: draft.email, profile: draft.profile, active: draft.active, role: profileToRole(draft.profile), moduleAccess: profileToModules(draft.profile) }
          : item,
      );
      setUsers(next);
      saveLocalManagedUsers(next);
      return;
    }

    const response = await userApi.update(managedUser.id, draft);
    setUsers(response.users);
  };

  const activeAdminCount = users.filter((managedUser) => managedUser.profile === 'admin' && managedUser.active).length;

  const removeUser = async (managedUser: ManagedUser) => {
    if (managedUser.id === currentUser.id) {
      pushToast('You cannot delete your own account.', 'error');
      return;
    }
    if (managedUser.profile === 'admin' && managedUser.active && activeAdminCount <= 1) {
      pushToast('Cannot delete the only active admin account.', 'error');
      return;
    }
    if (!window.confirm(`Delete user ${managedUser.name}? This cannot be undone.`)) {
      return;
    }

    if (!isApiPersistenceEnabled) {
      const next = users.filter((item) => item.id !== managedUser.id);
      setUsers(next);
      saveLocalManagedUsers(next);
      pushToast(`Deleted user ${managedUser.name}.`);
      return;
    }

    try {
      const response = await userApi.remove(managedUser.id);
      setUsers(response.users);
      pushToast(`Deleted user ${managedUser.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete user.';
      setUserError(message);
      pushToast(message, 'error');
    }
  };

  const bulkDeleteUsers = async (selected: ManagedUser[]) => {
    const blocked: ManagedUser[] = [];
    const deletable: ManagedUser[] = [];
    let remainingActiveAdmins = activeAdminCount;

    selected.forEach((managedUser) => {
      if (managedUser.id === currentUser.id) {
        blocked.push(managedUser);
        return;
      }
      const isActiveAdmin = managedUser.profile === 'admin' && managedUser.active;
      if (isActiveAdmin && remainingActiveAdmins <= 1) {
        blocked.push(managedUser);
        return;
      }
      if (isActiveAdmin) {
        remainingActiveAdmins -= 1;
      }
      deletable.push(managedUser);
    });

    if (blocked.length) {
      pushToast(`${blocked.length} user${blocked.length === 1 ? '' : 's'} could not be deleted (your own account or the last active admin): ${blocked.map((managedUser) => managedUser.name).join(', ')}.`, 'error');
    }
    if (!deletable.length) {
      return;
    }
    if (!window.confirm(`Delete ${deletable.length} user${deletable.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }

    if (!isApiPersistenceEnabled) {
      const deletableIds = new Set(deletable.map((managedUser) => managedUser.id));
      const next = users.filter((item) => !deletableIds.has(item.id));
      setUsers(next);
      saveLocalManagedUsers(next);
      pushToast(`Deleted ${deletable.length} user${deletable.length === 1 ? '' : 's'}.`);
      return;
    }

    try {
      let response: { users: ManagedUser[] } = { users };
      for (const managedUser of deletable) {
        response = await userApi.remove(managedUser.id);
      }
      setUsers(response.users);
      pushToast(`Deleted ${deletable.length} user${deletable.length === 1 ? '' : 's'}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete user.';
      setUserError(message);
      pushToast(message, 'error');
    }
  };

  const userBulkEditFields: BulkEditField<ManagedUser>[] = [
    { key: 'name', label: 'Name', type: 'text', apply: (value) => ({ name: value }) },
    { key: 'email', label: 'Email', type: 'text', apply: (value) => ({ email: value }) },
    { key: 'profile', label: 'Profile', type: 'select', options: [...authProfiles], apply: (value) => ({ profile: value as AuthProfile }) },
  ];

  const bulkEditUsers = (selected: ManagedUser[], patch: Partial<ManagedUser>) => {
    void Promise.all(selected.map((managedUser) => saveUser(managedUser, { name: managedUser.name, email: managedUser.email, profile: managedUser.profile, active: managedUser.active, password: '', ...patch })))
      .then(() => {
        pushToast(`Updated ${selected.length} user${selected.length === 1 ? '' : 's'}.`);
        refreshUsers();
      });
  };

  if (isCreating) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setIsCreating(false)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Users report</span>
        </button>
        <NewUserForm currentUser={currentUser} pushToast={pushToast} onDone={() => { setIsCreating(false); refreshUsers(); }} />
      </div>
    );
  }

  if (editingUser) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setEditingId(null)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Users report</span>
        </button>
        <UserEditForm managedUser={editingUser} onSave={(draft) => saveUser(editingUser, draft)} onDone={() => setEditingId(null)} pushToast={pushToast} />
      </div>
    );
  }

  const columns: DataGridColumn<ManagedUser>[] = [
    { key: 'name', label: 'Name', render: (managedUser) => <strong>{managedUser.name}</strong>, sortValue: (managedUser) => managedUser.name, searchValue: (managedUser) => managedUser.name },
    { key: 'email', label: 'Email', render: (managedUser) => managedUser.email, sortValue: (managedUser) => managedUser.email, searchValue: (managedUser) => managedUser.email },
    { key: 'profile', label: 'Profile', render: (managedUser) => <span className="pill">{managedUser.profile}</span>, sortValue: (managedUser) => managedUser.profile, searchValue: (managedUser) => managedUser.profile },
    { key: 'status', label: 'Status', render: (managedUser) => <span className={managedUser.active ? 'stock-ok' : 'muted'}>{managedUser.active ? 'Active' : 'Inactive'}</span>, sortValue: (managedUser) => (managedUser.active ? 0 : 1) },
    ...auditColumns<ManagedUser>(),
    {
      key: 'action',
      label: 'Action',
      render: (managedUser) => (
        <button className={managedUser.active ? 'danger-button' : 'secondary-dark-button'} type="button" onClick={() => void toggleUser(managedUser)} disabled={managedUser.id === currentUser.id}>
          {managedUser.active ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (managedUser) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-toolbar-button" aria-label={`Edit ${managedUser.name}`} onClick={() => setEditingId(managedUser.id)}><Pencil aria-hidden="true" size={14} /></button>
          <button
            type="button"
            className="icon-toolbar-button is-danger"
            aria-label={`Delete ${managedUser.name}`}
            disabled={managedUser.id === currentUser.id}
            onClick={() => void removeUser(managedUser)}
          >
            <Trash2 aria-hidden="true" size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      {userError && <div className="login-error">{userError}</div>}
      <DataGrid
        onBulkDelete={(rows) => void bulkDeleteUsers(rows)}
        bulkEditFields={userBulkEditFields}
        onBulkEditApply={bulkEditUsers}
        title="Users report"
        columns={columns}
        rows={users}
        onAddNew={() => setIsCreating(true)}
        addLabel="New user"
      />
    </>
  );
}

function CustomerEditForm({
  customer,
  updateCustomer,
  actor,
  pushToast,
  onDone,
}: {
  customer: Customer;
  updateCustomer: DeskActions['updateCustomer'];
  actor: string;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState({ name: customer.name, phone: customer.phone, email: customer.email });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void updateCustomer(customer.id, draft, actor);
    pushToast(`Saved changes for ${draft.name}.`);
    onDone();
  };

  return (
    <CreatorFormCard title="Edit customer" eyebrow="Customer master">
      <form className="creator-form" onSubmit={submit}>
        <label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>Phone<input required value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
        <label>Email<input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <div className="card-actions">
          <button className="primary-button" type="submit">Save changes</button>
          <button className="secondary-button" type="button" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </CreatorFormCard>
  );
}

function NewCustomerForm({
  addCustomer,
  actor,
  pushToast,
  onDone,
}: {
  addCustomer: DeskActions['addCustomer'];
  actor: string;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState({ name: '', phone: '', email: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await addCustomer(draft, actor);
      pushToast(`Added customer ${draft.name}.`);
      onDone();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreatorFormCard title="Create customer" eyebrow="Customer master">
      <form className="creator-form" onSubmit={(event) => void submit(event)}>
        <label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Jane Doe" /></label>
        <label>Phone<input required value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="+1 555 0100" /></label>
        <label>Email<input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="jane@example.com" /></label>
        <div className="card-actions">
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create customer'}</button>
          <button className="secondary-button" type="button" onClick={onDone} disabled={isSubmitting}>Cancel</button>
        </div>
      </form>
    </CreatorFormCard>
  );
}

function CustomersPanel({
  state,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  currentUser,
  pushToast,
}: {
  state: DeskActions['state'];
  addCustomer: DeskActions['addCustomer'];
  updateCustomer: DeskActions['updateCustomer'];
  deleteCustomer: DeskActions['deleteCustomer'];
  currentUser: AuthUser;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const editingCustomer = editingId ? state.customers.find((customer) => customer.id === editingId) : undefined;

  const removeCustomer = (customer: Customer) => {
    const usage = state.workItems.filter((item) => item.customerId === customer.id).length;
    if (usage > 0) {
      pushToast(`Cannot delete ${customer.name} — they have ${usage} work item${usage === 1 ? '' : 's'} on file.`, 'error');
      return;
    }
    if (!window.confirm(`Delete customer ${customer.name}? This cannot be undone.`)) {
      return;
    }
    void deleteCustomer(customer.id);
    pushToast(`Deleted customer ${customer.name}.`);
  };

  const bulkDeleteCustomers = (customers: Customer[]) => {
    const blocked = customers.filter((customer) => state.workItems.some((item) => item.customerId === customer.id));
    const deletable = customers.filter((customer) => !state.workItems.some((item) => item.customerId === customer.id));
    if (blocked.length) {
      pushToast(`${blocked.length} customer${blocked.length === 1 ? '' : 's'} have work items and were not deleted: ${blocked.map((customer) => customer.name).join(', ')}.`, 'error');
    }
    if (!deletable.length) {
      return;
    }
    if (!window.confirm(`Delete ${deletable.length} customer${deletable.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }
    deletable.forEach((customer) => void deleteCustomer(customer.id));
    pushToast(`Deleted ${deletable.length} customer${deletable.length === 1 ? '' : 's'}.`);
  };

  const customerBulkEditFields: BulkEditField<Customer>[] = [
    { key: 'name', label: 'Name', type: 'text', apply: (value) => ({ name: value }) },
    { key: 'phone', label: 'Phone', type: 'text', apply: (value) => ({ phone: value }) },
    { key: 'email', label: 'Email', type: 'text', apply: (value) => ({ email: value }) },
  ];

  const bulkEditCustomers = (customers: Customer[], patch: Partial<Customer>) => {
    customers.forEach((customer) => void updateCustomer(customer.id, { name: customer.name, phone: customer.phone, email: customer.email, ...patch }, currentUser.name));
    pushToast(`Updated ${customers.length} customer${customers.length === 1 ? '' : 's'}.`);
  };

  if (isCreating) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setIsCreating(false)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Customer master</span>
        </button>
        <NewCustomerForm addCustomer={addCustomer} actor={currentUser.name} pushToast={pushToast} onDone={() => setIsCreating(false)} />
      </div>
    );
  }

  if (editingCustomer) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setEditingId(null)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Customer master</span>
        </button>
        <CustomerEditForm customer={editingCustomer} updateCustomer={updateCustomer} actor={currentUser.name} pushToast={pushToast} onDone={() => setEditingId(null)} />
      </div>
    );
  }

  const columns: DataGridColumn<Customer>[] = [
    { key: 'name', label: 'Name', render: (customer) => <strong>{customer.name}</strong>, sortValue: (customer) => customer.name, searchValue: (customer) => customer.name },
    { key: 'phone', label: 'Phone', render: (customer) => customer.phone, sortValue: (customer) => customer.phone, searchValue: (customer) => customer.phone },
    { key: 'email', label: 'Email', render: (customer) => customer.email, sortValue: (customer) => customer.email, searchValue: (customer) => customer.email },
    { key: 'repairs', label: 'Repairs', render: (customer) => state.workItems.filter((item) => item.customerId === customer.id).length, sortValue: (customer) => state.workItems.filter((item) => item.customerId === customer.id).length },
    ...auditColumns<Customer>(),
    {
      key: 'actions',
      label: 'Actions',
      render: (customer) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-toolbar-button" aria-label={`Edit ${customer.name}`} onClick={() => setEditingId(customer.id)}><Pencil aria-hidden="true" size={14} /></button>
          <button type="button" className="icon-toolbar-button is-danger" aria-label={`Delete ${customer.name}`} onClick={() => removeCustomer(customer)}><Trash2 aria-hidden="true" size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <DataGrid
      onBulkDelete={bulkDeleteCustomers}
      bulkEditFields={customerBulkEditFields}
      onBulkEditApply={bulkEditCustomers}
      title="Customer master"
      columns={columns}
      rows={state.customers}
      onAddNew={() => setIsCreating(true)}
      addLabel="New customer"
    />
  );
}

function TechnicianForm({
  technician,
  onSave,
  onDone,
  pushToast,
}: {
  technician?: Technician;
  onSave: (draft: TechnicianDraft) => Promise<void>;
  onDone: () => void;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [draft, setDraft] = useState<TechnicianDraft>({ name: technician?.name ?? '', email: technician?.email ?? '', specialties: technician?.specialties ?? [] });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleSpecialty = (type: DeviceType) => {
    setDraft((current) => ({
      ...current,
      specialties: current.specialties.includes(type) ? current.specialties.filter((item) => item !== type) : [...current.specialties, type],
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSave(draft);
      pushToast(`Saved technician ${draft.name}.`);
      onDone();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to save technician.';
      setError(message);
      pushToast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreatorFormCard title={technician ? 'Edit technician' : 'Create technician'} eyebrow="Technician form">
      <form className="creator-form" onSubmit={(event) => void submit(event)}>
        <label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Repair bench technician" /></label>
        <label>Email<input required type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="name@servicedesk.local" /></label>
        <label>Specialties
          <span className="checkbox-grid">
            {deviceTypes.map((type) => (
              <label className="inline-check" key={type}><input type="checkbox" checked={draft.specialties.includes(type)} onChange={() => toggleSpecialty(type)} /> {type}</label>
            ))}
          </span>
        </label>
        {error && <div className="login-error">{error}</div>}
        <div className="card-actions">
          <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button>
          <button className="secondary-button" type="button" onClick={onDone}>Cancel</button>
        </div>
      </form>
    </CreatorFormCard>
  );
}

function TechniciansPanel({
  state,
  addTechnician,
  updateTechnician,
  deleteTechnician,
  currentUser,
  pushToast,
}: {
  state: DeskActions['state'];
  addTechnician: DeskActions['addTechnician'];
  updateTechnician: DeskActions['updateTechnician'];
  deleteTechnician: DeskActions['deleteTechnician'];
  currentUser: AuthUser;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const editingTechnician = editingId ? state.technicians.find((technician) => technician.id === editingId) : undefined;

  const removeTechnician = (technician: Technician) => {
    const usage = state.workItems.filter((item) => item.assignedTechnicianId === technician.id).length;
    if (usage > 0) {
      pushToast(`Cannot delete ${technician.name} — assigned to ${usage} work item${usage === 1 ? '' : 's'}.`, 'error');
      return;
    }
    if (!window.confirm(`Delete technician ${technician.name}? This cannot be undone.`)) {
      return;
    }
    void deleteTechnician(technician.id);
    pushToast(`Deleted technician ${technician.name}.`);
  };

  const bulkDeleteTechnicians = (candidates: Technician[]) => {
    const blocked = candidates.filter((technician) => state.workItems.some((item) => item.assignedTechnicianId === technician.id));
    const deletable = candidates.filter((technician) => !state.workItems.some((item) => item.assignedTechnicianId === technician.id));
    if (blocked.length) {
      pushToast(`${blocked.length} technician${blocked.length === 1 ? '' : 's'} assigned to work items and not deleted: ${blocked.map((technician) => technician.name).join(', ')}.`, 'error');
    }
    if (!deletable.length) {
      return;
    }
    if (!window.confirm(`Delete ${deletable.length} technician${deletable.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }
    deletable.forEach((technician) => void deleteTechnician(technician.id));
    pushToast(`Deleted ${deletable.length} technician${deletable.length === 1 ? '' : 's'}.`);
  };

  const technicianBulkEditFields: BulkEditField<Technician>[] = [
    { key: 'name', label: 'Name', type: 'text', apply: (value) => ({ name: value }) },
    { key: 'email', label: 'Email', type: 'text', apply: (value) => ({ email: value }) },
  ];

  const bulkEditTechnicians = (technicians: Technician[], patch: Partial<Technician>) => {
    technicians.forEach((technician) => void updateTechnician(technician.id, { name: technician.name, email: technician.email, specialties: technician.specialties, ...patch }, currentUser.name));
    pushToast(`Updated ${technicians.length} technician${technicians.length === 1 ? '' : 's'}.`);
  };

  if (isCreating) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setIsCreating(false)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Technician master</span>
        </button>
        <TechnicianForm onSave={(draft) => addTechnician(draft, currentUser.name)} onDone={() => setIsCreating(false)} pushToast={pushToast} />
      </div>
    );
  }

  if (editingTechnician) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setEditingId(null)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Technician master</span>
        </button>
        <TechnicianForm technician={editingTechnician} onSave={(draft) => updateTechnician(editingTechnician.id, draft, currentUser.name)} onDone={() => setEditingId(null)} pushToast={pushToast} />
      </div>
    );
  }

  const columns: DataGridColumn<Technician>[] = [
    { key: 'name', label: 'Name', render: (tech) => <strong>{tech.name}</strong>, sortValue: (tech) => tech.name, searchValue: (tech) => tech.name },
    { key: 'email', label: 'Email', render: (tech) => tech.email, sortValue: (tech) => tech.email, searchValue: (tech) => tech.email },
    { key: 'specialties', label: 'Specialties', render: (tech) => tech.specialties.join(', '), searchValue: (tech) => tech.specialties.join(', ') },
    {
      key: 'active',
      label: 'Active jobs',
      render: (tech) => state.workItems.filter((item) => item.assignedTechnicianId === tech.id && !terminalStatuses.includes(item.status)).length,
      sortValue: (tech) => state.workItems.filter((item) => item.assignedTechnicianId === tech.id && !terminalStatuses.includes(item.status)).length,
    },
    ...auditColumns<Technician>(),
    {
      key: 'actions',
      label: 'Actions',
      render: (tech) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-toolbar-button" aria-label={`Edit ${tech.name}`} onClick={() => setEditingId(tech.id)}><Pencil aria-hidden="true" size={14} /></button>
          <button type="button" className="icon-toolbar-button is-danger" aria-label={`Delete ${tech.name}`} onClick={() => removeTechnician(tech)}><Trash2 aria-hidden="true" size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <DataGrid
      onBulkDelete={bulkDeleteTechnicians}
      bulkEditFields={technicianBulkEditFields}
      onBulkEditApply={bulkEditTechnicians}
      title="Technician master"
      columns={columns}
      rows={state.technicians}
      onAddNew={() => setIsCreating(true)}
      addLabel="New technician"
    />
  );
}

function NewInvoiceForm({
  state,
  createInvoice,
  actor,
  pushToast,
  onDone,
}: {
  state: DeskActions['state'];
  createInvoice: DeskActions['createInvoice'];
  actor: string;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  onDone: () => void;
}) {
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(() => blankInvoiceDraft(state.workItems[0]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedWorkItem = state.workItems.find((item) => item.id === invoiceDraft.workItemId);
  const invoiceTotal = invoiceDraft.laborAmount + invoiceDraft.partsAmount + invoiceDraft.diagnosticFee || invoiceDraft.amount;

  const submitInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await createInvoice(invoiceDraft, actor);
      pushToast(`Invoice issued for ${currencyFormatter.format(invoiceTotal)}.`);
      setInvoiceDraft(blankInvoiceDraft(state.workItems[0]));
      onDone();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreatorFormCard title="Create invoice" eyebrow="Invoice form">
      <form className="creator-form" onSubmit={(event) => void submitInvoice(event)}>
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
        <div className="card-actions">
          <button className="primary-button icon-button" type="submit" disabled={isSubmitting}><Receipt aria-hidden="true" size={16} /><span>{isSubmitting ? 'Issuing…' : 'Issue invoice'}</span></button>
          <button type="button" className="secondary-button" onClick={onDone} disabled={isSubmitting}>Cancel</button>
        </div>
      </form>
    </CreatorFormCard>
  );
}

function InvoicesReport({
  state,
  createInvoice,
  updateInvoiceStatus,
  recordInvoicePayment,
  deleteInvoice,
  currentUser,
  pushToast,
}: {
  state: DeskActions['state'];
  createInvoice: DeskActions['createInvoice'];
  updateInvoiceStatus: DeskActions['updateInvoiceStatus'];
  recordInvoicePayment: DeskActions['recordInvoicePayment'];
  deleteInvoice: DeskActions['deleteInvoice'];
  currentUser: AuthUser;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [isCreating, setIsCreating] = useState(false);

  const submitPayment = async (invoiceId: string, payment: InvoicePaymentDraft) => {
    await recordInvoicePayment(invoiceId, payment, currentUser.name);
    pushToast(`Payment recorded for ${invoiceId} via ${payment.method}.`);
  };

  const changeInvoiceStatus = (invoiceId: string, status: InvoiceStatus) => {
    void updateInvoiceStatus(invoiceId, status, currentUser.name);
  };

  if (isCreating) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setIsCreating(false)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Invoice register</span>
        </button>
        <NewInvoiceForm state={state} createInvoice={createInvoice} actor={currentUser.name} pushToast={pushToast} onDone={() => setIsCreating(false)} />
      </div>
    );
  }

  return (
    <InvoiceList
      invoices={state.invoices}
      updateInvoiceStatus={changeInvoiceStatus}
      recordPayment={submitPayment}
      deleteInvoice={deleteInvoice}
      pushToast={pushToast}
      onAddNew={() => setIsCreating(true)}
    />
  );
}


function NewWorkItemForm({
  technicians,
  createWorkItem,
  actor,
  pushToast,
  onDone,
}: {
  technicians: Technician[];
  createWorkItem: DeskActions['createWorkItem'];
  actor: string;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<WorkItemDraft>(blankDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await createWorkItem(draft, actor);
      pushToast(<>Created work item for <strong>{draft.customerName}</strong> · <strong>{draft.deviceModel}</strong>.</>);
      setDraft(blankDraft);
      onDone();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreatorFormCard title="Create a work item" eyebrow="Request form">
      <p className="muted">Capture online and walk-in customer requests, then assign the WI to a technician.</p>
      <form className="creator-form" onSubmit={(event) => void submit(event)}>
        <label>Customer name<input required value={draft.customerName} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} placeholder="Jane Doe" /></label>
        <div className="form-row"><label>Phone<input required value={draft.customerPhone} onChange={(event) => setDraft({ ...draft, customerPhone: event.target.value })} placeholder="+1 555 0100" /></label><label>Email<input required type="email" value={draft.customerEmail} onChange={(event) => setDraft({ ...draft, customerEmail: event.target.value })} placeholder="jane@example.com" /></label></div>
        <div className="form-row"><label>Source<select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value as WorkItemDraft['source'] })}><option>Walk-in</option><option>Online</option></select></label><label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as WorkItemDraft['priority'] })}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label></div>
        <div className="form-row"><label>Device type<select value={draft.deviceType} onChange={(event) => setDraft({ ...draft, deviceType: event.target.value as DeviceType })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Assigned technician<select value={draft.assignedTechnicianId} onChange={(event) => setDraft({ ...draft, assignedTechnicianId: event.target.value })}>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}</select></label></div>
        <label>Device model<input required value={draft.deviceModel} onChange={(event) => setDraft({ ...draft, deviceModel: event.target.value })} placeholder="MacBook Pro M2 / iPhone 14 / Gaming PC" /></label>
        <label>Serial number<input value={draft.serialNumber} onChange={(event) => setDraft({ ...draft, serialNumber: event.target.value })} placeholder="Optional serial / IMEI" /></label>
        <label>Issue summary<textarea required value={draft.issueSummary} onChange={(event) => setDraft({ ...draft, issueSummary: event.target.value })} placeholder="Describe symptoms, damage, accessories received, and urgency" /></label>
        <div className="card-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create WI'}</button>
          <button type="button" className="secondary-button" onClick={onDone} disabled={isSubmitting}>Cancel</button>
        </div>
      </form>
    </CreatorFormCard>
  );
}

function WorkItemsSection({
  subView,
  actorRole,
  state,
  initialSelectedId,
  createWorkItem,
  updateWorkItem,
  cancelWorkItem,
  deleteWorkItem,
  notifyCustomerNow,
  pushToast,
}: {
  subView: 'all' | 'walkins';
  actorRole: UserRole;
  state: DeskActions['state'];
  initialSelectedId?: string | null;
  createWorkItem: DeskActions['createWorkItem'];
  updateWorkItem: DeskActions['updateWorkItem'];
  cancelWorkItem: DeskActions['cancelWorkItem'];
  deleteWorkItem: DeskActions['deleteWorkItem'];
  notifyCustomerNow: DeskActions['notifyCustomerNow'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? '');
  const [isCreating, setIsCreating] = useState(false);
  const title = subView === 'walkins' ? 'Walk-in requests' : 'All work items';

  const list = subView === 'walkins' ? state.workItems.filter((item) => item.source === 'Walk-in') : state.workItems;
  const selected = selectedId ? state.workItems.find((item) => item.id === selectedId) : undefined;

  const cancelItem = (workItemId: string) => {
    if (!window.confirm('Cancel this work item? The customer will be notified and this cannot be undone.')) {
      return;
    }

    cancelWorkItem(workItemId, actorRole);
    pushToast('Work item cancelled.');
  };

  const removeWorkItem = (item: WorkItem) => {
    if (!window.confirm(`Delete work item ${item.id} (${item.deviceModel})? This also removes its invoices and cannot be undone.`)) {
      return;
    }
    void deleteWorkItem(item.id);
    pushToast(`Deleted work item ${item.id}.`);
  };

  const bulkDeleteWorkItems = (items: WorkItem[]) => {
    if (!window.confirm(`Delete ${items.length} work item${items.length === 1 ? '' : 's'}? This also removes their invoices and cannot be undone.`)) {
      return;
    }
    items.forEach((item) => void deleteWorkItem(item.id));
    pushToast(`Deleted ${items.length} work item${items.length === 1 ? '' : 's'}.`);
  };

  const workItemBulkEditFields: BulkEditField<WorkItem>[] = [
    { key: 'priority', label: 'Priority', type: 'select', options: [...priorities], apply: (value) => ({ priority: value as Priority }) },
    { key: 'status', label: 'Status', type: 'select', options: [...statusFlow], apply: (value) => ({ status: value as WorkItemStatus }) },
    {
      key: 'assignedTechnicianId',
      label: 'Assigned technician',
      type: 'select',
      options: state.technicians.map((tech) => ({ value: tech.id, label: tech.name })),
      apply: (value) => ({ assignedTechnicianId: value, status: 'Assigned' }),
    },
  ];

  const bulkEditWorkItems = (items: WorkItem[], patch: Partial<WorkItem>) => {
    items.forEach((item) => updateWorkItem(item.id, patch, actorRole, 'Bulk update.'));
    pushToast(`Updated ${items.length} work item${items.length === 1 ? '' : 's'}.`);
  };

  const columns: DataGridColumn<WorkItem>[] = [
    ...workItemGridColumns,
    {
      key: 'actions',
      label: 'Actions',
      render: (item) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-toolbar-button" aria-label={`Edit ${item.id}`} onClick={() => setSelectedId(item.id)}><Pencil aria-hidden="true" size={14} /></button>
          <button type="button" className="icon-toolbar-button is-danger" aria-label={`Delete ${item.id}`} onClick={() => removeWorkItem(item)}><Trash2 aria-hidden="true" size={14} /></button>
        </div>
      ),
    },
  ];

  if (isCreating) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setIsCreating(false)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to {title}</span>
        </button>
        <NewWorkItemForm technicians={state.technicians} createWorkItem={createWorkItem} actor={actorRole} pushToast={pushToast} onDone={() => setIsCreating(false)} />
      </div>
    );
  }

  return (
    <CreatorRecordBrowser
      title={title}
      records={list}
      columns={columns}
      selected={selected}
      setSelectedId={setSelectedId}
      onBack={() => setSelectedId('')}
      onAddNew={() => setIsCreating(true)}
      addLabel="New work item"
      onBulkDelete={bulkDeleteWorkItems}
      bulkEditFields={workItemBulkEditFields}
      onBulkEditApply={bulkEditWorkItems}
      detail={selected && (
        <WorkItemCard item={selected} technicians={state.technicians}>
          <div className="card-actions">
            <select aria-label="Reassign technician" value={selected.assignedTechnicianId} onChange={(event) => updateWorkItem(selected.id, { assignedTechnicianId: event.target.value, status: 'Assigned' }, actorRole, `${actorRole} reassigned the work item.`)}>
              {state.technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
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

function MyJobsPanel({
  activeView,
  state,
  selectedTechnicianId,
  updateWorkItem,
  adjustInventory,
  pushToast,
}: {
  activeView: string;
  state: DeskActions['state'];
  selectedTechnicianId: string;
  updateWorkItem: DeskActions['updateWorkItem'];
  adjustInventory: DeskActions['adjustInventory'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const assignedItems = state.workItems.filter((item) => (selectedTechnicianId === 'all' || item.assignedTechnicianId === selectedTechnicianId) && item.status !== 'Cancelled');
  const estimateItems = assignedItems.filter((item) => item.status === 'Diagnosis' || item.status === 'Estimate Shared');
  const repairItems = assignedItems.filter((item) => item.status === 'Customer Approved' || item.status === 'In Repair' || item.status === 'Waiting for Parts' || item.status === 'Quality Check');
  const visibleItems = activeView === 'myjobs-estimates' ? estimateItems : activeView === 'myjobs-repair' ? repairItems : assignedItems;

  const [page, setPage] = useState(0);
  const pageResetKey = `${activeView}|${selectedTechnicianId}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    if (page !== 0) {
      setPage(0);
    }
  }

  const pageCount = Math.max(1, Math.ceil(visibleItems.length / MY_JOBS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = visibleItems.slice(currentPage * MY_JOBS_PAGE_SIZE, currentPage * MY_JOBS_PAGE_SIZE + MY_JOBS_PAGE_SIZE);

  return (
    <>
      <div className="creator-record-grid">
        {pageItems.map((item) => <TechnicianWorkItem key={item.id} item={item} parts={state.inventoryParts} technicians={state.technicians} updateWorkItem={updateWorkItem} adjustInventory={adjustInventory} pushToast={pushToast} />)}
        {!visibleItems.length && <EmptyState title="No records in this view" body="Change the technician or view filter to see more work items." />}
      </div>
      {pageCount > 1 && (
        <div className="data-grid-pagination">
          <span>Page {currentPage + 1} of {pageCount} · {visibleItems.length} records</span>
          <div className="card-actions">
            <button type="button" className="secondary-button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>Previous</button>
            <button type="button" className="secondary-button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1}>Next</button>
          </div>
        </div>
      )}
    </>
  );
}

function TechnicianWorkItem({ item, parts, technicians, updateWorkItem, adjustInventory, pushToast }: { item: WorkItem; parts: InventoryPart[]; technicians: Technician[]; updateWorkItem: DeskActions['updateWorkItem']; adjustInventory: DeskActions['adjustInventory']; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const [analysis, setAnalysis] = useState(item.analysis);
  const [requiredChanges, setRequiredChanges] = useState(item.requiredChanges);
  const [laborEstimate, setLaborEstimate] = useState(String(item.laborEstimate));
  const [partsEstimate, setPartsEstimate] = useState(String(item.partsEstimate));
  const [diagnosticFee, setDiagnosticFee] = useState(String(item.diagnosticFee));
  const [status, setStatus] = useState<WorkItemStatus>(item.status);
  const [promisedBy, setPromisedBy] = useState(item.promisedBy);
  const [partSku, setPartSku] = useState(parts[0]?.sku ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const closingStatuses: WorkItemStatus[] = ['Ready for Pickup', 'Delivered'];
  const blockedByMissingAnalysis = closingStatuses.includes(status) && !analysis.trim();
  const estimatedPrice = (Number(laborEstimate) || 0) + (Number(partsEstimate) || 0) + (Number(diagnosticFee) || 0);

  const save = async () => {
    if (blockedByMissingAnalysis) {
      pushToast('Add a diagnosis/analysis note before moving this to Ready for Pickup or Delivered.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const selectedParts = partSku ? Array.from(new Set([...item.partsRequired, partSku])) : item.partsRequired;
      await updateWorkItem(
        item.id,
        { analysis, requiredChanges, estimatedPrice, laborEstimate: Number(laborEstimate) || 0, partsEstimate: Number(partsEstimate) || 0, diagnosticFee: Number(diagnosticFee) || 0, status, promisedBy, partsRequired: selectedParts },
        'Technician',
        `Technician updated status to ${status}.`,
      );
      pushToast(`${item.id} updated — status set to ${status}.`);
    } finally {
      setIsSaving(false);
    }
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
      <WorkItemCard item={item} technicians={technicians} />
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
      <div className="card-actions"><button type="button" className="primary-button" onClick={() => void save()} disabled={blockedByMissingAnalysis || isSaving}>{isSaving ? 'Saving…' : 'Save technician update'}</button><button type="button" className="secondary-dark-button" onClick={consumePart}>Use part</button></div>
    </article>
  );
}

function RepairsPanel({
  state,
  selectedCustomerId,
  approveEstimate,
  pushToast,
}: {
  state: DeskActions['state'];
  selectedCustomerId: string;
  approveEstimate: DeskActions['approveEstimate'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const customerItems = state.workItems.filter((item) => selectedCustomerId === 'all' || item.customerId === selectedCustomerId);
  const selected = selectedId ? customerItems.find((item) => item.id === selectedId) : undefined;
  const awaitingMyApproval = customerItems.filter((item) => item.status === 'Estimate Shared' && !item.approvedByCustomer).length;
  const completedRepairs = customerItems.filter((item) => item.status === 'Delivered').length;
  const totalPaid = state.invoices.filter((invoice) => (selectedCustomerId === 'all' || invoice.customerId === selectedCustomerId) && invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0);

  const approve = async (workItemId: string) => {
    setApprovingId(workItemId);
    try {
      await approveEstimate(workItemId);
      pushToast('Estimate approved — the technician has been notified.');
    } finally {
      setApprovingId(null);
    }
  };

  const viewingAll = selectedCustomerId === 'all';

  return (
    <>
      <section className="creator-kpi-row" aria-label={viewingAll ? 'All customers repair summary' : 'My repair summary'}>
        <MetricCard label={viewingAll ? 'All repairs' : 'My repairs'} value={String(customerItems.length)} helper="Total repair records" />
        <MetricCard label="Awaiting approval" value={String(awaitingMyApproval)} helper="Estimates to review" />
        <MetricCard label="Completed" value={String(completedRepairs)} helper={viewingAll ? 'Delivered' : 'Delivered to me'} />
        <MetricCard label="Paid to date" value={currencyFormatter.format(totalPaid)} helper={viewingAll ? 'Across all invoices' : 'Across my invoices'} />
      </section>
      <CreatorRecordBrowser
        title={viewingAll ? 'All repair records' : 'My repair records'}
        records={customerItems}
        selected={selected}
        setSelectedId={setSelectedId}
        onBack={() => setSelectedId('')}
        detail={selected && (
          <article className="customer-detail-card">
            <WorkItemCard item={selected} technicians={state.technicians} />
            {selected.status === 'Estimate Shared' && !selected.approvedByCustomer && (
              <button
                type="button"
                className="primary-button icon-button"
                onClick={() => void approve(selected.id)}
                disabled={approvingId === selected.id}
              >
                <CheckCircle2 aria-hidden="true" size={16} />
                <span>{approvingId === selected.id ? 'Approving…' : 'Approve estimate'}</span>
              </button>
            )}
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
    </>
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

function WorkItemCard({ item, technicians, children }: { item: WorkItem; technicians: Technician[]; children?: ReactNode }) {
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

function NewPartForm({
  addInventoryPart,
  reset,
  canReset,
  actor,
  pushToast,
  editingPart,
  onDone,
}: {
  addInventoryPart: DeskActions['addInventoryPart'];
  reset: DeskActions['reset'];
  canReset: boolean;
  actor: string;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  editingPart?: InventoryPart;
  onDone?: () => void;
}) {
  const [part, setPart] = useState<InventoryPart>(editingPart ?? blankPart);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addInventoryPart({ ...part, sku: (editingPart ? editingPart.sku : part.sku.toUpperCase()), compatibleWith: [part.compatibleWith[0] ?? 'Laptop'] }, actor);
    pushToast(`Saved part ${editingPart ? editingPart.sku : part.sku.toUpperCase() || part.name}.`);
    if (editingPart) {
      onDone?.();
    } else {
      setPart(blankPart);
    }
  };

  const confirmReset = () => {
    if (!window.confirm('Reset all demo data? This permanently wipes every local work item, invoice, and inventory change.')) {
      return;
    }

    reset();
    pushToast('Demo data reset.');
  };

  return (
    <CreatorFormCard title={editingPart ? 'Edit part' : 'Part form'} eyebrow="Inventory">
      <form className="creator-form" onSubmit={submit}>
        <label>SKU<input required disabled={!!editingPart} value={part.sku} onChange={(event) => setPart({ ...part, sku: event.target.value })} placeholder="BAT-MBP-2024" /></label>
        <label>Name<input required value={part.name} onChange={(event) => setPart({ ...part, name: event.target.value })} placeholder="MacBook Battery" /></label>
        <div className="form-row"><label>Device<select value={part.compatibleWith[0]} onChange={(event) => setPart({ ...part, compatibleWith: [event.target.value as DeviceType] })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Quantity<input type="number" value={part.quantity} onChange={(event) => setPart({ ...part, quantity: Number(event.target.value) })} /></label></div>
        <div className="form-row"><label>Reorder at<input type="number" value={part.reorderLevel} onChange={(event) => setPart({ ...part, reorderLevel: Number(event.target.value) })} /></label><label>Cost<input type="number" value={part.unitCost} onChange={(event) => setPart({ ...part, unitCost: Number(event.target.value) })} /></label></div>
        <div className="card-actions">
          <button className="primary-button" type="submit">{editingPart ? 'Save changes' : 'Add / update part'}</button>
          {editingPart && onDone && <button className="secondary-button" type="button" onClick={onDone}>Cancel</button>}
          {!editingPart && canReset && <button className="secondary-dark-button" type="button" onClick={confirmReset}>Reset demo data</button>}
        </div>
      </form>
    </CreatorFormCard>
  );
}

function partUsageCount(state: DeskActions['state'], sku: string) {
  return state.workItems.filter((item) => item.partsRequired.includes(sku)).length;
}

function InventoryReport({
  state,
  adjustInventory,
  addInventoryPart,
  deleteInventoryPart,
  reset,
  currentUser,
  pushToast,
}: {
  state: DeskActions['state'];
  adjustInventory: DeskActions['adjustInventory'];
  addInventoryPart: DeskActions['addInventoryPart'];
  deleteInventoryPart: DeskActions['deleteInventoryPart'];
  reset: DeskActions['reset'];
  currentUser: AuthUser;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [adjustingSku, setAdjustingSku] = useState<string | null>(null);
  const editingPart = editingSku ? state.inventoryParts.find((part) => part.sku === editingSku) : undefined;
  const adjustingPart = adjustingSku ? state.inventoryParts.find((part) => part.sku === adjustingSku) : undefined;

  const deletePart = (part: InventoryPart) => {
    const usage = partUsageCount(state, part.sku);
    if (usage > 0) {
      pushToast(`Cannot delete ${part.name} — it is used by ${usage} work item${usage === 1 ? '' : 's'}.`, 'error');
      return;
    }
    if (!window.confirm(`Delete part ${part.name} (${part.sku})? This cannot be undone.`)) {
      return;
    }
    void deleteInventoryPart(part.sku);
    pushToast(`Deleted part ${part.name}.`);
  };

  const bulkDeleteParts = (parts: (InventoryPart & { id: string })[]) => {
    const blocked = parts.filter((part) => partUsageCount(state, part.sku) > 0);
    const deletable = parts.filter((part) => partUsageCount(state, part.sku) === 0);
    if (blocked.length) {
      pushToast(`${blocked.length} part${blocked.length === 1 ? '' : 's'} in use and not deleted: ${blocked.map((part) => part.sku).join(', ')}.`, 'error');
    }
    if (!deletable.length) {
      return;
    }
    if (!window.confirm(`Delete ${deletable.length} part${deletable.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }
    deletable.forEach((part) => void deleteInventoryPart(part.sku));
    pushToast(`Deleted ${deletable.length} part${deletable.length === 1 ? '' : 's'}.`);
  };

  const partBulkEditFields: BulkEditField<InventoryPart & { id: string }>[] = [
    { key: 'name', label: 'Name', type: 'text', apply: (value) => ({ name: value }) },
    { key: 'quantity', label: 'Quantity', type: 'number', apply: (value) => ({ quantity: Math.max(0, Number(value) || 0) }) },
    { key: 'reorderLevel', label: 'Reorder at', type: 'number', apply: (value) => ({ reorderLevel: Math.max(0, Number(value) || 0) }) },
    { key: 'unitCost', label: 'Cost', type: 'number', apply: (value) => ({ unitCost: Math.max(0, Number(value) || 0) }) },
  ];

  const bulkEditParts = (parts: (InventoryPart & { id: string })[], patch: Partial<InventoryPart>) => {
    parts.forEach((part) => void addInventoryPart({ ...part, ...patch }, currentUser.name));
    pushToast(`Updated ${parts.length} part${parts.length === 1 ? '' : 's'}.`);
  };

  if (isCreating) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setIsCreating(false)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Inventory report</span>
        </button>
        <NewPartForm addInventoryPart={addInventoryPart} reset={reset} canReset={false} actor={currentUser.name} pushToast={pushToast} onDone={() => setIsCreating(false)} />
      </div>
    );
  }

  if (editingPart) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={() => setEditingSku(null)}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to Inventory report</span>
        </button>
        <NewPartForm addInventoryPart={addInventoryPart} reset={reset} canReset={false} actor={currentUser.name} pushToast={pushToast} editingPart={editingPart} onDone={() => setEditingSku(null)} />
      </div>
    );
  }

  const columns: DataGridColumn<InventoryPart & { id: string }>[] = [
    { key: 'name', label: 'Name', render: (part) => <strong>{part.name}</strong>, sortValue: (part) => part.name, searchValue: (part) => part.name },
    { key: 'sku', label: 'SKU', render: (part) => part.sku, sortValue: (part) => part.sku, searchValue: (part) => part.sku },
    { key: 'device', label: 'Device', render: (part) => part.compatibleWith.join(', '), searchValue: (part) => part.compatibleWith.join(', ') },
    { key: 'stock', label: 'Stock', render: (part) => <span className={part.quantity <= part.reorderLevel ? 'stock-low' : 'stock-ok'}>{part.quantity} in stock</span>, sortValue: (part) => part.quantity },
    { key: 'reorder', label: 'Reorder at', render: (part) => part.reorderLevel, sortValue: (part) => part.reorderLevel },
    { key: 'cost', label: 'Cost', render: (part) => currencyFormatter.format(part.unitCost), sortValue: (part) => part.unitCost },
    ...auditColumns<InventoryPart & { id: string }>(),
    {
      key: 'adjust',
      label: 'Adjust',
      render: (part) => (
        <button
          type="button"
          className="icon-toolbar-button"
          aria-label={`Adjust ${part.name} stock`}
          onClick={(event) => { event.stopPropagation(); setAdjustingSku(part.sku); }}
        >
          <SlidersHorizontal aria-hidden="true" size={14} />
        </button>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (part) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="icon-toolbar-button" aria-label={`Edit ${part.name}`} onClick={() => setEditingSku(part.sku)}><Pencil aria-hidden="true" size={14} /></button>
          <button type="button" className="icon-toolbar-button is-danger" aria-label={`Delete ${part.name}`} onClick={() => deletePart(part)}><Trash2 aria-hidden="true" size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataGrid
        onBulkDelete={bulkDeleteParts}
        bulkEditFields={partBulkEditFields}
        onBulkEditApply={bulkEditParts}
        title="Inventory report"
        columns={columns}
        rows={state.inventoryParts.map((part) => ({ ...part, id: part.sku }))}
        onAddNew={() => setIsCreating(true)}
        addLabel="New part"
      />
      {adjustingPart && (
        <AdjustStockModal part={adjustingPart} adjustInventory={adjustInventory} pushToast={pushToast} onClose={() => setAdjustingSku(null)} />
      )}
    </>
  );
}

function InventoryView({ state, adjustInventory }: { state: DeskActions['state']; adjustInventory: DeskActions['adjustInventory'] }) {
  const columns: DataGridColumn<InventoryPart & { id: string }>[] = [
    { key: 'name', label: 'Name', render: (part) => <strong>{part.name}</strong>, sortValue: (part) => part.name, searchValue: (part) => part.name },
    { key: 'sku', label: 'SKU', render: (part) => part.sku, sortValue: (part) => part.sku, searchValue: (part) => part.sku },
    { key: 'device', label: 'Device', render: (part) => part.compatibleWith.join(', '), searchValue: (part) => part.compatibleWith.join(', ') },
    { key: 'stock', label: 'Stock', render: (part) => <span className={part.quantity <= part.reorderLevel ? 'stock-low' : 'stock-ok'}>{part.quantity} in stock</span>, sortValue: (part) => part.quantity },
    { key: 'reorder', label: 'Reorder at', render: (part) => part.reorderLevel, sortValue: (part) => part.reorderLevel },
    { key: 'cost', label: 'Cost', render: (part) => currencyFormatter.format(part.unitCost), sortValue: (part) => part.unitCost },
    {
      key: 'adjust',
      label: 'Adjust',
      render: (part) => (
        <div className="stepper" onClick={(event) => event.stopPropagation()}>
          <button type="button" aria-label={`Decrease ${part.name} quantity`} onClick={() => adjustInventory(part.sku, -1)}><Minus aria-hidden="true" size={16} /></button>
          <button type="button" aria-label={`Increase ${part.name} quantity`} onClick={() => adjustInventory(part.sku, 1)}><Plus aria-hidden="true" size={16} /></button>
        </div>
      ),
    },
  ];

  return <DataGrid title="Spare parts" columns={columns} rows={state.inventoryParts.map((part) => ({ ...part, id: part.sku }))} />;
}

function RecordPaymentModal({
  invoice,
  recordPayment,
  onClose,
}: {
  invoice: Invoice;
  recordPayment: (invoiceId: string, payment: InvoicePaymentDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('Card (Test Mode)');
  const [reference, setReference] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const submit = async () => {
    setIsRecording(true);
    try {
      await recordPayment(invoice.id, { method, reference });
      onClose();
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <Modal title={`Record payment — ${invoice.id}`} onClose={onClose}>
      <div className="creator-form">
        <label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{paymentMethods.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label>Reference (optional)<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional reference" /></label>
        <div className="card-actions">
          <button type="button" className="primary-button icon-button" onClick={() => void submit()} disabled={isRecording}><CreditCard aria-hidden="true" size={16} /><span>{isRecording ? 'Recording…' : 'Record payment'}</span></button>
          <button type="button" className="secondary-button" onClick={onClose} disabled={isRecording}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function InvoiceList({
  invoices,
  updateInvoiceStatus,
  recordPayment,
  deleteInvoice,
  pushToast,
  onAddNew,
}: {
  invoices: Invoice[];
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void;
  recordPayment: (invoiceId: string, payment: InvoicePaymentDraft) => Promise<void>;
  deleteInvoice: DeskActions['deleteInvoice'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  onAddNew: () => void;
}) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const payingInvoice = payingId ? invoices.find((invoice) => invoice.id === payingId) : undefined;

  const voidInvoice = (invoice: Invoice) => {
    if (!window.confirm(`Void invoice ${invoice.id}? This cannot be undone.`)) {
      return;
    }
    void updateInvoiceStatus(invoice.id, 'Void');
    pushToast(`Invoice ${invoice.id} voided.`);
  };

  const removeInvoice = (invoice: Invoice) => {
    if (!window.confirm(`Delete invoice ${invoice.id}? This cannot be undone.`)) {
      return;
    }
    void deleteInvoice(invoice.id);
    pushToast(`Deleted invoice ${invoice.id}.`);
  };

  const bulkDeleteInvoices = (selected: Invoice[]) => {
    if (!window.confirm(`Delete ${selected.length} invoice${selected.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }
    selected.forEach((invoice) => void deleteInvoice(invoice.id));
    pushToast(`Deleted ${selected.length} invoice${selected.length === 1 ? '' : 's'}.`);
  };

  const invoiceBulkEditFields: BulkEditField<Invoice>[] = [
    { key: 'status', label: 'Status', type: 'select', options: ['Issued', 'Void'], apply: (value) => ({ status: value as InvoiceStatus }) },
  ];

  const bulkEditInvoices = (selected: Invoice[], patch: Partial<Invoice>) => {
    selected.forEach((invoice) => updateInvoiceStatus(invoice.id, (patch.status ?? invoice.status)));
    pushToast(`Updated ${selected.length} invoice${selected.length === 1 ? '' : 's'}.`);
  };

  const columns: DataGridColumn<Invoice>[] = [
    { key: 'id', label: 'Invoice', render: (invoice) => <strong>{invoice.id}</strong>, sortValue: (invoice) => invoice.id, searchValue: (invoice) => invoice.id },
    { key: 'customer', label: 'Customer', render: (invoice) => invoice.customerName, sortValue: (invoice) => invoice.customerName, searchValue: (invoice) => invoice.customerName },
    { key: 'workItem', label: 'Work item', render: (invoice) => invoice.workItemId, sortValue: (invoice) => invoice.workItemId, searchValue: (invoice) => invoice.workItemId },
    { key: 'issued', label: 'Issued', render: (invoice) => invoice.issuedAt, sortValue: (invoice) => invoice.issuedAt },
    { key: 'amount', label: 'Amount', render: (invoice) => currencyFormatter.format(invoice.amount), sortValue: (invoice) => invoice.amount },
    { key: 'status', label: 'Status', render: (invoice) => <span className={`status ${invoice.status.toLowerCase()}`}>{invoice.status}</span>, sortValue: (invoice) => invoice.status },
    ...auditColumns<Invoice>().slice(1),
    {
      key: 'actions',
      label: 'Actions',
      render: (invoice) => (
        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
          {invoice.status === 'Issued' && (
            <>
              <button type="button" className="icon-toolbar-button" aria-label={`Record payment for ${invoice.id}`} onClick={() => setPayingId(invoice.id)}><CreditCard aria-hidden="true" size={14} /></button>
              <button type="button" className="icon-toolbar-button is-danger" aria-label={`Void ${invoice.id}`} onClick={() => voidInvoice(invoice)}><XCircle aria-hidden="true" size={14} /></button>
            </>
          )}
          <button type="button" className="icon-toolbar-button is-danger" aria-label={`Delete ${invoice.id}`} onClick={() => removeInvoice(invoice)}><Trash2 aria-hidden="true" size={14} /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataGrid
        title="Invoice register"
        columns={columns}
        rows={invoices}
        onAddNew={onAddNew}
        addLabel="New invoice"
        onBulkDelete={bulkDeleteInvoices}
        bulkEditFields={invoiceBulkEditFields}
        onBulkEditApply={bulkEditInvoices}
      />
      {payingInvoice && <RecordPaymentModal invoice={payingInvoice} recordPayment={recordPayment} onClose={() => setPayingId(null)} />}
    </>
  );
}

const notificationChannelIcon: Record<string, LucideIcon> = { sms: MessageCircle, whatsapp: MessageSquare, email: Mail };

const NOTIFICATION_POPOVER_WIDTH = 320;
const NOTIFICATION_POPOVER_MARGIN = 12;

function NotificationBell({ notifications, markNotificationsRead }: { notifications: DeskActions['state']['notifications']; markNotificationsRead: DeskActions['markNotificationsRead'] }) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const [popoverOffset, setPopoverOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const closeOnOutsideInteraction = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') {
          setIsOpen(false);
        }
        return;
      }
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnOutsideInteraction);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnOutsideInteraction);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const updatePosition = () => {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const effectiveWidth = Math.min(NOTIFICATION_POPOVER_WIDTH, window.innerWidth - NOTIFICATION_POPOVER_MARGIN * 2);
      const idealViewportLeft = rect.right - effectiveWidth;
      const clampedViewportLeft = Math.min(
        Math.max(idealViewportLeft, NOTIFICATION_POPOVER_MARGIN),
        window.innerWidth - effectiveWidth - NOTIFICATION_POPOVER_MARGIN,
      );
      setPopoverOffset(clampedViewportLeft - rect.left);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [isOpen]);

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="notification-bell-toggle"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Bell aria-hidden="true" size={18} />
        {unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {isOpen && (
        <div className="notification-popover" role="dialog" aria-label="Notifications" style={{ left: `${popoverOffset}px` }}>
          <div className="notification-popover-header">
            <h3>Notifications</h3>
            {unreadCount > 0 ? (
              <button type="button" className="notification-mark-all-read" onClick={() => void markNotificationsRead()}>Mark all as read</button>
            ) : (
              <span>{notifications.length} sent</span>
            )}
          </div>
          <div className="notification-popover-list">
            {notifications.length ? notifications.map((notification) => {
              const Icon = notificationChannelIcon[notification.channel] ?? Bell;
              return (
                <button
                  type="button"
                  className={notification.read ? 'notification-item' : 'notification-item is-unread'}
                  key={notification.id}
                  onClick={() => !notification.read && void markNotificationsRead([notification.id])}
                >
                  {!notification.read && <span className="notification-unread-dot" aria-hidden="true" />}
                  <Icon aria-hidden="true" size={16} className="notification-item-icon" />
                  <div className="notification-item-body">
                    <strong>{notification.recipient}</strong>
                    <span>{notification.message}</span>
                    <small>{notification.createdAt}</small>
                  </div>
                </button>
              );
            }) : <EmptyState title="No notifications yet" body="Status changes on a work item automatically text the customer (mock provider — no SMS account is connected yet)." />}
          </div>
        </div>
      )}
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
  const [filters, setFilters] = useState<ReportFilter[]>([{ field: '', value: '' }]);
  const [reportName, setReportName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const changeEntity = (nextEntity: ReportEntity) => {
    setEntity(nextEntity);
    setColumns(reportColumnOptions[nextEntity].slice(0, 4));
    setFilters([{ field: '', value: '' }]);
  };

  const toggleColumn = (column: string) => {
    setColumns((current) => (current.includes(column) ? current.filter((value) => value !== column) : [...current, column]));
  };

  const updateFilter = (index: number, patch: Partial<ReportFilter>) => {
    setFilters((current) => current.map((filter, position) => (position === index ? { ...filter, ...patch } : filter)));
  };
  const addFilter = () => setFilters((current) => [...current, { field: '', value: '' }]);
  const removeFilter = (index: number) => setFilters((current) => current.filter((_, position) => position !== index));

  const activeFilters = useMemo(() => filters.filter((filter) => filter.field && filter.value.trim()), [filters]);
  const rows = useMemo(() => buildReportRows(state, entity, columns, activeFilters), [state, entity, columns, activeFilters]);
  const gridRows = useMemo(() => rows.map((row, index) => ({ ...row, id: String(index) })), [rows]);
  const gridColumns: DataGridColumn<Record<string, string> & { id: string }>[] = columns.map((column) => ({
    key: column,
    label: column,
    render: (row) => row[column] || '—',
    sortValue: (row) => row[column],
    searchValue: (row) => row[column],
  }));

  const runSavedReport = (report: SavedReport) => {
    setEntity(report.entity);
    setColumns(report.columns);
    setFilters(report.filters.length ? report.filters : [{ field: '', value: '' }]);
  };

  const saveReport = () => {
    if (!reportName.trim() || !columns.length) {
      pushToast('Give the report a name and at least one column.', 'error');
      return;
    }

    createSavedReport({ name: reportName, entity, columns, filters: activeFilters });
    pushToast(`Saved report "${reportName}".`);
    setReportName('');
    setShowSave(false);
  };

  return (
    <div className="report-builder">
      <section className="creator-panel report-builder-controls">
        <div className="creator-panel-header"><div><p className="eyebrow">Build your own report</p><h2>Report builder</h2></div></div>
        <div className="view-canvas report-builder-fields">
          <label>Entity
            <select value={entity} onChange={(event) => changeEntity(event.target.value as ReportEntity)}>
              {(Object.keys(reportEntityLabels) as ReportEntity[]).map((option) => <option key={option} value={option}>{reportEntityLabels[option]}</option>)}
            </select>
          </label>
          <label>Columns
            <span className="checkbox-grid">
              {reportColumnOptions[entity].map((column) => (
                <label className="inline-check" key={column}><input type="checkbox" checked={columns.includes(column)} onChange={() => toggleColumn(column)} /> {column}</label>
              ))}
            </span>
          </label>
          <div className="report-filter-rows">
            <p className="eyebrow">Filters</p>
            {filters.map((filter, index) => (
              <div className="report-filter-row" key={index}>
                <select value={filter.field} onChange={(event) => updateFilter(index, { field: event.target.value })}>
                  <option value="">No filter</option>
                  {reportColumnOptions[entity].map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
                <input value={filter.value} onChange={(event) => updateFilter(index, { value: event.target.value })} placeholder="Contains…" disabled={!filter.field} />
                <button type="button" className="icon-toolbar-button is-danger" aria-label="Remove filter" onClick={() => removeFilter(index)} disabled={filters.length === 1}>
                  <X aria-hidden="true" size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="secondary-button" onClick={addFilter}>+ Add filter</button>
          </div>
          <div className="card-actions">
            <button type="button" className="secondary-dark-button" onClick={() => setShowSave((value) => !value)}>{showSave ? 'Cancel save' : 'Save this report'}</button>
            {showSave && (
              <>
                <input value={reportName} onChange={(event) => setReportName(event.target.value)} placeholder="Report name, e.g. Overdue invoices" />
                <button type="button" className="primary-button" onClick={saveReport}>Save</button>
              </>
            )}
          </div>
        </div>
      </section>

      <DataGrid title={`${reportEntityLabels[entity]} export`} columns={gridColumns} rows={gridRows} emptyTitle="No matching records" emptyBody="Adjust the filters or pick different columns." />

      {savedReports.length > 0 && (
        <div className="creator-list-panel">
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
        </div>
      )}
    </div>
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

function buildReportRows(state: DeskActions['state'], entity: ReportEntity, columns: string[], filters: ReportFilter[]): Array<Record<string, string>> {
  let rows = getEntityRows(state, entity);

  for (const filter of filters) {
    const needle = filter.value.trim().toLowerCase();
    rows = rows.filter((row) => String(row[filter.field] ?? '').toLowerCase().includes(needle));
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

function ModuleFrame({
  title,
  subtitle,
  toolbar,
  showHeader = true,
  children,
}: {
  title: string;
  subtitle: string;
  toolbar?: ReactNode;
  showHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="module-frame">
      {(showHeader || toolbar) && (
        <div className="module-header">
          {showHeader && <div><p className="eyebrow">Module</p><h2>{title}</h2><p className="module-subtitle">{subtitle}</p></div>}
          {toolbar}
        </div>
      )}
      <div className={showHeader ? 'view-canvas' : 'view-canvas view-canvas-full'}>{children}</div>
    </section>
  );
}

function CreatorFormCard({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return <section className="creator-form-card"><p className="eyebrow">{eyebrow}</p><h3>{title}</h3>{children}</section>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}><X aria-hidden="true" size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function AdjustStockModal({
  part,
  adjustInventory,
  pushToast,
  onClose,
}: {
  part: InventoryPart;
  adjustInventory: DeskActions['adjustInventory'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState(part.quantity);

  const save = () => {
    const delta = quantity - part.quantity;
    if (delta !== 0) {
      void adjustInventory(part.sku, delta);
      pushToast(`Updated ${part.name} stock to ${quantity}.`);
    }
    onClose();
  };

  return (
    <Modal title={`Adjust stock — ${part.name}`} onClose={onClose}>
      <div className="stepper stepper-lg">
        <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((value) => Math.max(0, value - 1))}><Minus aria-hidden="true" size={18} /></button>
        <span className="stepper-value">{quantity}</span>
        <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((value) => value + 1)}><Plus aria-hidden="true" size={18} /></button>
      </div>
      <p className="muted">Reorder at {part.reorderLevel} units.</p>
      <div className="card-actions">
        <button type="button" className="primary-button" onClick={save}>Save</button>
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function CreatorRecordBrowser({
  title,
  records,
  columns = workItemGridColumns,
  selected,
  setSelectedId,
  detail,
  onAddNew,
  addLabel,
  onBulkDelete,
  bulkEditFields,
  onBulkEditApply,
  onBack,
}: {
  title: string;
  records: WorkItem[];
  columns?: DataGridColumn<WorkItem>[];
  selected?: WorkItem;
  setSelectedId: (id: string) => void;
  detail?: ReactNode;
  onAddNew?: () => void;
  addLabel?: string;
  onBulkDelete?: (rows: WorkItem[]) => void;
  bulkEditFields?: BulkEditField<WorkItem>[];
  onBulkEditApply?: (rows: WorkItem[], patch: Partial<WorkItem>) => void;
  onBack: () => void;
}) {
  if (selected) {
    return (
      <div className="record-detail-screen">
        <button type="button" className="back-link" onClick={onBack}>
          <ChevronLeft aria-hidden="true" size={16} />
          <span>Back to {title}</span>
        </button>
        {detail}
      </div>
    );
  }

  return (
    <DataGrid
      title={title}
      columns={columns}
      rows={records}
      onRowClick={(item) => setSelectedId(item.id)}
      onAddNew={onAddNew}
      addLabel={addLabel}
      onBulkDelete={onBulkDelete}
      bulkEditFields={bulkEditFields}
      onBulkEditApply={onBulkEditApply}
      emptyTitle="No records"
      emptyBody="Nothing matches yet."
    />
  );
}

interface DataGridColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
  csvValue?: (row: T) => string;
  defaultHidden?: boolean;
}

interface BulkEditField<T> {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: Array<string | { value: string; label: string }>;
  apply: (value: string) => Partial<T>;
}

function BulkEditModal<T>({
  count,
  fields,
  onApply,
  onClose,
}: {
  count: number;
  fields: BulkEditField<T>[];
  onApply: (patch: Partial<T>) => void;
  onClose: () => void;
}) {
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? '');
  const [value, setValue] = useState('');
  const selectedField = fields.find((field) => field.key === fieldKey);

  const apply = () => {
    if (!selectedField || !value) {
      return;
    }
    onApply(selectedField.apply(value));
    onClose();
  };

  return (
    <Modal title={`Bulk edit — ${count} record${count === 1 ? '' : 's'}`} onClose={onClose}>
      <div className="creator-form">
        <label>Field
          <select value={fieldKey} onChange={(event) => { setFieldKey(event.target.value); setValue(''); }}>
            {fields.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
          </select>
        </label>
        {selectedField?.type === 'select' ? (
          <label>New value
            <select value={value} onChange={(event) => setValue(event.target.value)}>
              <option value="">Choose a value…</option>
              {selectedField.options?.map((option) => {
                const optionValue = typeof option === 'string' ? option : option.value;
                const optionLabel = typeof option === 'string' ? option : option.label;
                return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
              })}
            </select>
          </label>
        ) : (
          <label>New value<input type={selectedField?.type === 'number' ? 'number' : 'text'} value={value} onChange={(event) => setValue(event.target.value)} /></label>
        )}
        <p className="muted">This replaces the {selectedField?.label.toLowerCase()} on all {count} selected record{count === 1 ? '' : 's'}.</p>
        <div className="card-actions">
          <button type="button" className="primary-button" onClick={apply} disabled={!value}>Apply to {count} record{count === 1 ? '' : 's'}</button>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function auditColumns<T extends { id: string; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string }>(): DataGridColumn<T>[] {
  return [
    { key: 'id', label: 'ID', render: (row) => <span className="record-meta">{row.id}</span>, sortValue: (row) => row.id, searchValue: (row) => row.id, defaultHidden: true },
    { key: 'createdAt', label: 'Added Time', render: (row) => row.createdAt, sortValue: (row) => row.createdAt, defaultHidden: true },
    { key: 'createdBy', label: 'Added User', render: (row) => row.createdBy, sortValue: (row) => row.createdBy, defaultHidden: true },
    { key: 'updatedAt', label: 'Modified Time', render: (row) => row.updatedAt, sortValue: (row) => row.updatedAt, defaultHidden: true },
    { key: 'updatedBy', label: 'Modified User', render: (row) => row.updatedBy, sortValue: (row) => row.updatedBy, defaultHidden: true },
  ];
}

const DATA_GRID_PAGE_SIZE = 20;
const MY_JOBS_PAGE_SIZE = 9;

function DataGrid<T extends { id: string }>({
  title,
  columns,
  rows,
  onRowClick,
  selectedId,
  toolbar,
  filter,
  onAddNew,
  addLabel = 'Add record',
  emptyTitle = 'No records',
  emptyBody = 'This report does not have records yet.',
  onBulkDelete,
  bulkDeleteLabel = (count) => `Delete ${count} selected`,
  bulkEditFields,
  onBulkEditApply,
  hideExport = false,
}: {
  title: string;
  columns: DataGridColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  selectedId?: string;
  toolbar?: ReactNode;
  filter?: ReactNode;
  onAddNew?: () => void;
  addLabel?: string;
  emptyTitle?: string;
  emptyBody?: string;
  onBulkDelete?: (rows: T[]) => void;
  bulkDeleteLabel?: (count: number) => string;
  bulkEditFields?: BulkEditField<T>[];
  onBulkEditApply?: (rows: T[], patch: Partial<T>) => void;
  hideExport?: boolean;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const canBulkEdit = Boolean(bulkEditFields?.length && onBulkEditApply);
  const hasBulkActions = Boolean(onBulkDelete) || canBulkEdit;
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set(columns.filter((column) => column.defaultHidden).map((column) => column.key)));
  const [page, setPage] = useState(0);
  const searchableColumns = useMemo(() => columns.filter((column) => column.searchValue), [columns]);
  const visibleColumns = useMemo(() => columns.filter((column) => !hiddenKeys.has(column.key)), [columns, hiddenKeys]);
  const exportableColumns = useMemo(() => columns.filter((column) => column.csvValue ?? column.sortValue ?? column.searchValue), [columns]);

  const toggleColumnVisibility = (key: string) => {
    setHiddenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filteredRows = useMemo(() => {
    if (!query.trim() || searchableColumns.length === 0) {
      return rows;
    }
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => searchableColumns.some((column) => column.searchValue!(row).toLowerCase().includes(needle)));
  }, [rows, query, searchableColumns]);

  const sortedRows = useMemo(() => {
    const column = sort ? columns.find((candidate) => candidate.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) {
      return filteredRows;
    }
    const sortValue = column.sortValue;
    const sorted = [...filteredRows].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [filteredRows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / DATA_GRID_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => sortedRows.slice(currentPage * DATA_GRID_PAGE_SIZE, currentPage * DATA_GRID_PAGE_SIZE + DATA_GRID_PAGE_SIZE),
    [sortedRows, currentPage],
  );

  const pageResetKey = `${query}|${sort?.key ?? ''}|${sort?.dir ?? ''}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    if (page !== 0) {
      setPage(0);
    }
  }

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, dir: 'asc' };
      }
      return current.dir === 'asc' ? { key, dir: 'desc' } : null;
    });
  };

  const allChecked = pageRows.length > 0 && pageRows.every((row) => checked.has(row.id));
  const toggleAll = () => setChecked((current) => {
    if (allChecked) {
      const next = new Set(current);
      pageRows.forEach((row) => next.delete(row.id));
      return next;
    }
    const next = new Set(current);
    pageRows.forEach((row) => next.add(row.id));
    return next;
  });
  const toggleOne = (id: string) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });

  const exportCsv = () => {
    const headers = exportableColumns.map((column) => column.label);
    const csvRows = sortedRows.map((row) => {
      const record: Record<string, string> = {};
      exportableColumns.forEach((column) => {
        const getter = column.csvValue ?? column.sortValue ?? column.searchValue;
        record[column.label] = getter ? String(getter(row)) : '';
      });
      return record;
    });
    downloadRowsAsCsv(`${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'report'}.csv`, headers, csvRows);
  };

  return (
    <div className="creator-list-panel data-grid-panel">
      <div className="list-header">
        <h3>{title}</h3>
        <div className="card-actions">
          <span>{rows.length} records</span>
          {searchableColumns.length > 0 && (
            <button
              type="button"
              className={searchOpen ? 'icon-toolbar-button is-active' : 'icon-toolbar-button'}
              aria-label={searchOpen ? 'Close search' : `Search ${title}`}
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen((open) => !open)}
            >
              <Search aria-hidden="true" size={15} />
            </button>
          )}
          <button
            type="button"
            className={columnsOpen ? 'icon-toolbar-button is-active' : 'icon-toolbar-button'}
            aria-label={columnsOpen ? 'Close column settings' : 'Show or hide columns'}
            aria-pressed={columnsOpen}
            onClick={() => setColumnsOpen((open) => !open)}
          >
            <Columns3 aria-hidden="true" size={15} />
          </button>
          {!hideExport && exportableColumns.length > 0 && (
            <button type="button" className="icon-toolbar-button" aria-label={`Export ${title} as CSV`} onClick={exportCsv}>
              <Download aria-hidden="true" size={15} />
            </button>
          )}
          {toolbar}
          {onAddNew && (
            <button type="button" className="icon-toolbar-button is-primary" aria-label={addLabel} onClick={onAddNew}>
              <Plus aria-hidden="true" size={16} />
            </button>
          )}
        </div>
      </div>
      {searchOpen && searchableColumns.length > 0 && (
        <div className="data-grid-filter">
          <input
            className="search-input"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${title.toLowerCase()}`}
            aria-label={`Search ${title}`}
          />
        </div>
      )}
      {columnsOpen && (
        <div className="data-grid-filter data-grid-columns-picker">
          <span className="checkbox-grid">
            {columns.map((column) => (
              <label className="inline-check" key={column.key}>
                <input type="checkbox" checked={!hiddenKeys.has(column.key)} onChange={() => toggleColumnVisibility(column.key)} />
                {column.label}
              </label>
            ))}
          </span>
        </div>
      )}
      {filter}
      {hasBulkActions && checked.size > 0 && (
        <div className="data-grid-bulk-bar">
          <span>{checked.size} selected</span>
          <div className="card-actions">
            <button type="button" className="secondary-button" onClick={() => setChecked(new Set())}>Clear</button>
            {canBulkEdit && (
              <button type="button" className="secondary-dark-button icon-button" onClick={() => setShowBulkEdit(true)}>
                <Pencil aria-hidden="true" size={15} />
                <span>Edit {checked.size} selected</span>
              </button>
            )}
            {onBulkDelete && (
              <button
                type="button"
                className="danger-button icon-button"
                onClick={() => {
                  onBulkDelete(sortedRows.filter((row) => checked.has(row.id)));
                  setChecked(new Set());
                }}
              >
                <Trash2 aria-hidden="true" size={15} />
                <span>{bulkDeleteLabel(checked.size)}</span>
              </button>
            )}
          </div>
        </div>
      )}
      {showBulkEdit && bulkEditFields && onBulkEditApply && (
        <BulkEditModal
          count={checked.size}
          fields={bulkEditFields}
          onApply={(patch) => {
            onBulkEditApply(sortedRows.filter((row) => checked.has(row.id)), patch);
            setChecked(new Set());
          }}
          onClose={() => setShowBulkEdit(false)}
        />
      )}
      {rows.length ? (
        sortedRows.length ? (
          <>
            <div className="data-grid">
              <table className="data-grid-table">
                <thead>
                  <tr>
                    {hasBulkActions && (
                      <th className="data-grid-check-col"><input className="data-grid-checkbox" type="checkbox" aria-label="Select all rows on this page" checked={allChecked} onChange={toggleAll} /></th>
                    )}
                    {visibleColumns.map((column) => (
                      <th key={column.key}>
                        {column.label}
                        {column.sortValue && (
                          <button type="button" className="data-grid-sort" aria-label={`Sort by ${column.label}`} onClick={() => toggleSort(column.key)}>
                            <ChevronDown aria-hidden="true" size={13} />
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className={[onRowClick && 'is-clickable', selectedId === row.id && 'is-active'].filter(Boolean).join(' ')}
                      onClick={() => onRowClick?.(row)}
                    >
                      {hasBulkActions && (
                        <td className="data-grid-check-col" onClick={(event) => event.stopPropagation()}>
                          <input className="data-grid-checkbox" type="checkbox" aria-label={`Select row ${row.id}`} checked={checked.has(row.id)} onChange={() => toggleOne(row.id)} />
                        </td>
                      )}
                      {visibleColumns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="data-grid-pagination">
                <span>Page {currentPage + 1} of {pageCount} · {sortedRows.length} records</span>
                <div className="card-actions">
                  <button type="button" className="secondary-button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>Previous</button>
                  <button type="button" className="secondary-button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1}>Next</button>
                </div>
              </div>
            )}
          </>
        ) : <EmptyState title="No matches" body="Try a different search term." />
      ) : <EmptyState title={emptyTitle} body={emptyBody} />}
    </div>
  );
}

function ListHeader({ title, count }: { title: string; count: number }) {
  return <div className="list-header"><h3>{title}</h3><span>{count} records</span></div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{body}</span></div>;
}

const workItemGridColumns: DataGridColumn<WorkItem>[] = [
  { key: 'device', label: 'Device', render: (item) => <strong>{item.deviceModel}</strong>, sortValue: (item) => item.deviceModel, searchValue: (item) => item.deviceModel },
  { key: 'id', label: 'ID', render: (item) => item.id, sortValue: (item) => item.id, searchValue: (item) => item.id },
  { key: 'customer', label: 'Customer', render: (item) => item.customerName, sortValue: (item) => item.customerName, searchValue: (item) => item.customerName },
  { key: 'status', label: 'Status', render: (item) => <span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span>, sortValue: (item) => item.status, searchValue: (item) => item.status },
  { key: 'estimate', label: 'Estimate', render: (item) => currencyFormatter.format(item.estimatedPrice), sortValue: (item) => item.estimatedPrice },
  ...auditColumns<WorkItem>().slice(1),
];

function profileToRole(profile: AuthProfile): UserRole {
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

function MetricCard({ label, value, helper, onClick }: { label: string; value: string; helper: string; onClick?: () => void }) {
  const content = <><span>{label}</span><strong>{value}</strong><p>{helper}</p></>;
  if (onClick) {
    return <button type="button" className="metric-card clickable" onClick={onClick}>{content}</button>;
  }
  return <article className="metric-card">{content}</article>;
}

export default App;
