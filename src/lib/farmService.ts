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
import { cleanUnit } from './unitUtils';
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
  PackagingRecord,
  DispatchRecord,
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

/**
 * Strict Undefined-Stripping (Zero-Crash Payload Hygiene per Production Directive 6)
 * Recursively strips any keys with `undefined` values from payloads before writing to Firestore.
 */
export function sanitizeFirestorePayload<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    // Preserve Firestore FieldValues (serverTimestamp, deleteField, etc.) or Dates or Timestamps
    if (obj.constructor && obj.constructor.name !== 'Object') {
      return obj;
    }
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = sanitizeFirestorePayload(value);
      }
    }
    return clean as T;
  }
  return obj;
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

  // Preview / Development Mode Auto-Seed Fallback
  if (farmMap.size === 0 && (userUid.startsWith('preview-') || userUid.startsWith('dev-'))) {
    const previewFarmId = 'preview-facility-01';
    const previewFarm: Farm = {
      id: previewFarmId,
      name: 'Green Valley Natural Processors',
      ownerUid: userUid,
      locationMetadata: 'Central Processing Hub, Zone 4',
      createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    };
    const previewMember: FarmMember = {
      uid: userUid,
      email: 'bharathpypro@gmail.com',
      permissionTier: 'admin',
      roleLabel: 'Facility Director',
      joinedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
    };
    farmMap.set(previewFarmId, {
      farm: previewFarm,
      member: previewMember,
    });
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

export interface SendInviteResult {
  success: boolean;
  emailSent: boolean;
  transportInfo?: string;
  joinUrl: string;
  gmailWebUrl: string;
  mailtoUrl: string;
  inviteeEmail: string;
  roleLabel: string;
  permissionTier: PermissionTier;
  emailSubject?: string;
  plainTextBody?: string;
}

// Send Email & Gmail Invitation (Server-Side Role Checked)
export async function sendTeamInvite(params: {
  farmId: string;
  adminUid: string;
  inviteeEmail: string;
  roleLabel: string;
  permissionTier: PermissionTier;
  farmName?: string;
}): Promise<SendInviteResult> {
  const normalizedEmail = params.inviteeEmail.trim().toLowerCase();
  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/api/invites/send-email', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      farmId: params.farmId,
      adminUid: params.adminUid,
      inviteeEmail: normalizedEmail,
      roleLabel: params.roleLabel,
      permissionTier: params.permissionTier,
      farmName: params.farmName,
      appUrl: window.location.origin,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || `Failed to issue invitation: HTTP ${res.status}`);
  }

  return await res.json();
}

// Server-Side Role-Gated Admin Dashboard API Types & Client
export interface AdminDashboardData {
  authorized: boolean;
  farmId: string;
  aggregates: {
    totalBatches: number;
    readyBatchesCount: number;
    totalReadyQuantity: number;
    processingBatchesCount: number;
    totalProcessingQuantity: number;
    packagedBatchesCount: number;
    totalPackagedQuantity: number;
    harvestedBatchesCount: number;
    readyByProduct: Array<{
      productName: string;
      quantity: number;
      unit: string;
      batchCount: number;
    }>;
  };
  batches: ProductionBatch[];
  members: FarmMember[];
}

// Fetch Admin Dashboard data with server-side role gate
export async function getAdminDashboardData(farmId: string, userUid: string): Promise<AdminDashboardData> {
  if (farmId.startsWith('preview-')) {
    const batches = await getBatches(farmId);
    const members = await getFarmMembers(farmId);
    const readyBatches = batches.filter((b) => b.status === 'ready');
    const processingBatches = batches.filter((b) => b.status === 'processing');
    const packagedBatches = batches.filter((b) => b.status === 'packaged');
    const harvestedBatches = batches.filter((b) => b.status === 'harvested');

    const totalReadyQuantity = readyBatches.reduce(
      (sum, b) =>
        sum + (b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity) || 0),
      0
    );
    const totalProcessingQuantity = processingBatches.reduce((sum, b) => sum + (Number(b.totalQuantity) || 0), 0);
    const totalPackagedQuantity = packagedBatches.reduce(
      (sum, b) =>
        sum + (b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity) || 0),
      0
    );

    const readyByProductMap: Record<string, any> = {};
    for (const b of readyBatches) {
      const pName = b.productName || 'Unassigned';
      if (!readyByProductMap[pName]) {
        readyByProductMap[pName] = {
          productName: pName,
          quantity: 0,
          unit: b.driedOutputUnit || b.unit || 'kg',
          batchCount: 0,
        };
      }
      readyByProductMap[pName].quantity +=
        (b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity)) || 0;
      readyByProductMap[pName].batchCount += 1;
    }

    return {
      authorized: true,
      farmId,
      aggregates: {
        totalBatches: batches.length,
        readyBatchesCount: readyBatches.length,
        totalReadyQuantity,
        processingBatchesCount: processingBatches.length,
        totalProcessingQuantity,
        packagedBatchesCount: packagedBatches.length,
        totalPackagedQuantity,
        harvestedBatchesCount: harvestedBatches.length,
        readyByProduct: Object.values(readyByProductMap),
      },
      batches,
      members,
    };
  }

  const token = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`/api/farms/${farmId}/admin-dashboard?uid=${encodeURIComponent(userUid)}`, {
    headers,
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || `Failed to fetch admin dashboard: HTTP ${res.status}`);
  }
  return await res.json();
}

