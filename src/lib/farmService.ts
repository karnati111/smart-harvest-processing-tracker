import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  collectionGroup,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  Farm,
  FarmMember,
  FarmInvite,
  ProductCatalogItem,
  HarvestLog,
  ProductionBatch,
  BatchChatMessage,
  ProgressReading,
  PermissionTier,
} from '../types';

// Structured Firestore Error Handling per Firebase Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Local cache helper
function getCachedFarmIds(userUid: string): string[] {
  try {
    const raw = localStorage.getItem(`user_farms_${userUid}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addCachedFarmId(userUid: string, farmId: string): void {
  try {
    const current = getCachedFarmIds(userUid);
    if (!current.includes(farmId)) {
      localStorage.setItem(`user_farms_${userUid}`, JSON.stringify([...current, farmId]));
    }
  } catch {
    // Non-blocking
  }
}

// Utility to normalize farm name for reservation
export function normalizeFarmName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Check if farm name is already reserved
export async function isFarmNameTaken(name: string): Promise<boolean> {
  const normalized = normalizeFarmName(name);
  if (!normalized) return false;
  try {
    const docRef = doc(db, 'farmNames', normalized);
    const snap = await getDoc(docRef);
    return snap.exists();
  } catch (err) {
    console.warn('Error checking farm name reservation:', err);
    return false;
  }
}

// Create a new farm and reserve name
export async function createFarm(
  farmName: string,
  userUid: string,
  userEmail: string
): Promise<{ farmId: string; farmName: string }> {
  const trimmedName = farmName.trim();
  const normalized = normalizeFarmName(trimmedName);

  if (!trimmedName || !normalized) {
    throw new Error('Please enter a valid organization name.');
  }

  // 1. Check reservation
  const reservationRef = doc(db, 'farmNames', normalized);
  try {
    const reservationSnap = await getDoc(reservationRef);
    if (reservationSnap.exists()) {
      throw new Error('A farm with this name already exists');
    }
  } catch (err: any) {
    if (err.message === 'A farm with this name already exists') throw err;
    console.warn('Could not verify reservation, proceeding with creation:', err);
  }

  // 2. Reserve name
  try {
    await setDoc(reservationRef, {
      originalName: trimmedName,
      normalizedName: normalized,
      reservedByUid: userUid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Reservation doc write warning:', err);
  }

  // 3. Create farm document
  const farmsCol = collection(db, 'farms');
  const farmDocRef = doc(farmsCol);
  const farmId = farmDocRef.id;

  try {
    await setDoc(farmDocRef, {
      name: trimmedName,
      normalizedName: normalized,
      ownerUid: userUid,
      createdAt: serverTimestamp(),
    });

    // 4. Create initial Admin member record under farm
    const memberRef = doc(db, 'farms', farmId, 'members', userUid);
    await setDoc(memberRef, {
      uid: userUid,
      email: userEmail,
      permissionTier: 'admin',
      roleLabel: 'Admin',
      joinedAt: serverTimestamp(),
    });

    // 5. Create user-scoped index record for fast, direct lookups
    try {
      await setDoc(doc(db, 'users', userUid, 'farms', farmId), {
        farmId,
        farmName: trimmedName,
        permissionTier: 'admin',
        roleLabel: 'Admin',
        joinedAt: serverTimestamp(),
      });
    } catch (indexErr) {
      console.warn('User-scoped farm index non-fatal warning:', indexErr);
    }

    addCachedFarmId(userUid, farmId);

    // 6. Seed sample products
    const sampleProducts = [
      { name: 'Moringa Leaves', unit: 'kg', processingType: 'drying' },
      { name: 'Mango Pickle Mix', unit: 'kg', processingType: 'fermenting' },
      { name: 'Turmeric Powder', unit: 'kg', processingType: 'grinding' },
      { name: 'Papad Dough', unit: 'kg', processingType: 'drying' },
    ];

    for (const prod of sampleProducts) {
      try {
        await addDoc(collection(db, 'farms', farmId, 'products'), {
          name: prod.name,
          unit: prod.unit,
          processingType: prod.processingType,
          createdByUid: userUid,
          createdAt: serverTimestamp(),
        });
      } catch (prodErr) {
        console.warn('Seed product non-fatal warning:', prodErr);
      }
    }

    return { farmId, farmName: trimmedName };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `farms/${farmId}`);
  }
}

// Find all farms where user is a member (Resilient Multi-Strategy)
export async function getUserFarms(
  userUid: string
): Promise<Array<{ farm: Farm; member: FarmMember }>> {
  const farmMap = new Map<string, { farm: Farm; member: FarmMember }>();

  // Strategy 1: User-scoped membership index (Immediate, direct, zero permission issues)
  try {
    const userFarmsCol = collection(db, 'users', userUid, 'farms');
    const userFarmsSnap = await getDocs(userFarmsCol);
    for (const docSnap of userFarmsSnap.docs) {
      const data = docSnap.data();
      const farmId = docSnap.id || data.farmId;
      try {
        const farmDocSnap = await getDoc(doc(db, 'farms', farmId));
        if (farmDocSnap.exists()) {
          farmMap.set(farmId, {
            farm: { id: farmDocSnap.id, ...(farmDocSnap.data() as any) } as Farm,
            member: {
              uid: userUid,
              email: auth.currentUser?.email || '',
              permissionTier: data.permissionTier || 'admin',
              roleLabel: data.roleLabel || 'Admin',
              joinedAt: data.joinedAt,
            },
          });
          addCachedFarmId(userUid, farmId);
        }
      } catch (fErr) {
        console.warn(`Could not load farm doc for user index ${farmId}:`, fErr);
      }
    }
  } catch (err) {
    console.warn('Strategy 1 (User index) lookup info:', err);
  }

  // Strategy 2: Collection group query across all facilities where user is member
  try {
    const memberGroupQuery = query(
      collectionGroup(db, 'members'),
      where('uid', '==', userUid)
    );
    const snap = await getDocs(memberGroupQuery);
    for (const memberDoc of snap.docs) {
      const memberData = memberDoc.data() as FarmMember;
      const farmDocRef = memberDoc.ref.parent.parent;
      if (farmDocRef && !farmMap.has(farmDocRef.id)) {
        try {
          const farmSnap = await getDoc(farmDocRef);
          if (farmSnap.exists()) {
            farmMap.set(farmSnap.id, {
              farm: { id: farmSnap.id, ...(farmSnap.data() as any) } as Farm,
              member: { ...memberData, uid: memberDoc.id },
            });
            addCachedFarmId(userUid, farmSnap.id);

            // Backfill user index asynchronously
            setDoc(
              doc(db, 'users', userUid, 'farms', farmSnap.id),
              {
                farmId: farmSnap.id,
                farmName: farmSnap.data().name || 'Facility',
                permissionTier: memberData.permissionTier,
                roleLabel: memberData.roleLabel,
                joinedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => {});
          }
        } catch (subErr) {
          console.warn('Could not read farm doc in collectionGroup result:', subErr);
        }
      }
    }
  } catch (err) {
    console.warn('Strategy 2 (Collection group) lookup info:', err);
  }

  // Strategy 3: Local cache fallback
  const cachedIds = getCachedFarmIds(userUid);
  for (const cId of cachedIds) {
    if (!farmMap.has(cId)) {
      try {
        const farmSnap = await getDoc(doc(db, 'farms', cId));
        const memberSnap = await getDoc(doc(db, 'farms', cId, 'members', userUid));
        if (farmSnap.exists()) {
          const mData = memberSnap.exists()
            ? (memberSnap.data() as FarmMember)
            : {
                uid: userUid,
                email: auth.currentUser?.email || '',
                permissionTier: 'worker' as PermissionTier,
                roleLabel: 'Member',
              };
          farmMap.set(cId, {
            farm: { id: farmSnap.id, ...(farmSnap.data() as any) } as Farm,
            member: { ...mData, uid: userUid },
          });
        }
      } catch (err) {
        console.warn(`Could not resolve cached farm ID ${cId}:`, err);
      }
    }
  }

  return Array.from(farmMap.values());
}

// Find pending invites addressed to user's email
export async function getPendingInvitesForEmail(email: string): Promise<FarmInvite[]> {
  try {
    if (!email) return [];
    const normalizedEmail = email.trim().toLowerCase();

    // Query invites collection group with specific email
    const invitesQuery = query(
      collectionGroup(db, 'invites'),
      where('email', '==', normalizedEmail)
    );
    const snap = await getDocs(invitesQuery);
    const matched: FarmInvite[] = [];

    for (const inviteDoc of snap.docs) {
      const data = inviteDoc.data() as FarmInvite;
      const farmDocRef = inviteDoc.ref.parent.parent;
      let farmName = 'Facility';
      let farmId = '';

      if (farmDocRef) {
        farmId = farmDocRef.id;
        try {
          const farmSnap = await getDoc(farmDocRef);
          if (farmSnap.exists()) {
            farmName = farmSnap.data().name || 'Facility';
          }
        } catch {
          // Non-blocking
        }
      }

      matched.push({
        ...data,
        email: inviteDoc.id,
        farmId,
        farmName,
      });
    }
    return matched;
  } catch (err) {
    console.warn('Error querying collection group for invites:', err);
    return [];
  }
}

// Accept an invitation
export async function acceptInvite(
  farmId: string,
  userUid: string,
  userEmail: string
): Promise<FarmMember> {
  const normalizedEmail = userEmail.trim().toLowerCase();
  const inviteRef = doc(db, 'farms', farmId, 'invites', normalizedEmail);

  let inviteData: FarmInvite;
  try {
    const inviteSnap = await getDoc(inviteRef);
    if (!inviteSnap.exists()) {
      throw new Error('Invitation record not found or already accepted.');
    }
    inviteData = inviteSnap.data() as FarmInvite;
  } catch (err: any) {
    if (err.message.includes('not found')) throw err;
    handleFirestoreError(err, OperationType.GET, `farms/${farmId}/invites/${normalizedEmail}`);
  }

  // Create member record copying tier & label strictly from the invite
  const memberRef = doc(db, 'farms', farmId, 'members', userUid);
  try {
    await setDoc(memberRef, {
      uid: userUid,
      email: userEmail,
      permissionTier: inviteData.permissionTier,
      roleLabel: inviteData.roleLabel,
      joinedAt: serverTimestamp(),
    });

    // Also update user-scoped index
    try {
      await setDoc(doc(db, 'users', userUid, 'farms', farmId), {
        farmId,
        farmName: inviteData.farmName || 'Facility',
        permissionTier: inviteData.permissionTier,
        roleLabel: inviteData.roleLabel,
        joinedAt: serverTimestamp(),
      });
    } catch {
      // Non-fatal
    }

    addCachedFarmId(userUid, farmId);

    // Remove invite doc
    try {
      await deleteDoc(inviteRef);
    } catch (delErr) {
      console.warn('Could not remove invite doc:', delErr);
    }

    return {
      uid: userUid,
      email: userEmail,
      permissionTier: inviteData.permissionTier,
      roleLabel: inviteData.roleLabel,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `farms/${farmId}/members/${userUid}`);
  }
}

// Create an invite (Admin only)
export async function createInvite(
  farmId: string,
  inviteeEmail: string,
  roleLabel: string,
  permissionTier: PermissionTier,
  adminUid: string
): Promise<void> {
  const normalizedEmail = inviteeEmail.trim().toLowerCase();
  if (!normalizedEmail) throw new Error('Valid email address required.');

  const inviteRef = doc(db, 'farms', farmId, 'invites', normalizedEmail);
  try {
    await setDoc(inviteRef, {
      email: normalizedEmail,
      roleLabel: roleLabel.trim() || 'Team Member',
      permissionTier,
      createdByUid: adminUid,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `farms/${farmId}/invites/${normalizedEmail}`);
  }
}

// Fetch team members for a farm
export async function getFarmMembers(farmId: string): Promise<FarmMember[]> {
  try {
    const membersSnap = await getDocs(collection(db, 'farms', farmId, 'members'));
    return membersSnap.docs.map((doc) => ({
      uid: doc.id,
      ...(doc.data() as any),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/members`);
  }
}

