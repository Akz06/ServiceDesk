import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/login/test-session-123');
  vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000123');
});

describe('App workflow', () => {
  it('logs into agent view and creates a work item', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /agent/i }));
    expect(window.location.pathname).toBe('/app/test-session-123');
    expect(screen.getByRole('heading', { name: /create a work item/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/customer name/i), 'Asha Rao');
    await user.type(screen.getByLabelText(/^phone/i), '+1 555 0444');
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.com');
    await user.type(screen.getByLabelText(/device model/i), 'Lenovo ThinkPad');
    await user.type(screen.getByLabelText(/issue summary/i), 'Laptop does not power on');
    await user.click(screen.getByRole('button', { name: /create wi/i }));

    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Lenovo ThinkPad')).toBeInTheDocument();
  });

  it('lets customer approve an estimate', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /customer/i }));
    await user.selectOptions(screen.getByLabelText(/customer/i), 'CUST-2003');
    await user.click(screen.getByRole('button', { name: /approve estimate/i }));

    expect(screen.getByText(/customer approved the shared estimate/i)).toBeInTheDocument();
    expect(screen.getAllByText('Customer Approved').length).toBeGreaterThan(0);
  });

  it('lets technician update repair status', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /technician/i }));
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