// Fetch team members for a farm
export async function getFarmMembers(farmId: string): Promise<FarmMember[]> {
  if (farmId.startsWith('preview-')) {
    return [
      {
        uid: 'preview-admin-bharath',
        email: 'bharathpypro@gmail.com',
        permissionTier: 'admin',
        roleLabel: 'Facility Director',
      },
      {
        uid: 'preview-worker-anita',
        email: 'anita.worker@example.com',
        permissionTier: 'worker',
        roleLabel: 'Dehydration Specialist',
      },
    ];
  }

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
  if (farmId.startsWith('preview-')) {
    const local = localStorage.getItem(`preview_invites_${farmId}`);
    return local ? JSON.parse(local) : [];
  }

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
  if (farmId.startsWith('preview-')) {
    const local = localStorage.getItem(`preview_products_${farmId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    const defaultProducts: ProductCatalogItem[] = [
      {
        id: 'prod-moringa-1',
        name: 'Moringa Leaves',
        unit: 'kg',
        processingType: 'drying',
        createdByUid: 'preview-admin-bharath',
      },
      {
        id: 'prod-turmeric-2',
        name: 'Turmeric Powder',
        unit: 'kg',
        processingType: 'grinding',
        createdByUid: 'preview-admin-bharath',
      },
      {
        id: 'prod-pickle-3',
        name: 'Mango Pickle Mix',
        unit: 'kg',
        processingType: 'fermenting',
        createdByUid: 'preview-admin-bharath',
      },
      {
        id: 'prod-papad-4',
        name: 'Papad Dough',
        unit: 'pieces',
        processingType: 'drying',
        createdByUid: 'preview-admin-bharath',
      },
    ];
    localStorage.setItem(`preview_products_${farmId}`, JSON.stringify(defaultProducts));
    return defaultProducts;
  }

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
  const sanitizedUnit = cleanUnit(unit);

  if (farmId.startsWith('preview-')) {
    const products = await getProducts(farmId);
    const newProd: ProductCatalogItem = {
      id: `prod-local-${Date.now()}`,
      name: name.trim(),
      unit: sanitizedUnit,
      processingType: processingType.trim(),
      createdByUid: userUid,
    };
    products.unshift(newProd);
    localStorage.setItem(`preview_products_${farmId}`, JSON.stringify(products));
    return newProd;
  }

  try {
    const colRef = collection(db, 'farms', farmId, 'products');
    const docRef = await addDoc(colRef, {
      name: name.trim(),
      unit: sanitizedUnit,
      processingType: processingType.trim(),
      createdByUid: userUid,
      createdAt: serverTimestamp(),
    });
    return {
      id: docRef.id,
      name: name.trim(),
      unit: sanitizedUnit,
      processingType: processingType.trim(),
      createdByUid: userUid,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/products`);
  }
}

