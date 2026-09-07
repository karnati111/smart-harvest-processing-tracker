import React, { useState, useEffect, useMemo } from 'react';
import { Farm, FarmMember, ProductCatalogItem, HarvestLog, ProductionBatch, BatchStatus } from '../types';
import { formatUnitDisplay, formatQuantityWithUnit } from '../lib/unitUtils';
import { updateBatchStatus, getAdminDashboardData, AdminDashboardData } from '../lib/farmService';
import { ProductionProcurementCard } from './ProductionProcurementCard';
import { BatchReadyPromptModal } from './BatchReadyPromptModal';
import {
  LayoutDashboard,
  Boxes,
  ClipboardList,
  Layers,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  PackageCheck,
  Flame,
  Thermometer,
  Droplets,
  Scale,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  AlertCircle,
  RefreshCw,
  Users,
  Search,
  Check,
  Package,
  Truck,
} from 'lucide-react';

interface DashboardSectionProps {
  farm: Farm;
  member: FarmMember;
  products: ProductCatalogItem[];
  harvestLogs: HarvestLog[];
  batches: ProductionBatch[];
  onNavigateTab: (tab: 'dashboard' | 'batches' | 'intake' | 'catalog' | 'packaging' | 'dispatch' | 'history' | 'team') => void;
  onQuickIntake: (product?: ProductCatalogItem) => void;
  onStartBatchWithProduct: (product: ProductCatalogItem) => void;
  onSelectBatch: (batchId: string) => void;
  onBatchUpdated?: (updatedBatch: ProductionBatch) => void;
}

