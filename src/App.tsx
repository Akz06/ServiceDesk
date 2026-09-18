import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Bell,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Cog,
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
  Moon,
  Plus,
  Receipt,
  Smartphone,
  Sun,
  UserPlus,
  Users as UsersIcon,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ProgressTracker } from './components/ProgressTracker';
import { ToastStack } from './components/ToastStack';
import { serviceCategories, technicians } from './data/repairShop';
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
import { exportApi, isApiPersistenceEnabled, userApi } from './services/apiClient';
import type {
  AuthProfile,
  AuthUser,
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
  ReportEntity,
  SavedReport,
  SavedReportDraft,
  Technician,
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
    { id: 'new-user', label: 'New User', modules: ['admin'] },
    { id: 'customers', label: 'Customers', modules: ['admin'] },
    { id: 'technicians', label: 'Technicians', modules: ['admin'] },
  ] },
  { id: 'inventory', label: 'Inventory', modules: ['admin', 'agent'], icon: Boxes, children: [
    { id: 'inventory-report', label: 'Inventory', modules: ['admin', 'agent'] },
    { id: 'inventory-new', label: 'New Part', modules: ['admin', 'agent'] },
  ] },
  { id: 'workitems', label: 'Work Items', modules: ['admin', 'agent'], icon: Wrench, children: [
    { id: 'wi-all', label: 'All Work Items', modules: ['admin', 'agent'] },
    { id: 'wi-new', label: 'New Work Item', modules: ['admin', 'agent'] },
    { id: 'wi-board', label: 'Board', modules: ['admin', 'agent'] },
    { id: 'wi-walkins', label: 'Walk-ins', modules: ['admin', 'agent'] },
  ] },
  { id: 'myjobs', label: 'My Jobs', modules: ['admin', 'technician'], icon: ClipboardList, children: [
    { id: 'myjobs-assigned', label: 'Assigned', modules: ['admin', 'technician'] },
    { id: 'myjobs-estimates', label: 'Estimates', modules: ['admin', 'technician'] },
    { id: 'myjobs-repair', label: 'In Repair', modules: ['admin', 'technician'] },
  ] },
  { id: 'parts', label: 'Parts', modules: ['admin', 'technician'], icon: Cog },
  { id: 'invoices', label: 'Invoices', modules: ['admin'], icon: Receipt, children: [
    { id: 'invoices-report', label: 'Invoices', modules: ['admin'] },
    { id: 'invoices-new', label: 'New Invoice', modules: ['admin'] },
  ] },
  { id: 'catalog', label: 'Catalog', modules: ['admin'], icon: BookOpen },
  { id: 'reports', label: 'Export Reports', modules: ['admin'], icon: FileBarChart2 },
  { id: 'repairs', label: 'My Repairs', modules: ['admin', 'customer'], icon: Smartphone },
];

