import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/login/test-session-123');
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000123');
});

async function loginAs(email: string, password: string) {
  const user = userEvent.setup();
  render(<App />);
  await user.clear(screen.getByLabelText(/email/i));
  await user.type(screen.getByLabelText(/email/i), email);
  await user.clear(screen.getByLabelText(/password/i));
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole('button', { name: /login securely/i }));
  return user;
}

describe('App workflow', () => {
  it('shows homepage and logs admin into every section, with no module switcher', async () => {
    const user = await loginAs('admin@servicedesk.local', 'Admin@12345');

    expect(window.location.pathname).toBe('/app/test-session-123');
    expect(screen.queryByRole('button', { name: /agent module/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^work items$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my jobs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my repairs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^logout$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /my jobs/i }));
    expect(screen.getByRole('heading', { name: /^assigned jobs$/i })).toBeInTheDocument();
  });

  it('logs into agent module and creates a work item', async () => {
    const user = await loginAs('agent@servicedesk.local', 'Agent@12345');

    expect(screen.queryByRole('button', { name: /technician module/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^work items$/i }));
    await user.click(screen.getByRole('button', { name: /new work item/i }));
    expect(screen.getByRole('heading', { name: /create a work item/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/customer name/i), 'Asha Rao');
    await user.type(screen.getByLabelText(/^phone/i), '+1 555 0444');
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/device model/i), 'Lenovo ThinkPad');
    await user.type(screen.getByLabelText(/issue summary/i), 'Laptop does not power on');
    await user.click(screen.getByRole('button', { name: /create wi/i }));

    expect(screen.getAllByText('Asha Rao').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lenovo ThinkPad').length).toBeGreaterThan(0);
  });

  it('lets customer approve an estimate', async () => {
    const user = await loginAs('customer@servicedesk.local', 'Customer@12345');

    await user.selectOptions(screen.getByLabelText(/^customer$/i), 'CUST-2003');
    await user.click(screen.getByText('Custom Gaming PC'));
    await user.click(screen.getByRole('button', { name: /approve estimate/i }));

    expect(screen.getByText(/customer approved the shared estimate/i)).toBeInTheDocument();
    expect(screen.getAllByText('Customer Approved').length).toBeGreaterThan(0);
  });

  it('lets technician update repair status', async () => {
    const user = await loginAs('tech@servicedesk.local', 'Tech@12345');

    await user.click(screen.getByRole('button', { name: /my jobs/i }));

    const card = screen.getByText('Dell XPS 13').closest('.ticket-card');
    expect(card).not.toBeNull();

    const scoped = within(card as HTMLElement);
    await user.selectOptions(scoped.getByLabelText(/status/i), 'Estimate Shared');
    await user.clear(scoped.getByLabelText(/^labor/i));
    await user.type(scoped.getByLabelText(/^labor/i), '155');
    await user.clear(scoped.getByLabelText(/^parts/i));
    await user.clear(scoped.getByLabelText(/diagnostic fee/i));
    await user.click(scoped.getByRole('button', { name: /save technician update/i }));

    expect(screen.getAllByText('$155').length).toBeGreaterThan(0);
  });

  it('creates a brand-new organization via signup and lands in its own workspace', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('tab', { name: /create organization/i }));
    await user.type(screen.getByLabelText(/organization name/i), 'Riverside Repair Co');
    await user.type(screen.getByLabelText(/your name/i), 'Taylor Admin');
    await user.type(screen.getByLabelText(/^email$/i), 'taylor@riverside.example');
    await user.type(screen.getByLabelText(/^password$/i), 'SuperSecret123');
    await user.click(screen.getByRole('button', { name: /^create organization$/i }));

    expect(await screen.findByRole('button', { name: /organization/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /organization/i }));
    expect(await screen.findByText('Riverside Repair Co')).toBeInTheDocument();
  });

  it('bulk-adds users from pasted CSV, reporting both created and failed rows', async () => {
    const user = await loginAs('admin@servicedesk.local', 'Admin@12345');

    await user.click(screen.getByRole('button', { name: /organization/i }));
    await user.click(screen.getByRole('button', { name: /bulk add users/i }));

    const csv = [
      'name,email,profile',
      'Alex Rivera,alex.rivera@example.com,agent',
      'Bad Row,not-an-email,agent',
      'Duplicate Admin,admin@servicedesk.local,agent',
    ].join('\n');
    await user.type(screen.getByLabelText(/paste csv/i), csv);

    // The malformed-email row is caught at parse time, before submission even starts.
    expect(screen.getByText(/invalid email/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create \d+ users?/i }));

    // The valid row is created; the row re-using an existing email is rejected at submit time.
    expect(await screen.findByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
  });

  it('creates an invoice and records a payment against it', async () => {
    const user = await loginAs('admin@servicedesk.local', 'Admin@12345');

    await user.click(screen.getByRole('button', { name: /^invoices$/i }));
    await user.click(screen.getByRole('button', { name: /new invoice/i }));
    await user.clear(screen.getByLabelText(/^labor/i));
    await user.type(screen.getByLabelText(/^labor/i), '321');
    await user.clear(screen.getByLabelText(/^parts/i));
    await user.clear(screen.getByLabelText(/diagnostic fee/i));
    await user.click(screen.getByRole('button', { name: /issue invoice/i }));

    expect(await screen.findByText('$321')).toBeInTheDocument();

    const row = screen.getByText('$321').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /record payment for/i }));
    await user.click(screen.getByRole('button', { name: /^record payment$/i }));

    expect(await screen.findByText(/payment recorded/i)).toBeInTheDocument();
  });

  it('adjusts inventory stock from the adjust-stock modal', async () => {
    const user = await loginAs('admin@servicedesk.local', 'Admin@12345');

    await user.click(screen.getByRole('button', { name: /^inventory$/i }));
    const row = screen.getByText('USB-C 65W Adapter').closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole('button', { name: /adjust usb-c 65w adapter stock/i }));
    await user.click(screen.getByRole('button', { name: /increase quantity/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(await screen.findByText(/updated usb-c 65w adapter stock/i)).toBeInTheDocument();
  });

  it('requires confirmation before deleting a saved report, and only deletes when confirmed', async () => {
    const user = await loginAs('admin@servicedesk.local', 'Admin@12345');
    const confirmSpy = vi.spyOn(window, 'confirm');

    await user.click(screen.getByRole('button', { name: /export reports/i }));
    await user.click(screen.getByRole('button', { name: /^save this report$/i }));
    await user.type(screen.getByPlaceholderText(/report name/i), 'Test Delete Report');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText('Test Delete Report')).toBeInTheDocument();

    confirmSpy.mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.getByText('Test Delete Report')).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.queryByText('Test Delete Report')).not.toBeInTheDocument();
    expect(await screen.findByText(/deleted report/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
