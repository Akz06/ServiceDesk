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
  it('shows homepage and logs admin into all modules', async () => {
    const user = await loginAs('admin@servicedesk.local', 'Admin@12345');

    expect(window.location.pathname).toBe('/app/test-session-123');
    expect(screen.getByRole('button', { name: /agent module/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /technician module/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer module/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /technician module/i }));
    expect(screen.getByRole('heading', { name: /analysis, estimates, and repair updates/i })).toBeInTheDocument();
  });

  it('logs into agent module and creates a work item', async () => {
    const user = await loginAs('agent@servicedesk.local', 'Agent@12345');

    expect(screen.getByRole('heading', { name: /create a work item/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /technician module/i })).not.toBeInTheDocument();

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

    await user.selectOptions(screen.getByLabelText(/customer/i), 'CUST-2003');
    await user.click(screen.getByRole('button', { name: /approve estimate/i }));

    expect(screen.getByText(/customer approved the shared estimate/i)).toBeInTheDocument();
    expect(screen.getAllByText('Customer Approved').length).toBeGreaterThan(0);
  });

  it('lets technician update repair status', async () => {
    const user = await loginAs('tech@servicedesk.local', 'Tech@12345');

    const card = screen.getByText('Dell XPS 13').closest('.ticket-card');
    expect(card).not.toBeNull();

    const scoped = within(card as HTMLElement);
    await user.selectOptions(scoped.getByLabelText(/status/i), 'Estimate Shared');
    await user.clear(scoped.getByLabelText(/estimate/i));
    await user.type(scoped.getByLabelText(/estimate/i), '155');
    await user.click(scoped.getByRole('button', { name: /save technician update/i }));

    expect(screen.getByText('$155')).toBeInTheDocument();
  });
});
