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

export type PaymentMethod = 'Cash' | 'Card (Test Mode)' | 'Bank Transfer' | 'UPI (Test Mode)';

export type NotificationChannel = 'sms' | 'whatsapp' | 'email';

export type ReportEntity = 'workItems' | 'invoices' | 'customers' | 'inventory';

export interface ServiceCategory {
  id: string;
  deviceType: DeviceType;
  title: string;
  description: string;
  commonIssues: string[];
  startingPrice: number;
  averageTurnaround: string;
}

export interface AuditFields {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Technician extends AuditFields {
  id: string;
  name: string;
  email: string;
  specialties: DeviceType[];
  activeJobs: number;
}

export interface Customer extends AuditFields {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface InventoryPart extends AuditFields {
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
  laborEstimate: number;
  partsEstimate: number;
  diagnosticFee: number;
  approvedByCustomer: boolean;
  partsRequired: string[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
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

export interface Invoice extends AuditFields {
  id: string;
  workItemId: string;
  customerId: string;
  customerName: string;
  amount: number;
  laborAmount: number;
  partsAmount: number;
  diagnosticFee: number;
  status: InvoiceStatus;
  issuedAt: string;
  paidAt: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
}

export interface InvoiceDraft {
  workItemId: string;
  amount: number;
  laborAmount: number;
  partsAmount: number;
  diagnosticFee: number;
  notes: string;
}

export interface InvoicePaymentDraft {
  method: PaymentMethod;
  reference: string;
}

export interface Notification {
  id: string;
  workItemId: string | null;
  customerId: string;
  channel: NotificationChannel;
  recipient: string;
  message: string;
  status: 'sent' | 'failed';
  provider: string;
  createdAt: string;
  read: boolean;
}

export interface SavedReport {
  id: string;
  createdBy: string;
  name: string;
  entity: ReportEntity;
  columns: string[];
  filterField: string;
  filterValue: string;
  createdAt: string;
}

export interface SavedReportDraft {
  name: string;
  entity: ReportEntity;
  columns: string[];
  filterField: string;
  filterValue: string;
}

export interface ServiceDeskState {
  customers: Customer[];
  technicians: Technician[];
  workItems: WorkItem[];
  inventoryParts: InventoryPart[];
  invoices: Invoice[];
  notifications: Notification[];
  savedReports: SavedReport[];
}

export interface TechnicianDraft {
  name: string;
  email: string;
  specialties: DeviceType[];
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
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
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