export async function updateProduct(
  farmId: string,
  productId: string,
  data: {
    name?: string;
    unit?: string;
    processingType?: string;
  }
): Promise<ProductCatalogItem> {
  if (farmId.startsWith('preview-')) {
    const products = await getProducts(farmId);
    const idx = products.findIndex((p) => p.id === productId);
    if (idx !== -1) {
      if (data.name !== undefined) products[idx].name = data.name.trim();
      if (data.unit !== undefined) products[idx].unit = cleanUnit(data.unit);
      if (data.processingType !== undefined) products[idx].processingType = data.processingType.trim();
      localStorage.setItem(`preview_products_${farmId}`, JSON.stringify(products));
      return products[idx];
    }
  }
  try {
    const docRef = doc(db, 'farms', farmId, 'products', productId);
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};
    const updatePayload: any = {};
    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.unit !== undefined) updatePayload.unit = cleanUnit(data.unit);
    if (data.processingType !== undefined) updatePayload.processingType = data.processingType.trim();
    await updateDoc(docRef, updatePayload);
    return {
      id: productId,
      name: updatePayload.name ?? existingData.name ?? '',
      unit: updatePayload.unit ?? existingData.unit ?? 'kg',
      processingType: updatePayload.processingType ?? existingData.processingType ?? '',
      createdByUid: existingData.createdByUid,
      createdAt: existingData.createdAt,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/products/${productId}`);
  }
}

// Raw Material Intake Logs (Strictly filtered by userUid for Workers)
export async function getHarvestLogs(
  farmId: string,
  userUid?: string,
  permissionTier?: PermissionTier
): Promise<HarvestLog[]> {
  if (farmId.startsWith('preview-')) {
    const local = localStorage.getItem(`preview_logs_${farmId}`);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (permissionTier === 'worker' && userUid) {
          return parsed.filter((l: HarvestLog) => l.loggedByUid === userUid);
        }
        return parsed;
      } catch {}
    }
    const defaultLogs: HarvestLog[] = [
      {
        id: 'log-moringa-1',
        productId: 'prod-moringa-1',
        productName: 'Moringa Leaves',
        quantity: 50,
        unit: 'kg',
        notes: 'High quality morning harvest from Zone A shade houses.',
        harvestedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        loggedByUid: 'preview-admin-bharath',
        loggedByName: 'Bharath (Preview Mode)',
        loggedByRole: 'Facility Director',
      },
      {
        id: 'log-turmeric-1',
        productId: 'prod-turmeric-2',
        productName: 'Turmeric Powder',
        quantity: 25,
        unit: 'kg',
        notes: 'Washed raw organic turmeric roots ready for initial cure.',
        harvestedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        loggedByUid: 'preview-admin-bharath',
        loggedByName: 'Bharath (Preview Mode)',
        loggedByRole: 'Facility Director',
      },
    ];
    localStorage.setItem(`preview_logs_${farmId}`, JSON.stringify(defaultLogs));
    if (permissionTier === 'worker' && userUid) {
      return defaultLogs.filter((l) => l.loggedByUid === userUid);
    }
    return defaultLogs;
  }

  try {
    let q;
    if (permissionTier === 'worker' && userUid) {
      q = query(
        collection(db, 'farms', farmId, 'harvestLogs'),
        where('loggedByUid', '==', userUid)
      );
    } else {
      q = query(collection(db, 'farms', farmId, 'harvestLogs'), orderBy('harvestedAt', 'desc'));
    }
    const snap = await getDocs(q);
    const logs = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    })) as HarvestLog[];

    // Sort client-side by harvestedAt desc to avoid composite index requirements
    return logs.sort((a, b) => {
      const timeA = a.harvestedAt?.seconds ? a.harvestedAt.seconds * 1000 : new Date(a.harvestedAt || 0).getTime();
      const timeB = b.harvestedAt?.seconds ? b.harvestedAt.seconds * 1000 : new Date(b.harvestedAt || 0).getTime();
      return timeB - timeA;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/harvestLogs`);
    return [];
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
  const cleanU = cleanUnit(data.unit);

  if (farmId.startsWith('preview-')) {
    const logs = await getHarvestLogs(farmId);
    const newLogId = `log-local-${Date.now()}`;
    const newLog: HarvestLog = {
      id: newLogId,
      ...data,
      unit: cleanU,
      harvestedAt: new Date().toISOString(),
    };
    logs.unshift(newLog);
    localStorage.setItem(`preview_logs_${farmId}`, JSON.stringify(logs));
    return newLogId;
  }

  try {
    const colRef = collection(db, 'farms', farmId, 'harvestLogs');
    const docRef = await addDoc(
      colRef,
      sanitizeFirestorePayload({
        ...data,
        unit: cleanU,
        harvestedAt: serverTimestamp(),
      })
    );
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/harvestLogs`);
  }
}

export async function updateHarvestLog(
  farmId: string,
  logId: string,
  data: {
    quantity?: number;
    unit?: string;
    notes?: string;
  }
): Promise<HarvestLog> {
  if (farmId.startsWith('preview-')) {
    const logs = await getHarvestLogs(farmId);
    const idx = logs.findIndex((l) => l.id === logId);
    if (idx !== -1) {
      if (data.quantity !== undefined) logs[idx].quantity = Number(data.quantity);
      if (data.unit !== undefined) logs[idx].unit = cleanUnit(data.unit);
      if (data.notes !== undefined) logs[idx].notes = data.notes.trim();
      localStorage.setItem(`preview_logs_${farmId}`, JSON.stringify(logs));
      return logs[idx];
    }
  }

  try {
    const docRef = doc(db, 'farms', farmId, 'harvestLogs', logId);
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};
    const updatePayload: any = {};
    if (data.quantity !== undefined) updatePayload.quantity = Number(data.quantity);
    if (data.unit !== undefined) updatePayload.unit = cleanUnit(data.unit);
    if (data.notes !== undefined) updatePayload.notes = data.notes.trim();
    await updateDoc(docRef, sanitizeFirestorePayload(updatePayload));
    return {
      id: logId,
      productId: existingData.productId || '',
      productName: existingData.productName || '',
      quantity: updatePayload.quantity ?? existingData.quantity ?? 0,
      unit: updatePayload.unit ?? existingData.unit ?? 'kg',
      notes: updatePayload.notes ?? existingData.notes,
      loggedByUid: existingData.loggedByUid || '',
      loggedByName: existingData.loggedByName || '',
      loggedByRole: existingData.loggedByRole || '',
      harvestedAt: existingData.harvestedAt,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/harvestLogs/${logId}`);
  }
}

