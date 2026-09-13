import type { DeviceType, Priority, UserRole, WorkItemStatus } from '../types';

export const deviceTypes: DeviceType[] = ['Laptop', 'Desktop', 'Mobile', 'Tablet', 'Console', 'Accessory', 'Other Electronics'];

export const priorities: Priority[] = ['Low', 'Normal', 'High', 'Urgent'];

export const roles: UserRole[] = ['Agent', 'Technician', 'Customer'];

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
