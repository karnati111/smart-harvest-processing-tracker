export type PermissionTier = 'admin' | 'worker';

export type BatchStatus = 'harvested' | 'processing' | 'ready' | 'packaged';

export interface FarmMember {
  uid: string;
  email: string;
  permissionTier: PermissionTier;
  roleLabel: string;
  joinedAt?: any;
}

export interface Farm {
  id: string;
  name: string;
  ownerUid: string;
  locationMetadata?: string;
  createdAt?: any;
}

export interface FarmInvite {
  email: string;
  permissionTier: PermissionTier;
  roleLabel: string;
  createdByUid: string;
  createdAt?: any;
  farmId?: string;
  farmName?: string;
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  unit: string;
  processingType: string;
  createdByUid: string;
  createdAt?: any;
}

export interface IntakeAllocation {
  batchId: string;
  batchStatus?: BatchStatus;
  allocatedQuantity: number;
  allocatedAt?: any;
}

export interface HarvestLog {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  harvestedAt: any;
  notes?: string;
  loggedByUid: string;
  loggedByName?: string;
  loggedByRole: string;
  batchId?: string;
  allocations?: IntakeAllocation[];
  allocatedQuantity?: number;
  remainingQuantity?: number;
}

export interface ProgressReading {
  id: string;
  timestamp: string;
  note: string;
  metric?: string;
  value?: string;
  loggedByUid: string;
  loggedByName: string;
  loggedByRole: string;
}

export interface BatchIntakeAllocation {
  harvestLogId: string;
  quantityUsed: number;
}

export interface ProductionBatch {
  id: string;
  productId: string;
  productName: string;
  processingType: string;
  linkedHarvestLogIds: string[];
  intakeAllocations?: BatchIntakeAllocation[];
  totalQuantity: number;
  unit: string;
  status: BatchStatus;
  conditions: {
    temperature: string;
    humidity: string;
    method: string;
    duration: string;
    targetCriteria: string;
    customNotes?: string;
  };
  schedule: string;
  scheduleModelUsed?: string;
  progressReadings: ProgressReading[];
  gradeAOutputQuantity?: number;
  gradeBOutputQuantity?: number;
  driedOutputQuantity?: number;
  driedOutputUnit?: string;
  yieldPercentage?: number;
  packagedAt?: any;
  statusNotes?: string;
  readyAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export type ProduceGrade = 'Grade A' | 'Grade B';

export interface PackagingRecord {
  id: string;
  productId: string;
  productName: string;
  batchId?: string;
  grade: ProduceGrade;
  packageSizeGrams: number;
  unitsPacked: number;
  totalGrams: number;
  totalKg: number;
  storageLocation?: string;
  batchCode?: string;
  notes?: string;
  packedByUid: string;
  packedByName: string;
  packedByRole: string;
  createdAt: any;
  unitsDispatched?: number;
  unitsRemaining?: number;
}

export type OrderSource =
  | 'Amazon'
  | 'Shopify'
  | 'WhatsApp Direct'
  | 'B2B Distributor'
  | 'Retail Store'
  | 'Website / Online'
  | 'Phone / Direct Call'
  | 'Exhibition / Farmers Market'
  | 'Other';

export type PaymentStatus =
  | 'Prepaid'
  | 'Amount Received'
  | 'Pending / COD'
  | 'Partially Paid';

export interface DispatchItem {
  packagingId?: string;
  productId: string;
  productName: string;
  grade: ProduceGrade;
  packageSizeGrams: number;
  units: number;
  totalGrams: number;
  totalKg: number;
  unitPrice?: number;
  subtotal?: number;
}

export interface DispatchRecord {
  id: string;
  orderNumber: string;
  orderSource: OrderSource;
  orderDate: string;
  dispatchDate: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  destinationCity: string;
  destinationState?: string;
  pincode?: string;
  courierName?: string;
  trackingNumber?: string;
  items: DispatchItem[];
  totalUnits: number;
  totalWeightKg: number;
  totalAmount: number;
  amountReceived: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  paymentReference?: string;
  status: 'Dispatched' | 'In Transit' | 'Delivered' | 'Returned';
  notes?: string;
  dispatchedByUid: string;
  dispatchedByName: string;
  dispatchedByRole: string;
  createdAt: any;
}

export interface BatchChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  senderUid?: string;
  senderName?: string;
  createdAt?: any;
}

export function isQualityInspector(roleLabel?: string, permissionTier?: PermissionTier): boolean {
  const label = (roleLabel || '').toLowerCase();
  return label.includes('quality') || label.includes('inspector') || label.includes('qc');
}

export function isProductionLead(roleLabel?: string, permissionTier?: PermissionTier): boolean {
  const label = (roleLabel || '').toLowerCase();
  return label.includes('production') || label.includes('lead');
}

export function canControlPacking(roleLabel?: string, permissionTier?: PermissionTier): boolean {
  if (permissionTier === 'admin') return true;
  return isQualityInspector(roleLabel, permissionTier);
}