// Production Batches
export async function getBatches(farmId: string): Promise<ProductionBatch[]> {
  if (farmId.startsWith('preview-')) {
    const local = localStorage.getItem(`preview_batches_${farmId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    const defaultBatches: ProductionBatch[] = [
      {
        id: 'batch-moringa-01',
        productId: 'prod-moringa-1',
        productName: 'Moringa Leaves',
        processingType: 'drying',
        unit: 'kg',
        totalQuantity: 50,
        linkedHarvestLogIds: ['log-moringa-1'],
        status: 'processing',
        conditions: {
          temperature: '35°C - 45°C',
          humidity: '25% - 40%',
          method: 'Solar Dehydration',
          duration: '8-10 Hours',
          targetCriteria: 'Crisp green leaves with <7% residual moisture',
          customNotes: 'Batch initiated with natural solar ventilation.',
        },
        schedule: `### Recommended Processing Protocol: Moringa Leaves Dehydration

**Target Output**: Premium Green Moringa Leaf Flakes (<7% moisture)
**Total Estimated Processing Time**: 9 Hours

#### Step 1: Sanitation & Inspection (1 Hour)
- Inspect incoming raw harvest for yellowed or bruised foliage.
- Spread thinly across stainless mesh trays (max density: 2 kg/m²).

#### Step 2: Primary Solar Dehydration (6 Hours)
- Chamber Temperature: 38°C to 44°C
- Air Circulation: Active exhaust ventilation to displace evaporating moisture.
- Ensure ambient temperature stays below 48°C to retain vital phytonutrients.

#### Step 3: Equilibration & Moisture Verification (2 Hours)
- Allow cooling in shaded dry room.
- Test leaf shatter readiness and prepare for hermetic sealing.`,
        scheduleModelUsed: 'gemini-3.6-flash',
        progressReadings: [
          {
            id: 'read-1',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            note: 'Midday check: Leaf shrinkage underway, color vibrant emerald green.',
            metric: 'Chamber Temp',
            value: '42°C',
            loggedByUid: 'preview-admin-bharath',
            loggedByName: 'Bharath (Preview Mode)',
            loggedByRole: 'Facility Director',
          },
        ],
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
    ];
    localStorage.setItem(`preview_batches_${farmId}`, JSON.stringify(defaultBatches));
    return defaultBatches;
  }

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

  if (farmId.startsWith('preview-')) {
    const batches = await getBatches(farmId);
    const newBatchId = `batch-local-${Date.now()}`;
    const newBatch: ProductionBatch = {
      id: newBatchId,
      ...batchData,
      status: 'processing',
      progressReadings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    batches.unshift(newBatch);
    localStorage.setItem(`preview_batches_${farmId}`, JSON.stringify(batches));

    // Also update linked harvest logs in preview storage
    const logs = await getHarvestLogs(farmId);
    for (const logId of batchData.linkedHarvestLogIds) {
      const lIdx = logs.findIndex((l) => l.id === logId);
      if (lIdx !== -1) {
        logs[lIdx].batchId = newBatchId;
      }
    }
    localStorage.setItem(`preview_logs_${farmId}`, JSON.stringify(logs));
    return newBatchId;
  }

  try {
    const colRef = collection(db, 'farms', farmId, 'batches');
    const docRef = await addDoc(
      colRef,
      sanitizeFirestorePayload({
        ...batchData,
        status: 'processing',
        progressReadings: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

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

          await updateDoc(
            logRef,
            sanitizeFirestorePayload({
              batchId: docRef.id,
              allocatedQuantity: newAllocated,
              remainingQuantity: newRemaining,
              allocations: [...existingAllocations, newAllocationEntry],
            })
          );
        } else {
          await updateDoc(
            logRef,
            sanitizeFirestorePayload({
              batchId: docRef.id,
            })
          );
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
  const newReading: ProgressReading = {
    id: 'read_' + Date.now(),
    timestamp: new Date().toISOString(),
    ...reading,
  };

  if (farmId.startsWith('preview-')) {
    const batches = await getBatches(farmId);
    const bIdx = batches.findIndex((b) => b.id === batchId);
    if (bIdx !== -1) {
      batches[bIdx].progressReadings = [...(batches[bIdx].progressReadings || []), newReading];
      localStorage.setItem(`preview_batches_${farmId}`, JSON.stringify(batches));
    }
    return;
  }

  try {
    const batchRef = doc(db, 'farms', farmId, 'batches', batchId);
    await updateDoc(
      batchRef,
      sanitizeFirestorePayload({
        progressReadings: [...currentReadings, newReading],
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/batches/${batchId}`);
  }
}

export interface UpdateBatchStatusOptions {
  notes?: string;
  driedOutputQuantity?: number;
  driedOutputUnit?: string;
  gradeAOutputQuantity?: number;
  gradeBOutputQuantity?: number;
}

