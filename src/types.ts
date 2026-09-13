export type DeviceType = 'Laptop' | 'Desktop' | 'Mobile' | 'Tablet' | 'Console' | 'Accessory' | 'Other Electronics';

export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type UserRole = 'Agent' | 'Technician' | 'Customer';

export type RequestSource = 'Online' | 'Walk-in';

export type WorkItemStatus =
  | 'New Request'
  | 'Assigned'
  | 'Diagnosis'
  | 'Estimate Shared'
  | 'Customer Approved'
  | 'In Repair'
  | 'Waiting for Parts'
  | 'Quality Check'
  | 'Ready for Pickup'
  | 'Delivered'
  | 'Cancelled';

export interface ServiceCategory {
  id: string;
  deviceType: DeviceType;
  title: string;
  description: string;
  commonIssues: string[];
  startingPrice: number;
  averageTurnaround: string;
}

export interface Technician {
  id: string;
  name: string;
  email: string;
  specialties: DeviceType[];
  activeJobs: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface InventoryPart {
  sku: string;
  name: string;
  compatibleWith: DeviceType[];
  quantity: number;
  reorderLevel: number;
  unitCost: number;
}

export interface WorkItemUpdate {
  id: string;
  actor: UserRole | 'System';
  message: string;
  at: string;
}

export interface WorkItem {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  source: RequestSource;
  deviceType: DeviceType;
  deviceModel: string;
  serialNumber: string;
  issueSummary: string;
  priority: Priority;
  status: WorkItemStatus;
  assignedTechnicianId: string;
  analysis: string;
  requiredChanges: string;
  estimatedPrice: number;
  approvedByCustomer: boolean;
  partsRequired: string[];
  createdAt: string;
  updatedAt: string;
  promisedBy: string;
  updates: WorkItemUpdate[];
}

export interface WorkItemDraft {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  source: RequestSource;
  deviceType: DeviceType;
  deviceModel: string;
  serialNumber: string;
  issueSummary: string;
  priority: Priority;
  assignedTechnicianId: string;
}

export interface ServiceDeskState {
  customers: Customer[];
  workItems: WorkItem[];
  inventoryParts: InventoryPart[];
}

export interface LoginSession {
  sessionId: string;
  role: UserRole | null;
}
