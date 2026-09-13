export type DeviceType = 'Laptop' | 'Desktop' | 'Mobile' | 'Tablet' | 'Console' | 'Accessory' | 'Other Electronics';

export type Priority = 'Low' | 'Normal' | 'High' | 'Urgent';

export type UserRole = 'Admin' | 'Agent' | 'Technician' | 'Customer';

export type AuthProfile = 'admin' | 'agent' | 'technician' | 'customer';

export type ModuleId = 'admin' | 'agent' | 'technician' | 'customer';

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

export type InvoiceStatus = 'Draft' | 'Issued' | 'Paid' | 'Void';

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

export interface Invoice {
  id: string;
  workItemId: string;
  customerId: string;
  customerName: string;
  amount: number;
  status: InvoiceStatus;
  issuedAt: string;
  paidAt: string;
  notes: string;
}

export interface InvoiceDraft {
  workItemId: string;
  amount: number;
  notes: string;
}

export interface ServiceDeskState {
  customers: Customer[];
  workItems: WorkItem[];
  inventoryParts: InventoryPart[];
  invoices: Invoice[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  profile: AuthProfile;
  moduleAccess: ModuleId[];
}

export interface ManagedUser extends AuthUser {
  active: boolean;
  createdAt: string;
}

export interface UserDraft {
  name: string;
  email: string;
  profile: AuthProfile;
  password: string;
  active: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface LoginSession {
  sessionId: string;
  user: AuthUser | null;
}
