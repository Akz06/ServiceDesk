import { createContext, useContext } from 'react';
import type { AuthProfile, DeviceType, ModuleId, Priority, UserRole, WorkItemStatus } from '../types';

export const deviceTypes: DeviceType[] = ['Laptop', 'Desktop', 'Mobile', 'Tablet', 'Console', 'Accessory', 'Other Electronics'];

export const priorities: Priority[] = ['Low', 'Normal', 'High', 'Urgent'];

export const roles: UserRole[] = ['Admin', 'Agent', 'Technician', 'Customer'];

export const authProfiles: AuthProfile[] = ['admin', 'agent', 'technician', 'customer'];

export const profileModuleAccess: Record<AuthProfile, ModuleId[]> = {
  admin: ['admin', 'agent', 'technician', 'customer'],
  agent: ['agent'],
  technician: ['technician'],
  customer: ['customer'],
};

export const profileRoleMap: Record<AuthProfile, UserRole> = {
  admin: 'Admin',
  agent: 'Agent',
  technician: 'Technician',
  customer: 'Customer',
};

export const moduleLabels: Record<ModuleId, string> = {
  admin: 'Admin',
  agent: 'Agent',
  technician: 'Technician',
  customer: 'Customer',
};

export const moduleDescriptions: Record<ModuleId, string> = {
  admin: 'Manage users, master data, invoices, revenue pipeline, inventory alerts, and ERP-style controls.',
  agent: 'Create repair work items, capture online/walk-in requests, assign technicians, and manage queue activity.',
  technician: 'Perform diagnosis, share estimates, consume spare parts, and update repair status in real time.',
  customer: 'Track repair progress, review updates, and approve estimates from a customer-friendly view.',
};

export const defaultModuleForProfile = (profile: AuthProfile): ModuleId => profileModuleAccess[profile][0];

export const statusFlow: WorkItemStatus[] = [
  'New Request',
  'Assigned',
  'Diagnosis',
  'Estimate Shared',
  'Customer Approved',
  'In Repair',
  'Waiting for Parts',
  'Quality Check',
  'Ready for Pickup',
  'Delivered',
];

export const terminalStatuses: WorkItemStatus[] = ['Delivered', 'Cancelled'];

const defaultCurrencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const createCurrencyFormatter = (currencyCode: string): Intl.NumberFormat => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 });
  } catch {
    // An org saved an invalid/unsupported currency code — fall back rather than crash the UI.
    return defaultCurrencyFormatter;
  }
};

export const currencyCodes = ['USD', 'INR', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'JPY'];

export const formatShortId = (prefix: string, sequenceNumber: number): string => `${prefix}-${String(sequenceNumber).padStart(3, '0')}`;

interface OrgDisplaySettings {
  currencyFormatter: Intl.NumberFormat;
  workItemIdPrefix: string;
  invoiceIdPrefix: string;
}

// An organization's currency and short-id prefixes are reached through this context (provided
// once, near the root of the authenticated Workspace) instead of being threaded as props through
// every intermediate component, so every amount/short-id on screen updates together when the
// org's settings change.
const OrgDisplaySettingsContext = createContext<OrgDisplaySettings>({
  currencyFormatter: defaultCurrencyFormatter,
  workItemIdPrefix: 'WI',
  invoiceIdPrefix: 'INV',
});
export const OrgDisplaySettingsProvider = OrgDisplaySettingsContext.Provider;
export const useOrgDisplaySettings = () => useContext(OrgDisplaySettingsContext);
export const useCurrencyFormatter = () => useContext(OrgDisplaySettingsContext).currencyFormatter;