// Update batch status (Enforces Admin role checks server-side for Ready and Packaged)
export async function updateBatchStatus(
  farmId: string,
  batchId: string,
  newStatus: ProductionBatch['status'],
  userUid?: string,
  optionsOrNotes?: string | UpdateBatchStatusOptions
): Promise<{
  success: boolean;
  notifiedSlack?: boolean;
  driedOutputQuantity?: number;
  driedOutputUnit?: string;
  gradeAOutputQuantity?: number;
  gradeBOutputQuantity?: number;
  yieldPercentage?: number;
}> {
  const options: UpdateBatchStatusOptions =
    typeof optionsOrNotes === 'string'
      ? { notes: optionsOrNotes }
      : (optionsOrNotes || {});

  // Preview Mode handling
  if (farmId.startsWith('preview-')) {
    const batches = await getBatches(farmId);
    const bIdx = batches.findIndex((b) => b.id === batchId);
    let yieldPct: number | undefined;
    if (bIdx !== -1) {
      batches[bIdx].status = newStatus;
      if (options.notes) batches[bIdx].statusNotes = options.notes;
      if (options.gradeAOutputQuantity !== undefined) {
        batches[bIdx].gradeAOutputQuantity = options.gradeAOutputQuantity;
      }
      if (options.gradeBOutputQuantity !== undefined) {
        batches[bIdx].gradeBOutputQuantity = options.gradeBOutputQuantity;
      }
      const totalDried = options.driedOutputQuantity !== undefined
        ? options.driedOutputQuantity
        : ((options.gradeAOutputQuantity || 0) + (options.gradeBOutputQuantity || 0));

      if (totalDried > 0 || options.driedOutputQuantity !== undefined) {
        batches[bIdx].driedOutputQuantity = totalDried;
        if (batches[bIdx].totalQuantity > 0) {
          yieldPct = Math.round((totalDried / batches[bIdx].totalQuantity) * 1000) / 10;
          batches[bIdx].yieldPercentage = yieldPct;
        }
      }
      if (options.driedOutputUnit) batches[bIdx].driedOutputUnit = options.driedOutputUnit;
      localStorage.setItem(`preview_batches_${farmId}`, JSON.stringify(batches));
    }
    return {
      success: true,
      notifiedSlack: false,
      gradeAOutputQuantity: options.gradeAOutputQuantity,
      gradeBOutputQuantity: options.gradeBOutputQuantity,
      driedOutputQuantity: options.driedOutputQuantity,
      driedOutputUnit: options.driedOutputUnit,
      yieldPercentage: yieldPct,
    };
  }

  // If advancing to ready or packaged, enforce through authoritative server-side endpoint
  if (newStatus === 'ready' || newStatus === 'packaged') {
    const token = await auth.currentUser?.getIdToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/batches/${batchId}/status`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        farmId,
        uid: userUid || auth.currentUser?.uid,
        status: newStatus,
        notes: options.notes || '',
        gradeAOutputQuantity: options.gradeAOutputQuantity,
        gradeBOutputQuantity: options.gradeBOutputQuantity,
        driedOutputQuantity: options.driedOutputQuantity,
        driedOutputUnit: options.driedOutputUnit,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to update status to ${newStatus}: HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      success: true,
      notifiedSlack: data.notifiedSlack,
      gradeAOutputQuantity: data.gradeAOutputQuantity,
      gradeBOutputQuantity: data.gradeBOutputQuantity,
      driedOutputQuantity: data.driedOutputQuantity,
      driedOutputUnit: data.driedOutputUnit,
      yieldPercentage: data.yieldPercentage,
    };
  }

  // Standard update for intermediate progress stages
  try {
    const batchRef = doc(db, 'farms', farmId, 'batches', batchId);
    const updateData: any = {
      status: newStatus,
      updatedAt: serverTimestamp(),
    };
    if (options.notes) {
      updateData.statusNotes = options.notes;
    }
    if (options.gradeAOutputQuantity !== undefined) {
      updateData.gradeAOutputQuantity = options.gradeAOutputQuantity;
    }
    if (options.gradeBOutputQuantity !== undefined) {
      updateData.gradeBOutputQuantity = options.gradeBOutputQuantity;
    }
    if (options.driedOutputQuantity !== undefined) {
      updateData.driedOutputQuantity = options.driedOutputQuantity;
    }
    if (options.driedOutputUnit) {
      updateData.driedOutputUnit = options.driedOutputUnit;
    }
    await updateDoc(batchRef, sanitizeFirestorePayload(updateData));
    return { success: true, notifiedSlack: false };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/batches/${batchId}`);
    return { success: false, notifiedSlack: false };
  }
}

// Batch "Ask AI" Messages
export async function getBatchMessages(
  farmId: string,
  batchId: string
): Promise<BatchChatMessage[]> {
  if (farmId.startsWith('preview-') || batchId.startsWith('batch-local-') || batchId.startsWith('batch-moringa')) {
    const local = localStorage.getItem(`preview_msgs_${batchId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    const defaultMsgs: BatchChatMessage[] = [
      {
        id: 'msg-seed-1',
        role: 'model',
        content:
          'Welcome to the Gemini Batch Assistant for Moringa Leaves (Batch #batch-moringa-01). The solar dehydration schedule is currently at Step 2 (Primary Solar Dehydration). How can I assist you with temperature regulation, sensory checks, or moisture testing?',
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
    ];
    localStorage.setItem(`preview_msgs_${batchId}`, JSON.stringify(defaultMsgs));
    return defaultMsgs;
  }

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
  if (farmId.startsWith('preview-') || batchId.startsWith('batch-local-') || batchId.startsWith('batch-moringa')) {
    const msgs = await getBatchMessages(farmId, batchId);
    const newMsgId = `msg-local-${Date.now()}`;
    msgs.push({
      id: newMsgId,
      ...message,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(`preview_msgs_${batchId}`, JSON.stringify(msgs));
    return newMsgId;
  }

  try {
    const colRef = collection(db, 'farms', farmId, 'batches', batchId, 'messages');
    const docRef = await addDoc(
      colRef,
      sanitizeFirestorePayload({
        ...message,
        createdAt: serverTimestamp(),
      })
    );
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/batches/${batchId}/messages`);
  }
}

// ==========================================
// Packaging Module Operations
// ==========================================