const sectionMeta: Record<string, SectionMeta> = {
  dashboard: { title: 'Dashboard', subtitle: 'A quick operational summary of active work, revenue, and stock.' },
  people: { title: 'People directory', subtitle: 'Manage staff accounts and customer/technician master data.' },
  inventory: { title: 'Inventory', subtitle: 'Manage spare-parts stock levels and reorder points.' },
  workitems: { title: 'Work Items', subtitle: 'Create, assign, track, and update repair work items.' },
  myjobs: { title: 'My Jobs', subtitle: 'Diagnose, estimate, and update assigned repair jobs.' },
  parts: { title: 'Parts', subtitle: 'Read-only view of spare-parts stock.' },
  invoices: { title: 'Invoices', subtitle: 'Create invoices, record payments, and export for accounting.' },
  catalog: { title: 'Service catalog', subtitle: 'Browse repair categories, common issues, and starting prices.' },
  reports: { title: 'Export Reports', subtitle: 'Build, save, and export custom reports.' },
  repairs: { title: 'My Repairs', subtitle: 'Track repair progress, updates, and approve shared estimates.' },
};

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

  const handleLogout = async () => {
    await auth.logout();
    setActiveModule(null);
    updateUrlForModule(sessionId, null);
  };

  if (!auth.user || !activeModule) {
    return <HomePage auth={auth} theme={theme} onThemeToggle={toggleTheme} onLoginSuccess={handleLoginSuccess} />;
  }

  return <Workspace user={auth.user} theme={theme} onThemeToggle={toggleTheme} onLogout={handleLogout} />;
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
  theme,
  onThemeToggle,
  onLogout,
}: {
  user: AuthUser;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onLogout: () => Promise<void>;
}) {
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('tech-arun');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  const groupId = groupIdFor(activeView);
  const isDashboard = activeView === 'dashboard';
  const meta = sectionMeta[groupId] ?? { title: appName, subtitle: '' };
  const toolbar =
    groupId === 'myjobs' ? (
      <label className="filter-control compact-control">Technician<select value={selectedTechnicianId} onChange={(event) => setSelectedTechnicianId(event.target.value)}>{technicians.map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}</select></label>
    ) : groupId === 'repairs' ? (
      <label className="filter-control compact-control">Customer<select value={effectiveCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>{state.customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}</select></label>
    ) : undefined;

  return (
    <main className="creator-shell">
      {mobileNavOpen && <div className="nav-overlay" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />}
      <aside className={mobileNavOpen ? 'creator-sidebar nav-open' : 'creator-sidebar'}>
        <div className="brand app-brand">
          <div className="brand-mark">SD</div>
          <span>{appName}</span>
          {user.moduleAccess.includes('admin') && <NotificationBell notifications={state.notifications} markNotificationsRead={serviceDesk.markNotificationsRead} />}
        </div>
        <div className="sidebar-section">
          <span className="sidebar-label">{user.role} sections</span>
          <SidebarNav items={navItems} activeView={activeView} onNavigate={navigate} />
        </div>
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
              {mobileNavOpen ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
            </button>
            <h1 className="topbar-crumb">{user.role} workspace</h1>
          </div>
          <div className="user-menu">
            <span>{user.name}</span>
            <small>{user.role}</small>
            <div className="topbar-actions"><ThemeToggle theme={theme} onToggle={onThemeToggle} /><button type="button" className="secondary-button icon-button" onClick={() => void onLogout()}><LogOut aria-hidden="true" size={16} /><span>Logout</span></button></div>
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
              onClick={findNavTarget(['inventory', 'parts']) ? () => navigate(findNavTarget(['inventory', 'parts'])!) : undefined}
            />
            <MetricCard
              label="Paid revenue"
              value={currencyFormatter.format(metrics.paidRevenue)}
              helper={`${currencyFormatter.format(metrics.invoicedRevenue)} invoiced`}
              onClick={findNavTarget(['invoices']) ? () => navigate(findNavTarget(['invoices'])!) : undefined}
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
    adjustInventory,
    notifyCustomerNow,
    createInvoice,
    updateInvoiceStatus,
    recordInvoicePayment,
    createSavedReport,
    deleteSavedReport,
    approveEstimate,
    pushToast,
    navigate,
    focusRecordId,
  } = props;
  const [selectedDeviceType, setSelectedDeviceType] = useState<DeviceType | 'All'>('All');

  const visibleCategories = useMemo(
    () => serviceCategories.filter((category) => selectedDeviceType === 'All' || category.deviceType === selectedDeviceType),
    [selectedDeviceType],
  );

  return (
    <ModuleFrame title={title} subtitle={subtitle} toolbar={toolbar}>
      {activeView === 'dashboard' && (
        <DashboardPanel profile={currentUser.profile} state={state} selectedTechnicianId={selectedTechnicianId} navigate={navigate} moduleAccess={currentUser.moduleAccess} />
      )}

      {activeView === 'new-user' && <NewUserForm currentUser={currentUser} pushToast={pushToast} />}
      {activeView === 'users' && <UsersReport currentUser={currentUser} pushToast={pushToast} />}
      {activeView === 'customers' && <CustomersPanel state={state} pushToast={pushToast} />}
      {activeView === 'technicians' && <TechniciansPanel state={state} />}

      {activeView === 'inventory-new' && <NewPartForm addInventoryPart={props.addInventoryPart} reset={props.reset} canReset={currentUser.profile === 'admin'} pushToast={pushToast} />}
      {activeView === 'inventory-report' && <InventoryReport state={state} adjustInventory={adjustInventory} />}

      {activeView === 'wi-board' && <KanbanBoard workItems={state.workItems} updateWorkItem={updateWorkItem} pushToast={pushToast} />}
      {activeView === 'wi-new' && <NewWorkItemForm state={state} createWorkItem={createWorkItem} pushToast={pushToast} navigate={navigate} />}
      {(activeView === 'wi-all' || activeView === 'wi-walkins') && (
        <WorkItemsSection
          subView={activeView === 'wi-walkins' ? 'walkins' : 'all'}
          actorRole={currentUser.role}
          state={state}
          initialSelectedId={focusRecordId}
          updateWorkItem={updateWorkItem}
          cancelWorkItem={cancelWorkItem}
          notifyCustomerNow={notifyCustomerNow}
          pushToast={pushToast}
          navigate={navigate}
        />
      )}

      {(activeView === 'myjobs-assigned' || activeView === 'myjobs-estimates' || activeView === 'myjobs-repair') && (
        <MyJobsPanel activeView={activeView} state={state} selectedTechnicianId={selectedTechnicianId} updateWorkItem={updateWorkItem} adjustInventory={adjustInventory} pushToast={pushToast} />
      )}
      {activeView === 'parts' && <InventoryView {...props} canManage={false} canReset={false} pushToast={pushToast} />}

      {activeView === 'invoices-new' && <NewInvoiceForm state={state} createInvoice={createInvoice} pushToast={pushToast} navigate={navigate} />}
      {activeView === 'invoices-report' && (
        <InvoicesReport state={state} updateInvoiceStatus={updateInvoiceStatus} recordInvoicePayment={recordInvoicePayment} pushToast={pushToast} />
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
  const stockSectionId = moduleAccess.includes('admin') || moduleAccess.includes('agent') ? 'inventory' : 'parts';

  const lowStockRows = state.inventoryParts.filter((part) => part.quantity <= part.reorderLevel).map((part) => ({ ...part, id: part.sku }));
  const lowStockColumns: DataGridColumn<InventoryPart & { id: string }>[] = [
    { key: 'part', label: 'Part', render: (part) => <strong>{part.name}</strong>, sortValue: (part) => part.name },
    { key: 'sku', label: 'SKU', render: (part) => part.sku, sortValue: (part) => part.sku },
    { key: 'stock', label: 'Stock', render: (part) => <span className={part.quantity <= part.reorderLevel ? 'stock-low' : 'stock-ok'}>{part.quantity} in stock</span>, sortValue: (part) => part.quantity },
    { key: 'reorder', label: 'Reorder at', render: (part) => part.reorderLevel, sortValue: (part) => part.reorderLevel },
    { key: 'cost', label: 'Cost', render: (part) => currencyFormatter.format(part.unitCost), sortValue: (part) => part.unitCost },
  ];

  if (profile === 'admin') {
    return (
      <div className="creator-page">
        <div className="creator-report-grid">
          <MetricCard label="Customers" value={String(state.customers.length)} helper="Customer master records" onClick={() => navigate('customers')} />
          <MetricCard label="Technicians" value={String(technicians.length)} helper="Repair bench users" onClick={() => navigate('technicians')} />
          <MetricCard label="Invoices" value={String(state.invoices.length)} helper={`${currencyFormatter.format(metrics.invoicedRevenue)} total`} onClick={() => navigate('invoices')} />
          <MetricCard label="Parts" value={String(state.inventoryParts.length)} helper="Inventory SKUs" onClick={() => navigate('parts')} />
        </div>
        <div className="creator-record-grid">
          <DataGrid
            title="Recent work items"
            columns={workItemGridColumns}
            rows={state.workItems.slice(0, 6)}
            onRowClick={(item) => navigate('wi-all', item.id)}
          />
          <DataGrid
            title="Low stock alerts"
            columns={lowStockColumns}
            rows={lowStockRows}
            onRowClick={() => navigate(stockSectionId)}
          />
        </div>
      </div>
    );
  }

  if (profile === 'technician') {
    const assignedItems = state.workItems.filter((item) => item.assignedTechnicianId === selectedTechnicianId && item.status !== 'Cancelled');
    return <DataGrid title="My assigned jobs" columns={workItemGridColumns} rows={assignedItems} onRowClick={() => navigate('myjobs-assigned')} />;
  }

  return (
    <div className="creator-record-grid">
      <DataGrid
        title="Recent work items"
        columns={workItemGridColumns}
        rows={state.workItems.slice(0, 6)}
        onRowClick={(item) => navigate('wi-all', item.id)}
      />
      <DataGrid
        title="Low stock alerts"
        columns={lowStockColumns}
        rows={lowStockRows}
        onRowClick={() => navigate(stockSectionId)}
      />
    </div>
  );
}

const MANAGED_USERS_STORAGE_KEY = 'service-desk-managed-users';

const seedManagedUsers = (currentUser: AuthUser): ManagedUser[] => [
  { ...currentUser, active: true, createdAt: 'Local demo' },
  { id: 'user-agent', name: 'Agent User', email: 'agent@servicedesk.local', role: 'Agent', profile: 'agent', moduleAccess: ['agent'], active: true, createdAt: 'Local demo' },
  { id: 'user-technician', name: 'Technician User', email: 'tech@servicedesk.local', role: 'Technician', profile: 'technician', moduleAccess: ['technician'], active: true, createdAt: 'Local demo' },
  { id: 'user-customer', name: 'Customer User', email: 'customer@servicedesk.local', role: 'Customer', profile: 'customer', moduleAccess: ['customer'], active: true, createdAt: 'Local demo' },
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

function NewUserForm({ currentUser, pushToast }: { currentUser: AuthUser; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const [userDraft, setUserDraft] = useState<UserDraft>(blankUser);
  const [userError, setUserError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserError(null);
    if (!isApiPersistenceEnabled) {
      const created: ManagedUser = { id: `local-${Date.now()}`, role: profileToRole(userDraft.profile), moduleAccess: profileToModules(userDraft.profile), createdAt: 'Local demo', ...userDraft };
      saveLocalManagedUsers([created, ...loadLocalManagedUsers(currentUser)]);
      setUserDraft(blankUser);
      pushToast(`Created user ${userDraft.name || userDraft.email}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      await userApi.create(userDraft);
      setUserDraft(blankUser);
      pushToast(`Created user ${userDraft.name || userDraft.email}.`);
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
        <button className="primary-button icon-button" type="submit" disabled={isSubmitting}><UserPlus aria-hidden="true" size={16} /><span>{isSubmitting ? 'Creating…' : 'Create user'}</span></button>
      </form>
    </CreatorFormCard>
  );
}

function UsersReport({ currentUser, pushToast }: { currentUser: AuthUser; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const [users, setUsers] = useState<ManagedUser[]>(() => (isApiPersistenceEnabled ? [] : loadLocalManagedUsers(currentUser)));
  const [userError, setUserError] = useState<string | null>(null);

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

  const columns: DataGridColumn<ManagedUser>[] = [
    { key: 'name', label: 'Name', render: (managedUser) => <strong>{managedUser.name}</strong>, sortValue: (managedUser) => managedUser.name },
    { key: 'email', label: 'Email', render: (managedUser) => managedUser.email, sortValue: (managedUser) => managedUser.email },
    { key: 'profile', label: 'Profile', render: (managedUser) => <span className="pill">{managedUser.profile}</span>, sortValue: (managedUser) => managedUser.profile },
    { key: 'status', label: 'Status', render: (managedUser) => <span className={managedUser.active ? 'stock-ok' : 'muted'}>{managedUser.active ? 'Active' : 'Inactive'}</span>, sortValue: (managedUser) => (managedUser.active ? 0 : 1) },
    {
      key: 'action',
      label: 'Action',
      render: (managedUser) => (
        <button className={managedUser.active ? 'danger-button' : 'secondary-dark-button'} type="button" onClick={() => void toggleUser(managedUser)} disabled={managedUser.id === currentUser.id}>
          {managedUser.active ? 'Deactivate' : 'Activate'}
        </button>
      ),
    },
  ];

  return (
    <>
      {userError && <div className="login-error">{userError}</div>}
      <DataGrid title="Users report" columns={columns} rows={users} />
    </>
  );
}

function CustomersPanel({ state, pushToast }: { state: DeskActions['state']; pushToast: (message: ReactNode, tone?: ToastTone) => void }) {
  const columns: DataGridColumn<Customer>[] = [
    { key: 'name', label: 'Name', render: (customer) => <strong>{customer.name}</strong>, sortValue: (customer) => customer.name },
    { key: 'phone', label: 'Phone', render: (customer) => customer.phone, sortValue: (customer) => customer.phone },
    { key: 'email', label: 'Email', render: (customer) => customer.email, sortValue: (customer) => customer.email },
    { key: 'repairs', label: 'Repairs', render: (customer) => state.workItems.filter((item) => item.customerId === customer.id).length, sortValue: (customer) => state.workItems.filter((item) => item.customerId === customer.id).length },
  ];

  return (
    <DataGrid
      title="Customer master"
      columns={columns}
      rows={state.customers}
      toolbar={<button type="button" className="secondary-dark-button icon-button" onClick={() => {
        if (isApiPersistenceEnabled) {
          void exportApi.customersCsv().catch((error: unknown) => pushToast(error instanceof Error ? error.message : 'Export failed.', 'error'));
          return;
        }
        exportCustomersCsvLocally(state);
      }}><Download aria-hidden="true" size={16} /><span>Export CSV</span></button>}
    />
  );
}

function TechniciansPanel({ state }: { state: DeskActions['state'] }) {
  const columns: DataGridColumn<Technician>[] = [
    { key: 'name', label: 'Name', render: (tech) => <strong>{tech.name}</strong>, sortValue: (tech) => tech.name },
    { key: 'email', label: 'Email', render: (tech) => tech.email, sortValue: (tech) => tech.email },
    { key: 'specialties', label: 'Specialties', render: (tech) => tech.specialties.join(', ') },
    {
      key: 'active',
      label: 'Active jobs',
      render: (tech) => state.workItems.filter((item) => item.assignedTechnicianId === tech.id && !terminalStatuses.includes(item.status)).length,
      sortValue: (tech) => state.workItems.filter((item) => item.assignedTechnicianId === tech.id && !terminalStatuses.includes(item.status)).length,
    },
  ];

  return <DataGrid title="Technician master" columns={columns} rows={technicians} />;
}

function NewInvoiceForm({
  state,
  createInvoice,
  pushToast,
  navigate,
}: {
  state: DeskActions['state'];
  createInvoice: DeskActions['createInvoice'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  navigate: (id: string) => void;
}) {
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(() => blankInvoiceDraft(state.workItems[0]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedWorkItem = state.workItems.find((item) => item.id === invoiceDraft.workItemId);
  const invoiceTotal = invoiceDraft.laborAmount + invoiceDraft.partsAmount + invoiceDraft.diagnosticFee || invoiceDraft.amount;

  const submitInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await createInvoice(invoiceDraft);
      pushToast(`Invoice issued for ${currencyFormatter.format(invoiceTotal)}.`);
      setInvoiceDraft(blankInvoiceDraft(state.workItems[0]));
      navigate('invoices-report');
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
        <button className="primary-button icon-button" type="submit" disabled={isSubmitting}><Receipt aria-hidden="true" size={16} /><span>{isSubmitting ? 'Issuing…' : 'Issue invoice'}</span></button>
      </form>
    </CreatorFormCard>
  );
}

function InvoicesReport({
  state,
  updateInvoiceStatus,
  recordInvoicePayment,
  pushToast,
}: {
  state: DeskActions['state'];
  updateInvoiceStatus: DeskActions['updateInvoiceStatus'];
  recordInvoicePayment: DeskActions['recordInvoicePayment'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
  const changeInvoiceStatus = (invoiceId: string, status: InvoiceStatus) => {
    if (status === 'Void' && !window.confirm('Void this invoice? This cannot be undone.')) {
      return Promise.resolve();
    }

    pushToast(`Invoice ${invoiceId} marked ${status}.`);
    return updateInvoiceStatus(invoiceId, status);
  };

  const submitPayment = async (invoiceId: string, payment: InvoicePaymentDraft) => {
    await recordInvoicePayment(invoiceId, payment);
    pushToast(`Payment recorded for ${invoiceId} via ${payment.method}.`);
  };

  return <InvoiceList invoices={state.invoices} updateInvoiceStatus={changeInvoiceStatus} recordPayment={submitPayment} pushToast={pushToast} />;
}


function NewWorkItemForm({
  state,
  createWorkItem,
  pushToast,
  navigate,
}: {
  state: DeskActions['state'];
  createWorkItem: DeskActions['createWorkItem'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  navigate: (id: string) => void;
}) {
  const [draft, setDraft] = useState<WorkItemDraft>(blankDraft);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await createWorkItem(draft);
      pushToast(<>Created work item for <strong>{draft.customerName}</strong> · <strong>{draft.deviceModel}</strong>.</>);
      setDraft(blankDraft);
      navigate('wi-all');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CreatorSplit>
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
            <button type="button" className="secondary-button" onClick={() => navigate('wi-all')} disabled={isSubmitting}>Cancel</button>
          </div>
        </form>
      </CreatorFormCard>
      <DataGrid title="Recently created" columns={workItemGridColumns} rows={state.workItems.slice(0, 5)} />
    </CreatorSplit>
  );
}

function WorkItemsSection({
  subView,
  actorRole,
  state,
  initialSelectedId,
  updateWorkItem,
  cancelWorkItem,
  notifyCustomerNow,
  pushToast,
  navigate,
}: {
  subView: 'all' | 'walkins';
  actorRole: UserRole;
  state: DeskActions['state'];
  initialSelectedId?: string | null;
  updateWorkItem: DeskActions['updateWorkItem'];
  cancelWorkItem: DeskActions['cancelWorkItem'];
  notifyCustomerNow: DeskActions['notifyCustomerNow'];
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
  navigate: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initialSelectedId ?? state.workItems[0]?.id ?? '');

  const filtered = state.workItems.filter((item) =>
    `${item.id} ${item.customerName} ${item.deviceModel} ${item.status}`.toLowerCase().includes(query.toLowerCase()),
  );
  const list = subView === 'walkins' ? filtered.filter((item) => item.source === 'Walk-in') : filtered;
  const selected = state.workItems.find((item) => item.id === selectedId) ?? list[0];

  const cancelItem = (workItemId: string) => {
    if (!window.confirm('Cancel this work item? The customer will be notified and this cannot be undone.')) {
      return;
    }

    cancelWorkItem(workItemId, actorRole);
    pushToast('Work item cancelled.');
  };

  return (
    <CreatorRecordBrowser
      title={subView === 'walkins' ? 'Walk-in requests' : 'All work items'}
      records={list}
      selected={selected}
      query={query}
      setQuery={setQuery}
      setSelectedId={setSelectedId}
      toolbar={<button type="button" className="primary-button icon-button" onClick={() => navigate('wi-new')}><Plus aria-hidden="true" size={16} /><span>New work item</span></button>}
      detail={selected && (
        <WorkItemCard item={selected}>
          <div className="card-actions">
            <select aria-label="Reassign technician" value={selected.assignedTechnicianId} onChange={(event) => updateWorkItem(selected.id, { assignedTechnicianId: event.target.value, status: 'Assigned' }, actorRole, `${actorRole} reassigned the work item.`)}>
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
  const assignedItems = state.workItems.filter((item) => item.assignedTechnicianId === selectedTechnicianId && item.status !== 'Cancelled');
  const estimateItems = assignedItems.filter((item) => item.status === 'Diagnosis' || item.status === 'Estimate Shared');
  const repairItems = assignedItems.filter((item) => item.status === 'Customer Approved' || item.status === 'In Repair' || item.status === 'Waiting for Parts' || item.status === 'Quality Check');
  const visibleItems = activeView === 'myjobs-estimates' ? estimateItems : activeView === 'myjobs-repair' ? repairItems : assignedItems;

  return (
    <div className="creator-record-grid">
      {visibleItems.map((item) => <TechnicianWorkItem key={item.id} item={item} parts={state.inventoryParts} updateWorkItem={updateWorkItem} adjustInventory={adjustInventory} pushToast={pushToast} />)}
      {!visibleItems.length && <EmptyState title="No records in this view" body="Change the technician or view filter to see more work items." />}
    </div>
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
  const customerItems = state.workItems.filter((item) => item.customerId === selectedCustomerId);
  const selected = customerItems.find((item) => item.id === selectedId) ?? customerItems[0];
  const awaitingMyApproval = customerItems.filter((item) => item.status === 'Estimate Shared' && !item.approvedByCustomer).length;
  const completedRepairs = customerItems.filter((item) => item.status === 'Delivered').length;
  const totalPaid = state.invoices.filter((invoice) => invoice.customerId === selectedCustomerId && invoice.status === 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0);

  const approve = async (workItemId: string) => {
    setApprovingId(workItemId);
    try {
      await approveEstimate(workItemId);
      pushToast('Estimate approved — the technician has been notified.');
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <>
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

function NewPartForm({
  addInventoryPart,
  reset,
  canReset,
  pushToast,
}: {
  addInventoryPart: DeskActions['addInventoryPart'];
  reset: DeskActions['reset'];
  canReset: boolean;
  pushToast: (message: ReactNode, tone?: ToastTone) => void;
}) {
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
    <CreatorFormCard title="Part form" eyebrow="Inventory">
      <form className="creator-form" onSubmit={submit}>
        <label>SKU<input required value={part.sku} onChange={(event) => setPart({ ...part, sku: event.target.value })} placeholder="BAT-MBP-2024" /></label>
        <label>Name<input required value={part.name} onChange={(event) => setPart({ ...part, name: event.target.value })} placeholder="MacBook Battery" /></label>
        <div className="form-row"><label>Device<select value={part.compatibleWith[0]} onChange={(event) => setPart({ ...part, compatibleWith: [event.target.value as DeviceType] })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Quantity<input type="number" value={part.quantity} onChange={(event) => setPart({ ...part, quantity: Number(event.target.value) })} /></label></div>
        <div className="form-row"><label>Reorder at<input type="number" value={part.reorderLevel} onChange={(event) => setPart({ ...part, reorderLevel: Number(event.target.value) })} /></label><label>Cost<input type="number" value={part.unitCost} onChange={(event) => setPart({ ...part, unitCost: Number(event.target.value) })} /></label></div>
        <div className="card-actions"><button className="primary-button" type="submit">Add / update part</button>{canReset && <button className="secondary-dark-button" type="button" onClick={confirmReset}>Reset demo data</button>}</div>
      </form>
    </CreatorFormCard>
  );
}

function InventoryReport({ state, adjustInventory }: { state: DeskActions['state']; adjustInventory: DeskActions['adjustInventory'] }) {
  const columns: DataGridColumn<InventoryPart & { id: string }>[] = [
    { key: 'name', label: 'Name', render: (part) => <strong>{part.name}</strong>, sortValue: (part) => part.name },
    { key: 'sku', label: 'SKU', render: (part) => part.sku, sortValue: (part) => part.sku },
    { key: 'device', label: 'Device', render: (part) => part.compatibleWith.join(', ') },
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

  return <DataGrid title="Inventory report" columns={columns} rows={state.inventoryParts.map((part) => ({ ...part, id: part.sku }))} />;
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
                  <button type="button" aria-label={`Decrease ${inventoryPart.name} quantity`} onClick={() => adjustInventory(inventoryPart.sku, -1)}><Minus aria-hidden="true" size={16} /></button>
                  <button type="button" aria-label={`Increase ${inventoryPart.name} quantity`} onClick={() => adjustInventory(inventoryPart.sku, 1)}><Plus aria-hidden="true" size={16} /></button>
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
  recordPayment: (invoiceId: string, payment: InvoicePaymentDraft) => Promise<void>;
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
      <div className="list-header"><h3>Invoice register</h3><div className="card-actions"><span>{invoices.length} records</span><button type="button" className="secondary-dark-button icon-button" onClick={exportCsv}><Download aria-hidden="true" size={16} /><span>Export CSV</span></button></div></div>
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
  recordPayment: (invoiceId: string, payment: InvoicePaymentDraft) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>('Card (Test Mode)');
  const [reference, setReference] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const handleRecordPayment = async () => {
    setIsRecording(true);
    try {
      await recordPayment(invoice.id, { method, reference });
    } finally {
      setIsRecording(false);
    }
  };

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
          <select aria-label="Payment method" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {paymentMethods.map((option) => <option key={option}>{option}</option>)}
          </select>
          <input aria-label="Payment reference (optional)" placeholder="Reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} />
          <button type="button" className="primary-button icon-button" onClick={() => void handleRecordPayment()} disabled={isRecording}><CreditCard aria-hidden="true" size={16} /><span>{isRecording ? 'Recording…' : 'Record payment'}</span></button>
          <button type="button" className="danger-button icon-button" onClick={() => updateInvoiceStatus(invoice.id, 'Void')} disabled={isRecording}><XCircle aria-hidden="true" size={16} /><span>Void</span></button>
        </div>
      ) : (
        <select aria-label="Invoice status" value={invoice.status} onChange={(event) => updateInvoiceStatus(invoice.id, event.target.value as InvoiceStatus)}>
          {(['Draft', 'Issued', 'Void'] satisfies InvoiceStatus[]).map((status) => <option key={status}>{status}</option>)}
        </select>
      )}
    </div>
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
            <button type="button" className="secondary-dark-button icon-button" onClick={() => downloadRowsAsCsv(`${entity}-report.csv`, columns, rows)}><Download aria-hidden="true" size={16} /><span>Export CSV</span></button>
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
      <DataGrid
        title={title}
        columns={workItemGridColumns}
        rows={records}
        selectedId={selected?.id}
        onRowClick={(item) => setSelectedId(item.id)}
        toolbar={toolbar}
        emptyTitle="No records"
        emptyBody="Nothing matches yet."
        filter={!hideSearch && (
          <div className="data-grid-filter">
            <label className="visually-hidden" htmlFor={searchId}>Search {title}</label>
            <input id={searchId} className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" />
          </div>
        )}
      />
      <div className="creator-detail-panel">
        {detail ?? <EmptyState title="Select a record" body="Choose a record from the report to open its detail view." />}
      </div>
    </div>
  );
}

interface DataGridColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
}

function DataGrid<T extends { id: string }>({
  title,
  columns,
  rows,
  onRowClick,
  selectedId,
  toolbar,
  filter,
  emptyTitle = 'No records',
  emptyBody = 'This report does not have records yet.',
}: {
  title: string;
  columns: DataGridColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  selectedId?: string;
  toolbar?: ReactNode;
  filter?: ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sortedRows = useMemo(() => {
    const column = sort ? columns.find((candidate) => candidate.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) {
      return rows;
    }
    const sortValue = column.sortValue;
    const sorted = [...rows].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    return sort.dir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, dir: 'asc' };
      }
      return current.dir === 'asc' ? { key, dir: 'desc' } : null;
    });
  };

  const allChecked = rows.length > 0 && checked.size === rows.length;
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map((row) => row.id)));
  const toggleOne = (id: string) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });

  return (
    <div className="creator-list-panel data-grid-panel">
      <div className="list-header"><h3>{title}</h3><div className="card-actions"><span>{rows.length} records</span>{toolbar}</div></div>
      {filter}
      {rows.length ? (
        <div className="data-grid">
          <table className="data-grid-table">
            <thead>
              <tr>
                <th className="data-grid-check-col"><input type="checkbox" aria-label="Select all rows" checked={allChecked} onChange={toggleAll} /></th>
                {columns.map((column) => (
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
              {sortedRows.map((row) => (
                <tr
                  key={row.id}
                  className={[onRowClick && 'is-clickable', selectedId === row.id && 'is-active'].filter(Boolean).join(' ')}
                  onClick={() => onRowClick?.(row)}
                >
                  <td className="data-grid-check-col" onClick={(event) => event.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select row ${row.id}`} checked={checked.has(row.id)} onChange={() => toggleOne(row.id)} />
                  </td>
                  {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  { key: 'device', label: 'Device', render: (item) => <strong>{item.deviceModel}</strong>, sortValue: (item) => item.deviceModel },
  { key: 'id', label: 'ID', render: (item) => item.id, sortValue: (item) => item.id },
  { key: 'customer', label: 'Customer', render: (item) => item.customerName, sortValue: (item) => item.customerName },
  { key: 'status', label: 'Status', render: (item) => <span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span>, sortValue: (item) => item.status },
  { key: 'estimate', label: 'Estimate', render: (item) => currencyFormatter.format(item.estimatedPrice), sortValue: (item) => item.estimatedPrice },
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

function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const nextTheme = theme === 'light' ? 'dark' : 'light';

  return (
    <button className="theme-toggle" type="button" onClick={onToggle} aria-label={`Switch to ${nextTheme} mode`}>
      {theme === 'light' ? <Moon aria-hidden="true" size={16} /> : <Sun aria-hidden="true" size={16} />}
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

function MetricCard({ label, value, helper, onClick }: { label: string; value: string; helper: string; onClick?: () => void }) {
  const content = <><span>{label}</span><strong>{value}</strong><p>{helper}</p></>;
  if (onClick) {
    return <button type="button" className="metric-card clickable" onClick={onClick}>{content}</button>;
  }
  return <article className="metric-card">{content}</article>;
}

export default App;
