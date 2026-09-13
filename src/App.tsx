import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ProgressTracker } from './components/ProgressTracker';
import { serviceCategories, technicians } from './data/repairShop';
import { currencyFormatter, deviceTypes, priorities, roles, terminalStatuses } from './domain/constants';
import { useServiceDesk } from './hooks/useServiceDesk';
import { getInitialRoleFromUrl, getOrCreateSessionId, updateUrlForRole } from './services/routing';
import { getMetrics, getNextStatuses } from './services/serviceDeskStore';
import type { DeviceType, InventoryPart, UserRole, WorkItem, WorkItemDraft, WorkItemStatus } from './types';

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

function App() {
  const [sessionId] = useState(getOrCreateSessionId);
  const [activeRole, setActiveRole] = useState<UserRole | null>(getInitialRoleFromUrl);
  const [selectedDeviceType, setSelectedDeviceType] = useState<DeviceType | 'All'>('All');
  const [selectedTechnicianId, setSelectedTechnicianId] = useState('tech-arun');
  const serviceDesk = useServiceDesk();
  const { state } = serviceDesk;
  const metrics = getMetrics(state);

  const visibleCategories = useMemo(
    () => serviceCategories.filter((category) => selectedDeviceType === 'All' || category.deviceType === selectedDeviceType),
    [selectedDeviceType],
  );

  const login = (role: UserRole) => {
    setActiveRole(role);
    updateUrlForRole(sessionId, role);
  };

  const logout = () => {
    setActiveRole(null);
    updateUrlForRole(sessionId, null);
  };

  if (!activeRole) {
    return <LoginPage sessionId={sessionId} onLogin={login} />;
  }

  return (
    <main className="app-shell">
      <header className="hero compact-hero">
        <nav className="topbar" aria-label="Application navigation">
          <div className="brand"><div className="brand-mark">SD</div><span>{appName}</span></div>
          <span className="session-chip">Session: {sessionId.slice(0, 8)}</span>
          <div className="topbar-actions">
            {roles.map((role) => (
              <button className={role === activeRole ? 'tab-button active' : 'tab-button'} key={role} onClick={() => login(role)} type="button">
                {role}
              </button>
            ))}
            <button type="button" className="secondary-button" onClick={logout}>Logout</button>
          </div>
        </nav>
        <section className="hero-grid dashboard-hero">
          <div>
            <p className="eyebrow">{activeRole} workspace</p>
            <h1>Repair workflow command center</h1>
            <p className="hero-copy">
              Create work items, assign technicians, capture diagnosis and estimate, approve customer changes,
              update repair status, and keep customers synced through persistent local state.
            </p>
          </div>
          <aside className="hero-card">
            <span>Operational snapshot</span>
            <strong>{metrics.activeWorkItems} active WIs</strong>
            <p>{metrics.lowStockParts} stock alerts · {currencyFormatter.format(metrics.estimatedRevenue)} estimated value</p>
          </aside>
        </section>
      </header>

      <SyncStatus isApiBacked={serviceDesk.isApiBacked} isLoading={serviceDesk.isLoading} error={serviceDesk.error} onRefresh={serviceDesk.refresh} />

      <section className="metrics-grid" aria-label="Operational metrics">
        <MetricCard label="Active WIs" value={String(metrics.activeWorkItems)} helper="Open repair jobs" />
        <MetricCard label="Awaiting approval" value={String(metrics.awaitingApproval)} helper="Estimates shared" />
        <MetricCard label="Low-stock parts" value={String(metrics.lowStockParts)} helper="Inventory reorder alerts" />
        <MetricCard label="Revenue pipeline" value={currencyFormatter.format(metrics.estimatedRevenue)} helper="Total estimates" />
      </section>

      {activeRole === 'Agent' && <AgentView {...serviceDesk} />}
      {activeRole === 'Technician' && (
        <TechnicianView
          selectedTechnicianId={selectedTechnicianId}
          setSelectedTechnicianId={setSelectedTechnicianId}
          {...serviceDesk}
        />
      )}
      {activeRole === 'Customer' && <CustomerView {...serviceDesk} />}

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

      <InventoryView {...serviceDesk} />
    </main>
  );
}

function LoginPage({ sessionId, onLogin }: { sessionId: string; onLogin: (role: UserRole) => void }) {
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">{appName}</p>
        <h1>Home Page Login</h1>
        <p className="muted">Unique URL parameter: <strong className="inline-code">/login/{sessionId}</strong></p>
        <div className="role-grid">
          {roles.map((role) => (
            <button type="button" key={role} className="role-card" onClick={() => onLogin(role)}>
              <span>{role}</span>
              <strong>{role === 'Agent' ? 'Create and assign WIs' : role === 'Technician' ? 'Analyze, estimate, and repair' : 'Approve estimates and track progress'}</strong>
            </button>
          ))}
        </div>
        <p className="contact-line">Shop contact: <a href={`mailto:${supportEmail}`}>{supportEmail}</a> · <a href={`tel:${supportPhone}`}>{supportPhone}</a></p>
      </section>
    </main>
  );
}

type DeskActions = ReturnType<typeof useServiceDesk>;

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
        <p className="eyebrow">Agent view</p>
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
        <div><p className="eyebrow">Technician view</p><h2>Analysis, estimates, and repair updates</h2></div>
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
        <div><p className="eyebrow">Customer view</p><h2>Realtime repair progress</h2></div>
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

function InventoryView({ state, adjustInventory, addInventoryPart, reset }: DeskActions) {
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
        <form className="booking-form compact-form" onSubmit={submit}>
          <label>SKU<input required value={part.sku} onChange={(event) => setPart({ ...part, sku: event.target.value })} placeholder="BAT-MBP-2024" /></label>
          <label>Name<input required value={part.name} onChange={(event) => setPart({ ...part, name: event.target.value })} placeholder="MacBook Battery" /></label>
          <div className="form-row"><label>Device<select value={part.compatibleWith[0]} onChange={(event) => setPart({ ...part, compatibleWith: [event.target.value as DeviceType] })}>{deviceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Quantity<input type="number" value={part.quantity} onChange={(event) => setPart({ ...part, quantity: Number(event.target.value) })} /></label></div>
          <div className="form-row"><label>Reorder at<input type="number" value={part.reorderLevel} onChange={(event) => setPart({ ...part, reorderLevel: Number(event.target.value) })} /></label><label>Cost<input type="number" value={part.unitCost} onChange={(event) => setPart({ ...part, unitCost: Number(event.target.value) })} /></label></div>
          <div className="card-actions"><button className="primary-button" type="submit">Add / update part</button><button className="secondary-dark-button" type="button" onClick={reset}>Reset demo data</button></div>
        </form>
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