export async function getPackagingLogs(farmId: string): Promise<PackagingRecord[]> {
  if (farmId.startsWith('preview-')) {
    const local = localStorage.getItem(`preview_packaging_${farmId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    const defaultPackages: PackagingRecord[] = [
      {
        id: 'pkg-moringa-a-100',
        productId: 'prod-moringa-1',
        productName: 'Moringa Leaves',
        batchId: 'batch-moringa-01',
        grade: 'Grade A',
        packageSizeGrams: 100,
        unitsPacked: 80,
        totalGrams: 8000,
        totalKg: 8.0,
        unitsDispatched: 20,
        unitsRemaining: 60,
        storageLocation: 'Rack A1 - Finished Goods Bay 1',
        batchCode: 'LOT-MOR-2026-01',
        notes: 'Pouch sealed with nitrogen flush, moisture < 4.5%',
        packedByUid: 'preview-admin-bharath',
        packedByName: 'Bharath (Facility Director)',
        packedByRole: 'Facility Director',
        createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      },
      {
        id: 'pkg-moringa-a-250',
        productId: 'prod-moringa-1',
        productName: 'Moringa Leaves',
        batchId: 'batch-moringa-01',
        grade: 'Grade A',
        packageSizeGrams: 250,
        unitsPacked: 40,
        totalGrams: 10000,
        totalKg: 10.0,
        unitsDispatched: 15,
        unitsRemaining: 25,
        storageLocation: 'Rack A2 - Finished Goods Bay 1',
        batchCode: 'LOT-MOR-2026-01',
        notes: 'Standard kraft foil ziplock pouches.',
        packedByUid: 'preview-admin-bharath',
        packedByName: 'Bharath (Facility Director)',
        packedByRole: 'Facility Director',
        createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
      },
      {
        id: 'pkg-moringa-b-500',
        productId: 'prod-moringa-1',
        productName: 'Moringa Leaves',
        batchId: 'batch-moringa-01',
        grade: 'Grade B',
        packageSizeGrams: 500,
        unitsPacked: 20,
        totalGrams: 10000,
        totalKg: 10.0,
        unitsDispatched: 10,
        unitsRemaining: 10,
        storageLocation: 'Shelf B1 - Bulk Pack Area',
        batchCode: 'LOT-MOR-2026-01',
        notes: 'Grade B coarse fraction for culinary & tea blends.',
        packedByUid: 'preview-admin-bharath',
        packedByName: 'Bharath (Facility Director)',
        packedByRole: 'Facility Director',
        createdAt: new Date(Date.now() - 3600000 * 16).toISOString(),
      },
      {
        id: 'pkg-turmeric-a-200',
        productId: 'prod-turmeric-2',
        productName: 'Turmeric Powder',
        grade: 'Grade A',
        packageSizeGrams: 200,
        unitsPacked: 50,
        totalGrams: 10000,
        totalKg: 10.0,
        unitsDispatched: 30,
        unitsRemaining: 20,
        storageLocation: 'Spice Vault - Bay 2',
        batchCode: 'LOT-TUR-2026-02',
        notes: 'Fine mesh sieved golden organic turmeric pouches.',
        packedByUid: 'preview-admin-bharath',
        packedByName: 'Bharath (Facility Director)',
        packedByRole: 'Facility Director',
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      },
    ];
    localStorage.setItem(`preview_packaging_${farmId}`, JSON.stringify(defaultPackages));
    return defaultPackages;
  }

  try {
    const q = query(
      collection(db, 'farms', farmId, 'packagingLogs'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const logs = snap.docs.map((d) => ({
      id: d.id,
      unitsDispatched: 0,
      unitsRemaining: d.data().unitsPacked || 0,
      ...(d.data() as any),
    })) as PackagingRecord[];
    return logs;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/packagingLogs`);
  }
}

export async function addPackagingRecord(
  farmId: string,
  data: Omit<PackagingRecord, 'id' | 'createdAt'>
): Promise<string> {
  if (data.packageSizeGrams <= 0 || data.unitsPacked <= 0) {
    throw new Error('Please provide valid positive package size in grams and number of units packed.');
  }

  const totalGrams = Math.round(data.packageSizeGrams * data.unitsPacked);
  const totalKg = Math.round((totalGrams / 1000) * 100) / 100;
  const initialUnitsRemaining = data.unitsRemaining !== undefined ? data.unitsRemaining : data.unitsPacked;

  if (farmId.startsWith('preview-')) {
    const logs = await getPackagingLogs(farmId);
    const newId = `pkg-local-${Date.now()}`;
    const newRecord: PackagingRecord = {
      id: newId,
      ...data,
      totalGrams,
      totalKg,
      unitsDispatched: data.unitsDispatched || 0,
      unitsRemaining: initialUnitsRemaining,
      createdAt: new Date().toISOString(),
    };
    logs.unshift(newRecord);
    localStorage.setItem(`preview_packaging_${farmId}`, JSON.stringify(logs));
    return newId;
  }

  try {
    const colRef = collection(db, 'farms', farmId, 'packagingLogs');
    const docRef = await addDoc(
      colRef,
      sanitizeFirestorePayload({
        ...data,
        totalGrams,
        totalKg,
        unitsDispatched: data.unitsDispatched || 0,
        unitsRemaining: initialUnitsRemaining,
        createdAt: serverTimestamp(),
      })
    );
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/packagingLogs`);
  }
}

export async function updatePackagingRecord(
  farmId: string,
  recordId: string,
  updates: Partial<PackagingRecord>
): Promise<void> {
  if (farmId.startsWith('preview-')) {
    const logs = await getPackagingLogs(farmId);
    const idx = logs.findIndex((p) => p.id === recordId);
    if (idx !== -1) {
      logs[idx] = { ...logs[idx], ...updates };
      localStorage.setItem(`preview_packaging_${farmId}`, JSON.stringify(logs));
    }
    return;
  }

  try {
    const docRef = doc(db, 'farms', farmId, 'packagingLogs', recordId);
    await updateDoc(
      docRef,
      sanitizeFirestorePayload({
        ...updates,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/packagingLogs/${recordId}`);
  }
}