export const DashboardSection: React.FC<DashboardSectionProps> = ({
  farm,
  member,
  products,
  harvestLogs,
  batches,
  onNavigateTab,
  onQuickIntake,
  onStartBatchWithProduct,
  onSelectBatch,
  onBatchUpdated,
}) => {
  const isAdmin = member.permissionTier === 'admin';

  // Server-side admin verification & aggregated data state
  const [adminData, setAdminData] = useState<AdminDashboardData | null>(null);
  const [isLoadingServerData, setIsLoadingServerData] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Batch action feedback & loading state
  const [updatingBatchId, setUpdatingBatchId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Batch search & filter in Admin View
  const [batchSearchTerm, setBatchSearchTerm] = useState('');
  const [batchStatusFilter, setBatchStatusFilter] = useState<'all' | BatchStatus>('all');

  // Load authoritative server-verified admin data on mount for Admins
  const fetchServerAdminData = async () => {
    if (!isAdmin) return;
    setIsLoadingServerData(true);
    setServerError(null);
    try {
      const data = await getAdminDashboardData(farm.id, member.uid);
      setAdminData(data);
    } catch (err: any) {
      console.warn('Could not load authoritative server admin data:', err?.message);
      setServerError(err?.message || 'Server check pending');
    } finally {
      setIsLoadingServerData(false);
    }
  };

  useEffect(() => {
    fetchServerAdminData();
  }, [farm.id, member.uid, isAdmin]);

  // 1. Operational Batch Classifications
  const processingBatches = useMemo(() => batches.filter((b) => b.status === 'processing'), [batches]);
  const readyBatches = useMemo(() => batches.filter((b) => b.status === 'ready'), [batches]);
  const packagedBatches = useMemo(() => batches.filter((b) => b.status === 'packaged'), [batches]);
  const harvestedBatches = useMemo(() => batches.filter((b) => b.status === 'harvested'), [batches]);

  // 2. Aggregate Ready Inventory Calculation
  // Group ready inventory by product name
  const aggregateReadyByProduct = useMemo(() => {
    const map: Record<string, { productName: string; quantity: number; unit: string; batchCount: number }> = {};
    for (const b of readyBatches) {
      const pName = b.productName || 'Product';
      if (!map[pName]) {
        map[pName] = {
          productName: pName,
          quantity: 0,
          unit: b.unit || 'kg',
          batchCount: 0,
        };
      }
      map[pName].quantity += Number(b.totalQuantity) || 0;
      map[pName].batchCount += 1;
    }
    return Object.values(map);
  }, [readyBatches]);

  const totalReadyQuantity = useMemo(() => {
    return readyBatches.reduce((sum, b) => sum + (Number(b.totalQuantity) || 0), 0);
  }, [readyBatches]);

  // Total intake volume across all raw deliveries
  const totalIntakeQuantity = useMemo(() => {
    return harvestLogs.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [harvestLogs]);

  // Total available stock in inventory across all intake records
  const totalAvailableStock = useMemo(() => {
    return harvestLogs.reduce((sum, l) => {
      if (l.remainingQuantity !== undefined) {
        return sum + Math.max(0, l.remainingQuantity);
      }
      const linked = batches.filter((b) => b.linkedHarvestLogIds?.includes(l.id));
      const used = linked.reduce((acc, b) => {
        const specific = b.intakeAllocations?.find((a) => a.harvestLogId === l.id)?.quantityUsed;
        return acc + (specific !== undefined ? specific : (b.totalQuantity || 0));
      }, 0);
      return sum + Math.max(0, l.quantity - used);
    }, 0);
  }, [harvestLogs, batches]);

  const stockUtilizationPct = totalIntakeQuantity > 0
    ? Math.round(((totalIntakeQuantity - totalAvailableStock) / totalIntakeQuantity) * 100)
    : 0;

  // Worker view: Worker's own intake records
  const myHarvestLogs = useMemo(() => {
    return harvestLogs.filter((l) => l.loggedByUid === member.uid);
  }, [harvestLogs, member.uid]);

  // Modal state for entering Original Dried Leaf Weight when marking ready
  const [readyPromptBatch, setReadyPromptBatch] = useState<ProductionBatch | null>(null);
  const [isSubmittingReadyPrompt, setIsSubmittingReadyPrompt] = useState(false);

  // Admin: Handle status change (Ready or Packaged) with server-side enforcement
  const handleAdminStatusChange = async (batch: ProductionBatch, targetStatus: BatchStatus) => {
    if (!isAdmin) {
      setFeedback({ type: 'error', message: 'Unauthorized: Only Admins can change batch status to Ready or Packaged.' });
      return;
    }

    // If marking as Ready, prompt for the Original Dried Leaf Weight input into stock
    if (targetStatus === 'ready') {
      setReadyPromptBatch(batch);
      return;
    }

    setUpdatingBatchId(batch.id);
    setFeedback(null);
    try {
      // Calls server-side endpoint /api/batches/:batchId/status
      const result = await updateBatchStatus(farm.id, batch.id, targetStatus, member.uid);

      const updatedBatch: ProductionBatch = {
        ...batch,
        status: targetStatus,
        readyAt: batch.readyAt,
        updatedAt: new Date(),
      };

      if (onBatchUpdated) {
        onBatchUpdated(updatedBatch);
      }

      setFeedback({
        type: 'success',
        message: `Batch #${batch.id.slice(-6)} (${batch.productName}) marked as ${targetStatus.toUpperCase()}! ${
          result.notifiedSlack ? 'Logistics team notified via Slack.' : ''
        }`,
      });

      // Refresh server-side aggregated metrics
      fetchServerAdminData();
    } catch (err: any) {
      console.error('Failed to change batch status:', err);
      setFeedback({
        type: 'error',
        message: err?.message || `Failed to transition batch status to ${targetStatus}.`,
      });
    } finally {
      setUpdatingBatchId(null);
    }
  };

  // Submit handler when user completes the Original Dried Leaf Weight prompt
  const handleConfirmReadyPrompt = async (payload: {
    driedOutputQuantity: number;
    driedOutputUnit: string;
    notes?: string;
  }) => {
    if (!readyPromptBatch) return;
    setIsSubmittingReadyPrompt(true);
    setFeedback(null);

    try {
      const result = await updateBatchStatus(farm.id, readyPromptBatch.id, 'ready', member.uid, {
        notes: payload.notes,
        driedOutputQuantity: payload.driedOutputQuantity,
        driedOutputUnit: payload.driedOutputUnit,
      });

      const updatedBatch: ProductionBatch = {
        ...readyPromptBatch,
        status: 'ready',
        readyAt: new Date(),
        driedOutputQuantity: payload.driedOutputQuantity,
        driedOutputUnit: payload.driedOutputUnit,
        yieldPercentage: result.yieldPercentage,
        statusNotes: payload.notes,
        updatedAt: new Date(),
      };

      if (onBatchUpdated) {
        onBatchUpdated(updatedBatch);
      }

      setFeedback({
        type: 'success',
        message: `Batch #${readyPromptBatch.id.slice(-6)} marked READY! ${payload.driedOutputQuantity} ${payload.driedOutputUnit} original dried leaf weight entered into stock. ${
          result.notifiedSlack ? 'Logistics notified via Slack.' : ''
        }`,
      });

      setReadyPromptBatch(null);
      fetchServerAdminData();
    } catch (err: any) {
      console.error('Failed to record dried leaf weight and mark ready:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to record dried leaf weight into stock.',
      });
    } finally {
      setIsSubmittingReadyPrompt(false);
    }
  };

  // Filtered batches for Admin Dashboard view
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const matchesSearch =
        b.productName.toLowerCase().includes(batchSearchTerm.toLowerCase()) ||
        b.id.toLowerCase().includes(batchSearchTerm.toLowerCase()) ||
        (b.processingType && b.processingType.toLowerCase().includes(batchSearchTerm.toLowerCase()));

      const matchesStatus = batchStatusFilter === 'all' || b.status === batchStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [batches, batchSearchTerm, batchStatusFilter]);

  // -------------------------------------------------------------
  // WORKER VIEW: Workers see only their own harvest-logging view
  // -------------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        {/* Worker Portal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950 text-white p-6 rounded-2xl border border-slate-800 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Worker Operational Portal</span>
                <span>•</span>
                <span>{farm.name}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                My Raw Material Intake View
              </h1>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                Logged in as <strong className="text-white">{member.email}</strong> ({member.roleLabel || 'Worker'}). Log incoming raw material deliveries and verify your delivery lineage.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigateTab('intake')}
                className="flex items-center space-x-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Record New Delivery</span>
              </button>
            </div>
          </div>
        </div>

        {/* Worker Access Level Notice */}
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start space-x-3 text-xs text-blue-900 dark:text-blue-300">
          <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">Role-Based Access Control Enforced</div>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
              Your account holds <strong>Worker</strong> permissions. In accordance with operational security policies, you see your own logged deliveries and product intake records. Facility-wide batch status advancements (&quot;Ready&quot; / &quot;Packaged&quot;) and the Admin Dashboard are managed authoritatively by facility Administrators.
            </p>
          </div>
        </div>

        {/* Worker Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">My Recorded Deliveries</div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {myHarvestLogs.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Delivery records submitted by you</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Volume Logged</div>
            <div className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {myHarvestLogs.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Raw material units received</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Catalog Products</div>
            <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {products.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Defined in facility catalog</div>
          </div>
        </div>

        {/* Production Incharge & Plant Operations: Raw Materials, Dried Stock & Procurement Needs */}
        <ProductionProcurementCard
          products={products}
          harvestLogs={harvestLogs}
          batches={batches}
          onQuickIntake={(prod) => onQuickIntake(prod)}
          onNavigateTab={onNavigateTab}
          userRoleLabel={member.roleLabel || 'Production Incharge'}
        />

        {/* My Intake Records Table */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <ClipboardList className="w-4 h-4 text-emerald-500" />
              <span>My Logged Raw Material Intake ({myHarvestLogs.length})</span>
            </h3>
            <button
              onClick={() => onNavigateTab('intake')}
              className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center space-x-1"
            >
              <span>Full Intake Section</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {myHarvestLogs.length === 0 ? (
            <div className="text-center py-10 text-slate-400 space-y-3">
              <ClipboardList className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
              <p className="text-xs">You have not logged any raw material deliveries yet.</p>
              <button
                onClick={() => onNavigateTab('intake')}
                className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-500 transition"
              >
                + Log First Delivery
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {myHarvestLogs.map((log) => (
                <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {log.productName}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        #{log.id.slice(-6)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {formatQuantityWithUnit(log.quantity, log.unit)}
                      {log.notes && <span className="text-slate-400 ml-2 italic">— {log.notes}</span>}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 shrink-0">
                    {log.harvestedAt ? new Date(log.harvestedAt?.seconds ? log.harvestedAt.seconds * 1000 : log.harvestedAt).toLocaleDateString() : 'Recent'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // ADMIN DASHBOARD VIEW:
  // Shows all batches for the farm with status, aggregate ready inventory,
  // and inline status transition controls (Ready / Packaged).
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Executive Admin Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950 text-white p-6 rounded-2xl border border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Admin Operations Center</span>
              <span>•</span>
              <span>{farm.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                ADMIN AUTHORIZED
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Executive Admin Dashboard
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Server-authoritative monitor of all facility batches, aggregate ready inventory, and distribution status governance.
            </p>
          </div>

          {/* Admin Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchServerAdminData}
              disabled={isLoadingServerData}
              className="flex items-center space-x-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold backdrop-blur-sm transition"
              title="Refresh server verified data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingServerData ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Sync Server</span>
            </button>
            <button
              onClick={() => onNavigateTab('batches')}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Batches</span>
            </button>
            <button
              onClick={() => onNavigateTab('packaging')}
              className="flex items-center space-x-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow transition"
              title="Packaging & Storage Inventory"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Packaging</span>
            </button>
            <button
              onClick={() => onNavigateTab('dispatch')}
              className="flex items-center space-x-1.5 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition"
              title="Outbound Dispatch & Orders"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Dispatching</span>
            </button>
            <button
              onClick={() => onNavigateTab('team')}
              className="flex items-center space-x-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold backdrop-blur-sm transition"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Manage Team</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between shadow-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Core Operational KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ready for Distribution (Primary Focus) */}
        <div
          onClick={() => {
            setBatchStatusFilter('ready');
          }}
          className={`p-4 rounded-xl border shadow-xs transition cursor-pointer group ${
            readyBatches.length > 0
              ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span className={readyBatches.length > 0 ? 'text-emerald-800 dark:text-emerald-300 font-bold' : ''}>
              Ready for Distribution
            </span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                readyBatches.length > 0
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span
              className={`text-2xl font-bold ${
                readyBatches.length > 0
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {readyBatches.length}
            </span>
            <span className="text-xs text-slate-500">
              ready batch{readyBatches.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
              {totalReadyQuantity.toLocaleString()} total units ready
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              View queue <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Card 2: Live Processing Batches */}
        <div
          onClick={() => {
            setBatchStatusFilter('processing');
          }}
          className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-blue-300 dark:hover:border-blue-800 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>In Chamber Processing</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {processingBatches.length}
            </span>
            <span className="text-xs text-slate-500">
              active batch{processingBatches.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {harvestedBatches.length > 0 ? `+${harvestedBatches.length} staged` : 'Under environmental control'}
            </span>
            <span className="text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Inspect runs <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Card 3: Packaged / Completed Batches */}
        <div
          onClick={() => {
            setBatchStatusFilter('packaged');
          }}
          className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-purple-300 dark:hover:border-purple-800 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Packaged &amp; Archived</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {packagedBatches.length}
            </span>
            <span className="text-xs text-slate-500">packaged batches</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {batches.length} total facility batches
            </span>
            <span className="text-purple-600 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              View archives <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Card 4: Raw Material Stock & Lineage */}
        <div
          onClick={() => onNavigateTab('intake')}
          className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Raw Material Balance</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalAvailableStock.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">
              / {totalIntakeQuantity.toLocaleString()} total units
            </span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, stockUtilizationPct)}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>{stockUtilizationPct}% allocated</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Intake Lineage
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Production Incharge & Plant Operations: Raw Materials, Dried Stock & Procurement Needs */}
      <ProductionProcurementCard
        products={products}
        harvestLogs={harvestLogs}
        batches={batches}
        onQuickIntake={(prod) => onQuickIntake(prod)}
        onNavigateTab={onNavigateTab}
        userRoleLabel={member.roleLabel || 'Plant Admin'}
      />

      {/* Aggregate Ready Inventory Section */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <PackageCheck className="w-5 h-5 text-emerald-500" />
              <span>Aggregate Ready Inventory Overview</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Authoritative ready-to-sell finished product stock across all completed chamber runs
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
              {readyBatches.length} Ready Batches • {totalReadyQuantity.toLocaleString()} Total Units
            </span>
          </div>
        </div>

        {aggregateReadyByProduct.length === 0 ? (
          <div className="text-center py-8 text-slate-400 space-y-2">
            <PackageCheck className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-xs">No batches are currently waiting in &quot;Ready&quot; status.</p>
            <p className="text-[11px] text-slate-500">
              When chamber processing finishes, advance batches to &quot;Ready&quot; to stage them for distributor pickup.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {aggregateReadyByProduct.map((item) => (
              <div
                key={item.productName}
                className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {item.productName}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                    {item.batchCount} batch{item.batchCount > 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono">
                  {formatQuantityWithUnit(item.quantity, item.unit)}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1 border-t border-emerald-100 dark:border-emerald-900/60">
                  <span>Status: Ready for Dispatch</span>
                  <button
                    onClick={() => {
                      setBatchStatusFilter('ready');
                      setBatchSearchTerm(item.productName);
                    }}
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                  >
                    Filter Batches →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Batches for the Farm with Live Status & Server-Enforced Admin Actions */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Boxes className="w-5 h-5 text-blue-500" />
              <span>All Facility Batches &amp; Status Governance</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Admin authority to promote batches to &quot;Ready&quot; or &quot;Packaged&quot; (enforced server-side)
            </p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search batch or product..."
                value={batchSearchTerm}
                onChange={(e) => setBatchSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none w-44"
              />
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-[11px]">
              {(['all', 'processing', 'ready', 'packaged', 'harvested'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setBatchStatusFilter(status)}
                  className={`px-2.5 py-1 rounded-md font-medium capitalize transition ${
                    batchStatusFilter === status
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Batches List */}
        {filteredBatches.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-2">
            <Boxes className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-xs">No batches match the selected criteria.</p>
            {batchStatusFilter !== 'all' && (
              <button
                onClick={() => {
                  setBatchStatusFilter('all');
                  setBatchSearchTerm('');
                }}
                className="text-xs text-emerald-600 font-semibold hover:underline"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredBatches.map((batch) => {
              const isUpdating = updatingBatchId === batch.id;
              return (
                <div
                  key={batch.id}
                  className="py-4 first:pt-1 last:pb-1 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Batch Details */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {batch.productName}
                      </span>
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        #{batch.id.slice(-6)}
                      </span>

                      {/* Status Badge */}
                      {batch.status === 'processing' && (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center space-x-1">
                          <Flame className="w-3 h-3 mr-1" />
                          <span>Processing</span>
                        </span>
                      )}
                      {batch.status === 'ready' && (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 flex items-center space-x-1 animate-pulse">
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                          <span>Ready for Distribution</span>
                        </span>
                      )}
                      {batch.status === 'packaged' && (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center space-x-1">
                          <Package className="w-3 h-3 mr-1" />
                          <span>Packaged &amp; Dispatched</span>
                        </span>
                      )}
                      {batch.status === 'harvested' && (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center space-x-1">
                          <Clock className="w-3 h-3 mr-1" />
                          <span>Staged / Harvested</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                      <div>
                        Volume:{' '}
                        <strong className="text-slate-900 dark:text-white font-bold">
                          {formatQuantityWithUnit(batch.totalQuantity, batch.unit)}
                        </strong>
                      </div>
                      <div>
                        Process: <span className="capitalize">{batch.processingType || 'Standard'}</span>
                      </div>
                      {batch.conditions?.temperature && (
                        <div className="flex items-center space-x-1">
                          <Thermometer className="w-3 h-3 text-amber-500" />
                          <span>{batch.conditions.temperature}</span>
                        </div>
                      )}
                      {batch.conditions?.humidity && (
                        <div className="flex items-center space-x-1">
                          <Droplets className="w-3 h-3 text-blue-500" />
                          <span>{batch.conditions.humidity}</span>
                        </div>
                      )}
                      <div>
                        Readings: <span>{batch.progressReadings?.length || 0} logged</span>
                      </div>
                    </div>
                  </div>

                  {/* Admin Direct Action Buttons */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {/* If in processing or harvested, Admin can Mark as Ready */}
                    {(batch.status === 'processing' || batch.status === 'harvested') && (
                      <button
                        onClick={() => handleAdminStatusChange(batch, 'ready')}
                        disabled={isUpdating}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50"
                        title="Authoritatively mark batch Ready and notify logistics"
                      >
                        {isUpdating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>Mark Ready</span>
                      </button>
                    )}

                    {/* If Ready, Admin can Mark as Packaged */}
                    {batch.status === 'ready' && (
                      <button
                        onClick={() => handleAdminStatusChange(batch, 'packaged')}
                        disabled={isUpdating}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50"
                        title="Mark batch Packaged and finalize inventory"
                      >
                        {isUpdating ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <PackageCheck className="w-3.5 h-3.5" />
                        )}
                        <span>Mark Packaged</span>
                      </button>
                    )}

                    {/* Inspect details */}
                    <button
                      onClick={() => onSelectBatch(batch.id)}
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin Batch Ready Dried Leaf Weight Entry Modal */}
      {readyPromptBatch && (
        <BatchReadyPromptModal
          batch={readyPromptBatch}
          isOpen={!!readyPromptBatch}
          onClose={() => setReadyPromptBatch(null)}
          onConfirm={handleConfirmReadyPrompt}
          isSubmitting={isSubmittingReadyPrompt}
        />
      )}
    </div>
  );
};
