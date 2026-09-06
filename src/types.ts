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
  driedOutputQuantity?: number;
  driedOutputUnit?: string;
  yieldPercentage?: number;
  packagedAt?: any;
  statusNotes?: string;
  readyAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface BatchChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  senderUid?: string;
  senderName?: string;
  createdAt?: any;
}