// ==========================================
// Dispatching Module Operations
// ==========================================

export async function getDispatches(farmId: string): Promise<DispatchRecord[]> {
  if (farmId.startsWith('preview-')) {
    const local = localStorage.getItem(`preview_dispatches_${farmId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch {}
    }
    const defaultDispatches: DispatchRecord[] = [
      {
        id: 'dsp-001',
        orderNumber: 'DSP-2026-001',
        orderSource: 'WhatsApp Direct',
        orderDate: new Date(Date.now() - 3600000 * 24 * 2).toISOString().slice(0, 10),
        dispatchDate: new Date(Date.now() - 3600000 * 24).toISOString().slice(0, 10),
        customerName: 'Priya Sharma (AyurWellness Hub)',
        customerPhone: '+91 98450 12345',
        customerEmail: 'priya@ayurwellness.in',
        deliveryAddress: '#42 Green Glen Layout, Bellandur, Outer Ring Road',
        destinationCity: 'Bengaluru',
        destinationState: 'Karnataka',
        pincode: '560103',
        courierName: 'Delhivery Express',
        trackingNumber: 'DEL-9988231401',
        items: [
          {
            packagingId: 'pkg-moringa-a-100',
            productId: 'prod-moringa-1',
            productName: 'Moringa Leaves',
            grade: 'Grade A',
            packageSizeGrams: 100,
            units: 20,
            totalGrams: 2000,
            totalKg: 2.0,
            unitPrice: 180,
            subtotal: 3600,
          },
        ],
        totalUnits: 20,
        totalWeightKg: 2.0,
        totalAmount: 3600,
        amountReceived: 3600,
        paymentStatus: 'Prepaid',
        paymentMethod: 'UPI / Google Pay',
        paymentReference: 'UPI-TXN-98421054',
        status: 'Delivered',
        notes: 'Customer requested eco-friendly cardboard packaging. Repeat client.',
        dispatchedByUid: 'preview-admin-bharath',
        dispatchedByName: 'Bharath (Facility Director)',
        dispatchedByRole: 'Facility Director',
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: 'dsp-002',
        orderNumber: 'DSP-2026-002',
        orderSource: 'B2B Distributor',
        orderDate: new Date(Date.now() - 3600000 * 24).toISOString().slice(0, 10),
        dispatchDate: new Date(Date.now() - 3600000 * 8).toISOString().slice(0, 10),
        customerName: 'Nature Basket Organic Mart',
        customerPhone: '+91 94401 88721',
        customerEmail: 'procurement@naturebasket.org',
        deliveryAddress: 'Plot 18, Phase 2, HITEC City Industrial Area',
        destinationCity: 'Hyderabad',
        destinationState: 'Telangana',
        pincode: '500081',
        courierName: 'Blue Dart Surface',
        trackingNumber: 'BLU-88349120',
        items: [
          {
            packagingId: 'pkg-turmeric-a-200',
            productId: 'prod-turmeric-2',
            productName: 'Turmeric Powder',
            grade: 'Grade A',
            packageSizeGrams: 200,
            units: 30,
            totalGrams: 6000,
            totalKg: 6.0,
            unitPrice: 220,
            subtotal: 6600,
          },
          {
            packagingId: 'pkg-moringa-a-250',
            productId: 'prod-moringa-1',
            productName: 'Moringa Leaves',
            grade: 'Grade A',
            packageSizeGrams: 250,
            units: 15,
            totalGrams: 3750,
            totalKg: 3.75,
            unitPrice: 420,
            subtotal: 6300,
          },
        ],
        totalUnits: 45,
        totalWeightKg: 9.75,
        totalAmount: 12900,
        amountReceived: 12900,
        paymentStatus: 'Amount Received',
        paymentMethod: 'Bank Transfer (NEFT)',
        paymentReference: 'NEFT-HDFC-993214',
        status: 'In Transit',
        notes: 'Commercial invoice & FSSAI batch test certificate attached.',
        dispatchedByUid: 'preview-admin-bharath',
        dispatchedByName: 'Bharath (Facility Director)',
        dispatchedByRole: 'Facility Director',
        createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      },
      {
        id: 'dsp-003',
        orderNumber: 'DSP-2026-003',
        orderSource: 'Shopify',
        orderDate: new Date(Date.now() - 3600000 * 12).toISOString().slice(0, 10),
        dispatchDate: new Date(Date.now() - 3600000 * 4).toISOString().slice(0, 10),
        customerName: 'Ananya Deshmukh',
        customerPhone: '+91 98200 44321',
        customerEmail: 'ananya.d@gmail.com',
        deliveryAddress: 'Flat 402, Sea Breeze Apts, Bandra West',
        destinationCity: 'Mumbai',
        destinationState: 'Maharashtra',
        pincode: '400050',
        courierName: 'India Post Speed Post',
        trackingNumber: 'EM-77239011IN',
        items: [
          {
            packagingId: 'pkg-moringa-b-500',
            productId: 'prod-moringa-1',
            productName: 'Moringa Leaves',
            grade: 'Grade B',
            packageSizeGrams: 500,
            units: 10,
            totalGrams: 5000,
            totalKg: 5.0,
            unitPrice: 450,
            subtotal: 4500,
          },
        ],
        totalUnits: 10,
        totalWeightKg: 5.0,
        totalAmount: 4500,
        amountReceived: 0,
        paymentStatus: 'Pending / COD',
        paymentMethod: 'Cash on Delivery',
        status: 'Dispatched',
        notes: 'Cash on Delivery order collected by postman upon delivery.',
        dispatchedByUid: 'preview-admin-bharath',
        dispatchedByName: 'Bharath (Facility Director)',
        dispatchedByRole: 'Facility Director',
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
    ];
    localStorage.setItem(`preview_dispatches_${farmId}`, JSON.stringify(defaultDispatches));
    return defaultDispatches;
  }

  try {
    const q = query(
      collection(db, 'farms', farmId, 'dispatches'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const records = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as DispatchRecord[];
    return records;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `farms/${farmId}/dispatches`);
  }
}

export async function addDispatchRecord(
  farmId: string,
  data: Omit<DispatchRecord, 'id' | 'createdAt'>
): Promise<string> {
  if (!data.customerName || !data.deliveryAddress || !data.destinationCity) {
    throw new Error('Customer name, destination city, and delivery address are required for dispatch.');
  }

  if (!data.items || data.items.length === 0) {
    throw new Error('Please add at least one line item to dispatch.');
  }

  // Preview Mode
  if (farmId.startsWith('preview-')) {
    const dispatches = await getDispatches(farmId);
    const newId = `dsp-local-${Date.now()}`;
    const newRecord: DispatchRecord = {
      id: newId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    dispatches.unshift(newRecord);
    localStorage.setItem(`preview_dispatches_${farmId}`, JSON.stringify(dispatches));

    // Update packaging remaining counts in preview storage
    const packagingList = await getPackagingLogs(farmId);
    for (const item of data.items) {
      if (item.packagingId) {
        const pIdx = packagingList.findIndex((p) => p.id === item.packagingId);
        if (pIdx !== -1) {
          const currentDisp = packagingList[pIdx].unitsDispatched || 0;
          const newDisp = currentDisp + item.units;
          packagingList[pIdx].unitsDispatched = newDisp;
          packagingList[pIdx].unitsRemaining = Math.max(0, (packagingList[pIdx].unitsPacked || 0) - newDisp);
        }
      }
    }
    localStorage.setItem(`preview_packaging_${farmId}`, JSON.stringify(packagingList));

    return newId;
  }

  try {
    const colRef = collection(db, 'farms', farmId, 'dispatches');
    const docRef = await addDoc(
      colRef,
      sanitizeFirestorePayload({
        ...data,
        createdAt: serverTimestamp(),
      })
    );

    // Deduct stock from packaging items in Firestore
    for (const item of data.items) {
      if (item.packagingId) {
        try {
          const pkgRef = doc(db, 'farms', farmId, 'packagingLogs', item.packagingId);
          const pkgSnap = await getDoc(pkgRef);
          if (pkgSnap.exists()) {
            const pData = pkgSnap.data();
            const currentDisp = Number(pData.unitsDispatched) || 0;
            const unitsPacked = Number(pData.unitsPacked) || 0;
            const newDisp = currentDisp + item.units;
            const newRemaining = Math.max(0, unitsPacked - newDisp);
            await updateDoc(
              pkgRef,
              sanitizeFirestorePayload({
                unitsDispatched: newDisp,
                unitsRemaining: newRemaining,
                updatedAt: serverTimestamp(),
              })
            );
          }
        } catch (pkgErr) {
          console.warn('Could not update remaining inventory on packaging log:', pkgErr);
        }
      }
    }

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `farms/${farmId}/dispatches`);
  }
}

export async function updateDispatchRecord(
  farmId: string,
  dispatchId: string,
  updates: Partial<DispatchRecord>
): Promise<void> {
  if (farmId.startsWith('preview-')) {
    const dispatches = await getDispatches(farmId);
    const idx = dispatches.findIndex((d) => d.id === dispatchId);
    if (idx !== -1) {
      dispatches[idx] = { ...dispatches[idx], ...updates };
      localStorage.setItem(`preview_dispatches_${farmId}`, JSON.stringify(dispatches));
    }
    return;
  }

  try {
    const docRef = doc(db, 'farms', farmId, 'dispatches', dispatchId);
    await updateDoc(
      docRef,
      sanitizeFirestorePayload({
        ...updates,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `farms/${farmId}/dispatches/${dispatchId}`);
  }
}