// Fetch pending invites for a farm (Admin view)
export async function getFarmInvites(farmId: string): Promise<FarmInvite[]> {
  try {
    const invitesSnap = await getDocs(collection(db, 'farms', farmId, 'invites'));
    return invitesSnap.docs.map((doc) => ({
      email: doc.id,
      ...(doc.data() as any),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/invites`);
  }
}

// Products Catalog
export async function getProducts(farmId: string): Promise<ProductCatalogItem[]> {
  try {
    const q = query(collection(db, 'farms', farmId, 'products'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/products`);
  }
}

export async function addProduct(
  farmId: string,
  name: string,
  unit: string,
  processingType: string,
  userUid: string
): Promise<ProductCatalogItem> {
  try {
    const colRef = collection(db, 'farms', farmId, 'products');
    const docRef = await addDoc(colRef, {
      name: name.trim(),
      unit: unit.trim(),
      processingType: processingType.trim(),
      createdByUid: userUid,
      createdAt: serverTimestamp(),
    });
    return {
      id: docRef.id,
      name: name.trim(),
      unit: unit.trim(),
      processingType: processingType.trim(),
      createdByUid: userUid,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/products`);
  }
}

// Raw Material Intake Logs
export async function getHarvestLogs(farmId: string): Promise<HarvestLog[]> {
  try {
    const q = query(collection(db, 'farms', farmId, 'harvestLogs'), orderBy('harvestedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/harvestLogs`);
  }
}

export async function addHarvestLog(
  farmId: string,
  data: {
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    notes?: string;
    loggedByUid: string;
    loggedByName: string;
    loggedByRole: string;
  }
): Promise<string> {
  try {
    const colRef = collection(db, 'farms', farmId, 'harvestLogs');
    const docRef = await addDoc(colRef, {
      ...data,
      harvestedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/harvestLogs`);
  }
}

// Production Batches
export async function getBatches(farmId: string): Promise<ProductionBatch[]> {
  try {
    const q = query(collection(db, 'farms', farmId, 'batches'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((doc) => ({
      id: doc.id,
      progressReadings: [],
      ...(doc.data() as any),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/batches`);
  }
}

export async function createBatch(
  farmId: string,
  batchData: {
    productId: string;
    productName: string;
    processingType: string;
    linkedHarvestLogIds: string[];
    intakeAllocations?: { harvestLogId: string; quantityUsed: number }[];
    totalQuantity: number;
    unit: string;
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
  }
): Promise<string> {
  // Enforce domain rule: A batch cannot be started without linking at least one raw material intake record
  if (!batchData.linkedHarvestLogIds || batchData.linkedHarvestLogIds.length === 0) {
    throw new Error(
      'Raw material intake required: You cannot start a production batch without linking at least one raw material intake record.'
    );
  }

  if (!batchData.totalQuantity || batchData.totalQuantity <= 0) {
    throw new Error(
      'Invalid batch quantity: Batch yield must be greater than zero, derived from raw material intake deliveries.'
    );
  }

  try {
    const colRef = collection(db, 'farms', farmId, 'batches');
    const docRef = await addDoc(colRef, {
      ...batchData,
      status: 'processing',
      progressReadings: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Update linked harvest logs with batchId and partial allocation accounting for audit traceability
    for (const logId of batchData.linkedHarvestLogIds) {
      try {
        const logRef = doc(db, 'farms', farmId, 'harvestLogs', logId);
        const logSnap = await getDoc(logRef);

        const allocationForThisLog =
          batchData.intakeAllocations?.find((a) => a.harvestLogId === logId)?.quantityUsed ??
          (batchData.linkedHarvestLogIds.length === 1 ? batchData.totalQuantity : 0);

        if (logSnap.exists()) {
          const logData = logSnap.data();
          const totalLogQty = Number(logData.quantity) || 0;
          const prevAllocated = Number(logData.allocatedQuantity) || 0;
          const actualQtyToDeduct = allocationForThisLog > 0 ? allocationForThisLog : (totalLogQty - prevAllocated);
          const newAllocated = Math.min(totalLogQty, prevAllocated + actualQtyToDeduct);
          const newRemaining = Math.max(0, totalLogQty - newAllocated);

          const existingAllocations = Array.isArray(logData.allocations) ? logData.allocations : [];
          const newAllocationEntry = {
            batchId: docRef.id,
            allocatedQuantity: actualQtyToDeduct,
            allocatedAt: new Date().toISOString(),
          };

          await updateDoc(logRef, {
            batchId: docRef.id,
            allocatedQuantity: newAllocated,
            remainingQuantity: newRemaining,
            allocations: [...existingAllocations, newAllocationEntry],
          });
        } else {
          await updateDoc(logRef, {
            batchId: docRef.id,
          });
        }
      } catch (logUpdateErr) {
        console.warn(`Non-blocking: could not mark harvestLog ${logId} with batch allocation:`, logUpdateErr);
      }
    }

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/batches`);
  }
}

export async function addProgressReading(
  farmId: string,
  batchId: string,
  currentReadings: ProgressReading[],
  reading: {
    note: string;
    metric?: string;
    value?: string;
    loggedByUid: string;
    loggedByName: string;
    loggedByRole: string;
  }
): Promise<void> {
  try {
    const batchRef = doc(db, 'farms', farmId, 'batches', batchId);
    const newReading: ProgressReading = {
      id: 'read_' + Date.now(),
      timestamp: new Date().toISOString(),
      ...reading,
    };

    await updateDoc(batchRef, {
      progressReadings: [...currentReadings, newReading],
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/batches/${batchId}`);
  }
}

// Update batch status (Workers can not set to ready or packaged)
export async function updateBatchStatus(
  farmId: string,
  batchId: string,
  newStatus: ProductionBatch['status']
): Promise<void> {
  try {
    const batchRef = doc(db, 'farms', farmId, 'batches', batchId);
    const updateData: any = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };
    if (newStatus === 'ready') {
      updateData.readyAt = serverTimestamp();
    }
    await updateDoc(batchRef, updateData);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/batches/${batchId}`);
  }
}

// Batch "Ask AI" Messages
export async function getBatchMessages(
  farmId: string,
  batchId: string
): Promise<BatchChatMessage[]> {
  try {
    const q = query(
      collection(db, 'farms', farmId, 'batches', batchId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/batches/${batchId}/messages`);
  }
}

export async function addBatchMessage(
  farmId: string,
  batchId: string,
  message: {
    role: 'user' | 'model';
    content: string;
    senderUid?: string;
    senderName?: string;
  }
): Promise<string> {
  try {
    const colRef = collection(db, 'farms', farmId, 'batches', batchId, 'messages');
    const docRef = await addDoc(colRef, {
      ...message,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/batches/${batchId}/messages`);
  }
}
