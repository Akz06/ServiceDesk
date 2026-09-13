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

export const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
