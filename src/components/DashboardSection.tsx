import React, { useState, useEffect, useMemo } from 'react';
import {
  Farm,
  FarmMember,
  ProductCatalogItem,
  HarvestLog,
  ProductionBatch,
  BatchStatus,
  PackagingRecord,
  DispatchRecord,
  isQualityInspector,
  isProductionLead,
} from '../types';
import { formatUnitDisplay, formatQuantityWithUnit } from '../lib/unitUtils';
import {
  updateBatchStatus,
  getAdminDashboardData,
  AdminDashboardData,
  getPackagingLogs,
  getDispatches,
  addProgressReading,
} from '../lib/farmService';
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
  Activity,
  IndianRupee,
  Eye,
  X,
  FileCheck2,
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
  const isQC = isQualityInspector(member.roleLabel, member.permissionTier);
  const isLead = isProductionLead(member.roleLabel, member.permissionTier);

  // Auxiliary data: Packaging and Dispatch records for comprehensive pipeline metrics
  const [packagingLogs, setPackagingLogs] = useState<PackagingRecord[]>([]);
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [isLoadingAuxData, setIsLoadingAuxData] = useState(false);

  // Quick QC Temperature & Condition Check Modal state
  const [qcModalBatch, setQcModalBatch] = useState<ProductionBatch | null>(null);
  const [qcTemp, setQcTemp] = useState('');
  const [qcHumidity, setQcHumidity] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [isLoggingQc, setIsLoggingQc] = useState(false);

  // Active sub-view for Admin dashboard (Overview, Production Flow Pipeline, Quality Inspection)
  const [adminActiveSubView, setAdminActiveSubView] = useState<'overview' | 'flow' | 'qc'>('overview');

  // Load auxiliary packaging and dispatch data
  const loadAuxiliaryData = async () => {
    setIsLoadingAuxData(true);
    try {
      const [pkgData, dspData] = await Promise.all([
        getPackagingLogs(farm.id),
        getDispatches(farm.id),
      ]);
      if (pkgData) setPackagingLogs(pkgData);
      if (dspData) setDispatches(dspData);
    } catch (err) {
      console.warn('Could not load packaging/dispatch data for dashboard:', err);
    } finally {
      setIsLoadingAuxData(false);
    }
  };

  useEffect(() => {
    loadAuxiliaryData();
  }, [farm.id]);

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

  // Running batches (actively dehydrating/processing or intake staged)
  const runningBatches = useMemo(() => {
    return batches.filter((b) => b.status === 'processing' || b.status === 'harvested');
  }, [batches]);

  // Total raw material quantity currently in processing chambers
  const totalProcessingQuantity = useMemo(() => {
    return processingBatches.reduce((sum, b) => sum + (Number(b.totalQuantity) || 0), 0);
  }, [processingBatches]);

  // Total dried output quantity across ready or packaged batches
  const totalDriedOutputQuantity = useMemo(() => {
    return batches.reduce((sum, b) => {
      if (b.driedOutputQuantity !== undefined && b.driedOutputQuantity > 0) {
        return sum + Number(b.driedOutputQuantity);
      }
      if (b.status === 'ready' || b.status === 'packaged') {
        return sum + (Number(b.totalQuantity) || 0);
      }
      return sum;
    }, 0);
  }, [batches]);

  // Readily packed metrics from finished goods packaging inventory
  const totalPackedUnits = useMemo(() => {
    return packagingLogs.reduce((sum, p) => sum + (Number(p.unitsPacked) || 0), 0);
  }, [packagingLogs]);

  const totalPackedKg = useMemo(() => {
    const sum = packagingLogs.reduce((acc, p) => acc + (Number(p.totalKg) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [packagingLogs]);

  // Available to dispatch: Finished inventory remaining in storage bays ready for shipping
  const availableToDispatchUnits = useMemo(() => {
    return packagingLogs.reduce((sum, p) => {
      const rem = p.unitsRemaining !== undefined ? p.unitsRemaining : Math.max(0, (p.unitsPacked || 0) - (p.unitsDispatched || 0));
      return sum + rem;
    }, 0);
  }, [packagingLogs]);

  const availableToDispatchKg = useMemo(() => {
    const sum = packagingLogs.reduce((acc, p) => {
      const rem = p.unitsRemaining !== undefined ? p.unitsRemaining : Math.max(0, (p.unitsPacked || 0) - (p.unitsDispatched || 0));
      const size = p.packageSizeGrams || 100;
      return acc + (rem * size) / 1000;
    }, 0);
    return Math.round(sum * 100) / 100;
  }, [packagingLogs]);

  // Dispatched count metrics (Outbound logistics fulfillment)
  const totalDispatchedOrders = dispatches.length;
  const totalUnitsDispatched = useMemo(() => {
    return dispatches.reduce((sum, d) => sum + (Number(d.totalUnits) || 0), 0);
  }, [dispatches]);

  const totalKgDispatched = useMemo(() => {
    const sum = dispatches.reduce((acc, d) => acc + (Number(d.totalWeightKg) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [dispatches]);

  // Total Quality Control readings logged across all facility batches
  const totalQcReadingsCount = useMemo(() => {
    return batches.reduce((sum, b) => sum + (b.progressReadings?.length || 0), 0);
  }, [batches]);

  // Comprehensive Product Flow Matrix for Production Lead & Admin
  const productFlowMatrix = useMemo(() => {
    return products.map((prod) => {
      // 1. Raw Material In Stock (Available unallocated)
      const rawInStock = harvestLogs
        .filter((l) => l.productId === prod.id)
        .reduce((sum, l) => {
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

      // 2. In chamber processing
      const inProcessing = batches
        .filter((b) => b.productId === prod.id && b.status === 'processing')
        .reduce((sum, b) => sum + (Number(b.totalQuantity) || 0), 0);

      const processingBatchCount = batches.filter((b) => b.productId === prod.id && b.status === 'processing').length;

      // 3. Dried stock produced
      const driedOutput = batches
        .filter((b) => b.productId === prod.id && (b.status === 'ready' || b.status === 'packaged'))
        .reduce((sum, b) => {
          if (b.driedOutputQuantity !== undefined && b.driedOutputQuantity > 0) {
            return sum + Number(b.driedOutputQuantity);
          }
          return sum + (Number(b.totalQuantity) || 0);
        }, 0);

      // 4. Readily packed in packaging inventory
      const packedRecords = packagingLogs.filter((pkg) => pkg.productId === prod.id);
      const packedUnits = packedRecords.reduce((sum, p) => sum + (Number(p.unitsPacked) || 0), 0);
      const packedKg = Math.round(packedRecords.reduce((sum, p) => sum + (Number(p.totalKg) || 0), 0) * 100) / 100;

      // 5. Available to dispatch
      const dispatchReadyUnits = packedRecords.reduce((sum, p) => {
        const rem = p.unitsRemaining !== undefined ? p.unitsRemaining : Math.max(0, (p.unitsPacked || 0) - (p.unitsDispatched || 0));
        return sum + rem;
      }, 0);
      const dispatchReadyKg = Math.round(
        packedRecords.reduce((sum, p) => {
          const rem = p.unitsRemaining !== undefined ? p.unitsRemaining : Math.max(0, (p.unitsPacked || 0) - (p.unitsDispatched || 0));
          const size = p.packageSizeGrams || 100;
          return sum + (rem * size) / 1000;
        }, 0) * 100
      ) / 100;

      return {
        product: prod,
        rawInStock,
        inProcessing,
        processingBatchCount,
        driedOutput,
        packedUnits,
        packedKg,
        dispatchReadyUnits,
        dispatchReadyKg,
      };
    });
  }, [products, harvestLogs, batches, packagingLogs]);

  // Quick QC Check Submission Handler
  const handleQuickQcSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcModalBatch) return;
    setIsLoggingQc(true);
    try {
      let metricLabel = 'QC Check';
      if (qcTemp.trim() && qcHumidity.trim()) {
        metricLabel = `Temp: ${qcTemp.trim()}°C | RH: ${qcHumidity.trim()}%`;
      } else if (qcTemp.trim()) {
        metricLabel = `Temperature: ${qcTemp.trim()}°C`;
      } else if (qcHumidity.trim()) {
        metricLabel = `Humidity: ${qcHumidity.trim()}%`;
      }

      const fullNote = [
        qcNotes.trim() || 'Quality Control Temperature & Condition Check verified',
        qcTemp ? `Maintained Temp: ${qcTemp}°C` : null,
        qcHumidity ? `Chamber RH: ${qcHumidity}%` : null,
      ].filter(Boolean).join(' • ');

      await addProgressReading(
        farm.id,
        qcModalBatch.id,
        qcModalBatch.progressReadings || [],
        {
          note: fullNote,
          metric: metricLabel,
          loggedByUid: member.uid,
          loggedByName: member.email || 'Quality Inspector',
          loggedByRole: member.roleLabel || 'Quality Inspector',
        }
      );

      const newReading = {
        id: 'read_' + Date.now(),
        timestamp: new Date().toISOString(),
        note: fullNote,
        metric: metricLabel,
        loggedByUid: member.uid,
        loggedByName: member.email || 'Quality Inspector',
        loggedByRole: member.roleLabel || 'Quality Inspector',
      };

      const updatedBatch: ProductionBatch = {
        ...qcModalBatch,
        progressReadings: [...(qcModalBatch.progressReadings || []), newReading],
        updatedAt: new Date(),
      };

      if (onBatchUpdated) {
        onBatchUpdated(updatedBatch);
      }

      setFeedback({
        type: 'success',
        message: `QC Reading recorded successfully for Batch #${qcModalBatch.id.slice(-6)} (${qcModalBatch.productName})!`,
      });
      setQcModalBatch(null);
      setQcTemp('');
      setQcHumidity('');
      setQcNotes('');
    } catch (err: any) {
      console.error('Failed to log QC check:', err);
      setFeedback({
        type: 'error',
        message: 'Failed to record QC check: ' + (err?.message || 'Server error'),
      });
    } finally {
      setIsLoggingQc(false);
    }
  };

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

  // Quick QC Temperature & Condition Check Modal (shared across views)
  const renderQcModal = () => {
    if (!qcModalBatch) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Modal Header */}
          <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300">
                  <Thermometer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Log Quality Control Check
                  </h3>
                  <p className="text-xs text-blue-200 font-mono">
                    Batch #{qcModalBatch.id.slice(-6)} • {qcModalBatch.productName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQcModalBatch(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <form onSubmit={handleQuickQcSubmit} className="p-6 space-y-4">
            {/* Prescribed targets reference */}
            <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs gap-2">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Target Temp:</span>{' '}
                <strong className="text-blue-900 dark:text-blue-300">
                  {qcModalBatch.conditions?.temperature || '45°C - 55°C'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Target RH:</span>{' '}
                <strong className="text-blue-900 dark:text-blue-300">
                  {qcModalBatch.conditions?.humidity || '< 25% RH'}
                </strong>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Process:</span>{' '}
                <strong className="capitalize text-slate-700 dark:text-slate-200">
                  {qcModalBatch.processingType || 'Dehydration'}
                </strong>
              </div>
            </div>

            {/* Temperature & Humidity Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chamber Temp (°C) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={qcTemp}
                    onChange={(e) => setQcTemp(e.target.value)}
                    placeholder="e.g. 48.5"
                    className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <Thermometer className="w-4 h-4 text-amber-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chamber Humidity (% RH)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={qcHumidity}
                    onChange={(e) => setQcHumidity(e.target.value)}
                    placeholder="e.g. 21"
                    className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <Droplets className="w-4 h-4 text-blue-500 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            {/* Quick condition check preset chips */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Quick Inspection Observations
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Target temperature strictly maintained',
                  'Trays rotated for uniform drying',
                  'Aroma sweet & color vibrant',
                  'Zero mold / foreign matter',
                  'Crisp texture, moisture optimal (<7%)',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setQcNotes((prev) => (prev ? `${prev}; ${preset}` : preset));
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 transition text-left"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Detailed Evaluation Note */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Inspection Notes &amp; Observations
              </label>
              <textarea
                rows={2}
                value={qcNotes}
                onChange={(e) => setQcNotes(e.target.value)}
                placeholder="Sensory checks, moisture probe readings, or chamber observations..."
                className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Inspector Footnote */}
            <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl flex items-center justify-between">
              <span>Inspector: <strong>{member.email}</strong> ({member.roleLabel || 'Quality Inspector'})</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Authorized</span>
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setQcModalBatch(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoggingQc || !qcTemp.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center space-x-1.5 disabled:opacity-50"
              >
                {isLoggingQc ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Commit QC Record</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------
  // QUALITY INSPECTOR VIEW:
  // Dedicated dashboard showing how many batches are running,
  // active inspection board with direct QC temperature/condition logging,
  // packaging and storage control, and dispatch fulfillment metrics.
  // -------------------------------------------------------------
  if (isQC) {
    return (
      <div id="quality-inspector-dashboard" className="space-y-6">
        {/* QI Command Center Header */}
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-6 rounded-2xl border border-blue-900/50 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>Quality Assurance &amp; Inspection Command Center</span>
                <span>•</span>
                <span>{farm.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                  QUALITY INSPECTOR AUTHORIZED
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
                <span>Quality Inspector Dashboard</span>
              </h1>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Logged in as <strong className="text-white">{member.email}</strong> ({member.roleLabel || 'Quality Inspector'}). Real-time monitoring of running production batches, sensory evaluations, temperature/condition logging, and packaging certification.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadAuxiliaryData}
                disabled={isLoadingAuxData}
                className="flex items-center space-x-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-semibold backdrop-blur-sm transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAuxData ? 'animate-spin text-blue-400' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => onNavigateTab('batches')}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Batches Section</span>
              </button>
              <button
                onClick={() => onNavigateTab('packaging')}
                className="flex items-center space-x-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow transition"
                title="Manage Packaging & Storage"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Packaging &amp; Storage</span>
              </button>
              <button
                onClick={() => onNavigateTab('dispatch')}
                className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition"
                title="View Outbound Dispatches"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Dispatches</span>
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

        {/* 5 Core QI KPI Metrics (Highlighting: How Many Batches Are Running!) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Tile 1: Running Batches (Core User Requirement) */}
          <div
            id="tile-qi-running-batches"
            onClick={() => onNavigateTab('batches')}
            className={`p-4 rounded-xl border shadow-xs transition cursor-pointer group ${
              runningBatches.length > 0
                ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className={runningBatches.length > 0 ? 'text-blue-800 dark:text-blue-300 font-bold' : ''}>
                Running Batches
              </span>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  runningBatches.length > 0
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                }`}
              >
                <Activity className="w-4 h-4 animate-pulse" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span
                className={`text-2xl font-bold font-mono ${
                  runningBatches.length > 0
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {runningBatches.length}
              </span>
              <span className="text-xs text-slate-500">running batch{runningBatches.length !== 1 ? 'es' : ''}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300 font-medium">
              <span>{processingBatches.length} active • {harvestedBatches.length} staged</span>
              <span className="group-hover:translate-x-0.5 transition-transform flex items-center">
                Inspect <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>

          {/* Tile 2: QC Checks Logged */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>QC Inspections</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Thermometer className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {totalQcReadingsCount}
              </span>
              <span className="text-xs text-slate-500">checkpoints logged</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Chamber temp &amp; conditions verified
            </div>
          </div>

          {/* Tile 3: Ready for Release */}
          <div
            onClick={() => onNavigateTab('batches')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Ready for Release</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {readyBatches.length}
              </span>
              <span className="text-xs text-slate-500">batches certified</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
              <span>{totalReadyQuantity.toLocaleString()} units completed</span>
              <span className="group-hover:translate-x-0.5 transition-transform flex items-center">
                Review <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>

          {/* Tile 4: Readily Packed in Storage (QI has packaging control) */}
          <div
            onClick={() => onNavigateTab('packaging')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-purple-300 dark:hover:border-purple-800 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>Readily Packed</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <PackageCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                {totalPackedUnits.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">pouches stored</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-purple-700 dark:text-purple-400">
              <span>{totalPackedKg} kg inventory</span>
              <span className="group-hover:translate-x-0.5 transition-transform flex items-center">
                Storage <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>

          {/* Tile 5: Dispatched Count */}
          <div
            id="tile-qi-dispatched-count"
            onClick={() => onNavigateTab('dispatch')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className="text-indigo-700 dark:text-indigo-300 font-bold">Dispatched Count</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-indigo-700 dark:text-indigo-300">
                {totalDispatchedOrders}
              </span>
              <span className="text-xs text-slate-500">orders dispatched</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{totalUnitsDispatched} units shipped</span>
              <span className="text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center">
                Fulfillment <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </div>
        </div>

        {/* Active Running Batches Inspection Board */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-pulse" />
                <span>Running Production Batches Awaiting QC Oversight ({runningBatches.length})</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Inspect live drying/processing chambers, verify thermal thresholds, and commit temperature and condition checkpoints.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {processingBatches.length} In Chamber • {harvestedBatches.length} Staged
              </span>
            </div>
          </div>

          {runningBatches.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-3">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500/60" />
              <div className="font-semibold text-sm text-slate-700 dark:text-slate-300">
                All facility batches are currently completed or packaged
              </div>
              <p className="text-xs max-w-md mx-auto">
                There are no live running batches in chamber processing right now. When a new batch is initiated by the Production Lead, it will immediately appear here for your QC temperature and condition checks.
              </p>
              <button
                onClick={() => onNavigateTab('batches')}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                View Batch Records &amp; History
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {runningBatches.map((batch) => {
                const readings = batch.progressReadings || [];
                const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

                return (
                  <div
                    key={batch.id}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 hover:border-blue-300 dark:hover:border-blue-700 transition space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {batch.productName}
                          </span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                            #{batch.id.slice(-6)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center space-x-2">
                          <span className="capitalize">{batch.processingType || 'Standard'} processing</span>
                          <span>•</span>
                          <span>{batch.totalQuantity} {batch.unit || 'kg'} raw intake</span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center space-x-1 shrink-0 ${
                          batch.status === 'processing'
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        <span>{batch.status === 'processing' ? 'In Processing' : 'Intake Staged'}</span>
                      </span>
                    </div>

                    {/* Prescribed Environmental Targets */}
                    <div className="grid grid-cols-2 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                      <div className="flex items-center space-x-1.5">
                        <Thermometer className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block leading-tight">Target Temp</span>
                          <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                            {batch.conditions?.temperature || '45°C - 55°C'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <Droplets className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block leading-tight">Target Humidity</span>
                          <span className="font-semibold font-mono text-slate-800 dark:text-slate-200">
                            {batch.conditions?.humidity || '< 25% RH'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Latest QC Reading Status */}
                    <div className="text-xs bg-slate-100/70 dark:bg-slate-800/60 p-2.5 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Latest QC Check:</span>
                        <span className="text-slate-400">{readings.length} total logged</span>
                      </div>
                      {latestReading ? (
                        <div className="text-slate-800 dark:text-slate-200">
                          <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>{latestReading.metric || 'Verified Check'}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {latestReading.note}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            By {latestReading.loggedByName} ({latestReading.loggedByRole}) • {new Date(latestReading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ) : (
                        <div className="text-amber-600 dark:text-amber-400 text-xs italic flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Awaiting initial temperature &amp; condition check</span>
                        </div>
                      )}
                    </div>

                    {/* Quality Inspector Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => {
                          setQcModalBatch(batch);
                          setQcTemp('');
                          setQcHumidity('');
                          setQcNotes('');
                        }}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center space-x-1.5"
                      >
                        <Thermometer className="w-3.5 h-3.5" />
                        <span>Log QC Check</span>
                      </button>

                      <button
                        onClick={() => {
                          onSelectBatch(batch.id);
                          onNavigateTab('batches');
                        }}
                        className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold transition flex items-center space-x-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Batch Details</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Packaging & Storage Reference */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Package className="w-4 h-4 text-purple-600" />
              <span>Packaging &amp; Storage Authority</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              As Quality Inspector, you possess authorized packing and storage controls to verify batch codes, assign produce grades (Grade A / Grade B), and seal finished pouches into inventory.
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('packaging')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow transition shrink-0 flex items-center space-x-1.5"
          >
            <PackageCheck className="w-4 h-4" />
            <span>Open Packaging &amp; Storage</span>
          </button>
        </div>

        {/* Render QC Modal if active */}
        {renderQcModal()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // PRODUCTION LEAD VIEW:
  // Shows how much raw material we have, how much we are processing,
  // how much dried output, how much is readily packed, available to dispatch,
  // and dispatched count metrics.
  // -------------------------------------------------------------
  if (isLead) {
    return (
      <div id="production-lead-dashboard" className="space-y-6">
        {/* Production Lead Portal Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white p-6 rounded-2xl border border-emerald-900/50 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Production Operations &amp; Material Flow Pipeline</span>
                <span>•</span>
                <span>{farm.name}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  PRODUCTION LEAD AUTHORIZED
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
                <span>Production Lead Dashboard</span>
              </h1>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                Logged in as <strong className="text-white">{member.email}</strong> ({member.roleLabel || 'Production Lead'}). Complete oversight of raw material intake, active dehydration runs, dried output, warehouse packaged storage, and ready-to-dispatch stocks.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigateTab('batches')}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Start New Batch</span>
              </button>
              <button
                onClick={() => onNavigateTab('intake')}
                className="flex items-center space-x-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Log Raw Intake</span>
              </button>
              <button
                onClick={() => onNavigateTab('packaging')}
                className="flex items-center space-x-1.5 px-3 py-2 bg-purple-600/80 hover:bg-purple-600 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Storage Stock</span>
              </button>
              <button
                onClick={() => onNavigateTab('dispatch')}
                className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Dispatches</span>
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

        {/* 6 Core Operational Metric Cards (Explicitly matching user request) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Card 1: Raw Material We Have */}
          <div
            onClick={() => onNavigateTab('intake')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border-2 border-emerald-500/40 shadow-xs hover:border-emerald-500 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className="text-emerald-700 dark:text-emerald-400 font-bold">1. Raw Material We Have</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300">
                {totalAvailableStock.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">units available</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {totalIntakeQuantity.toLocaleString()} total intake received ({stockUtilizationPct}% allocated)
            </div>
          </div>

          {/* Card 2: How much we processing */}
          <div
            onClick={() => onNavigateTab('batches')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border-2 border-blue-500/40 shadow-xs hover:border-blue-500 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className="text-blue-700 dark:text-blue-400 font-bold">2. How Much We Processing</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Flame className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold font-mono text-blue-700 dark:text-blue-300">
                {totalProcessingQuantity.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">units processing</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Across {processingBatches.length} active chamber batches ({harvestedBatches.length} staged)
            </div>
          </div>

          {/* Card 3: How much dried */}
          <div
            onClick={() => onNavigateTab('batches')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border-2 border-amber-500/40 shadow-xs hover:border-amber-500 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className="text-amber-700 dark:text-amber-400 font-bold">3. How Much Dried</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-300">
                {totalDriedOutputQuantity.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">kg dried output</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              From {readyBatches.length + packagedBatches.length} completed dehydration batches
            </div>
          </div>

          {/* Card 4: How much is readily packed */}
          <div
            onClick={() => onNavigateTab('packaging')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border-2 border-purple-500/40 shadow-xs hover:border-purple-500 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className="text-purple-700 dark:text-purple-400 font-bold">4. Readily Packed</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <PackageCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold font-mono text-purple-700 dark:text-purple-300">
                {totalPackedUnits.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">units in storage</span>
            </div>
            <div className="mt-2 text-[11px] text-purple-700 dark:text-purple-400 font-semibold">
              {totalPackedKg} kg finished packaging inventory
            </div>
          </div>

          {/* Card 5: Available to dispatch */}
          <div
            onClick={() => onNavigateTab('dispatch')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border-2 border-teal-500/40 shadow-xs hover:border-teal-500 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className="text-teal-700 dark:text-teal-400 font-bold">5. Available to Dispatch</span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold font-mono text-teal-700 dark:text-teal-300">
                {availableToDispatchUnits.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">units ready</span>
            </div>
            <div className="mt-2 text-[11px] text-teal-700 dark:text-teal-400 font-semibold">
              {availableToDispatchKg} kg finished goods unallocated
            </div>
          </div>

          {/* Card 6: Dispatched Count */}
          <div
            id="tile-lead-dispatched-count"
            onClick={() => onNavigateTab('dispatch')}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border-2 border-indigo-500/40 shadow-xs hover:border-indigo-500 transition cursor-pointer group"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span className="text-indigo-700 dark:text-indigo-400 font-bold">6. Dispatched Count</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline space-x-1.5">
              <span className="text-2xl font-extrabold font-mono text-indigo-700 dark:text-indigo-300">
                {totalDispatchedOrders}
              </span>
              <span className="text-xs text-slate-500">orders shipped</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {totalUnitsDispatched} units ({totalKgDispatched} kg)
            </div>
          </div>
        </div>

        {/* Detailed End-to-End Product Flow Matrix */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>End-to-End Product Flow Matrix</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Product-by-product breakdown across Raw Material, Chamber Processing, Dried Stock, Readily Packed, and Available to Dispatch.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">
                {productFlowMatrix.length} Products Monitored
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-4 font-bold">Product Name</th>
                  <th className="py-3 px-3 font-bold text-right text-emerald-700 dark:text-emerald-400">Raw In Stock</th>
                  <th className="py-3 px-3 font-bold text-right text-blue-700 dark:text-blue-400">In Processing</th>
                  <th className="py-3 px-3 font-bold text-right text-amber-700 dark:text-amber-400">Dried Stock</th>
                  <th className="py-3 px-3 font-bold text-right text-purple-700 dark:text-purple-400">Readily Packed</th>
                  <th className="py-3 px-3 font-bold text-right text-teal-700 dark:text-teal-400">Avail. to Dispatch</th>
                  <th className="py-3 px-4 font-bold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {productFlowMatrix.map((item) => (
                  <tr key={item.product.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {item.product.name}
                      </div>
                      <div className="text-[11px] text-slate-400 capitalize">
                        {item.product.processingType || 'Dehydration'} • {item.product.unit || 'kg'}
                      </div>
                    </td>

                    {/* Raw In Stock */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {item.rawInStock.toLocaleString()} {item.product.unit || 'kg'}
                    </td>

                    {/* In Processing */}
                    <td className="py-3 px-3 text-right font-mono">
                      {item.inProcessing > 0 ? (
                        <div>
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {item.inProcessing.toLocaleString()} {item.product.unit || 'kg'}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            {item.processingBatchCount} active run{item.processingBatchCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Dried Stock */}
                    <td className="py-3 px-3 text-right font-mono">
                      {item.driedOutput > 0 ? (
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {item.driedOutput.toLocaleString()} kg
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Readily Packed */}
                    <td className="py-3 px-3 text-right font-mono">
                      {item.packedUnits > 0 ? (
                        <div>
                          <span className="font-bold text-purple-600 dark:text-purple-400">
                            {item.packedUnits.toLocaleString()} units
                          </span>
                          <div className="text-[10px] text-slate-400">
                            {item.packedKg} kg total
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">0 units</span>
                      )}
                    </td>

                    {/* Available to Dispatch */}
                    <td className="py-3 px-3 text-right font-mono">
                      {item.dispatchReadyUnits > 0 ? (
                        <div>
                          <span className="font-bold text-teal-600 dark:text-teal-400">
                            {item.dispatchReadyUnits.toLocaleString()} units
                          </span>
                          <div className="text-[10px] text-teal-600/80 dark:text-teal-400/80">
                            {item.dispatchReadyKg} kg ready
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => onStartBatchWithProduct(item.product)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition"
                          title="Start Production Batch"
                        >
                          + Batch
                        </button>
                        <button
                          onClick={() => onQuickIntake(item.product)}
                          className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-medium transition"
                          title="Record Raw Intake"
                        >
                          + Intake
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Running Batches Overview for Production Lead */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Flame className="w-4 h-4 text-blue-500" />
              <span>Active Chamber Processing Batches ({processingBatches.length})</span>
            </h3>
            <button
              onClick={() => onNavigateTab('batches')}
              className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center space-x-1"
            >
              <span>Manage Batches</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {processingBatches.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No batches are currently inside processing chambers. Start a new batch using the button above.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {processingBatches.map((batch) => (
                <div key={batch.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {batch.productName}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        #{batch.id.slice(-6)}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                        {batch.totalQuantity} {batch.unit || 'kg'} in chamber
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center space-x-3">
                      <span>Target: {batch.conditions?.temperature || '45-55°C'}</span>
                      <span>•</span>
                      <span>{batch.progressReadings?.length || 0} QC readings recorded</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        onSelectBatch(batch.id);
                        onNavigateTab('batches');
                      }}
                      className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition"
                    >
                      Inspect Run
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Production Procurement & Buffer Optimization */}
        <ProductionProcurementCard
          products={products}
          harvestLogs={harvestLogs}
          batches={batches}
          onQuickIntake={(prod) => onQuickIntake(prod)}
          onNavigateTab={onNavigateTab}
          userRoleLabel={member.roleLabel || 'Production Lead'}
        />

        {/* Render QC Modal if active */}
        {renderQcModal()}
      </div>
    );
  }

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

      {/* 5 Core Operational KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            <span>Packaged &amp; Ready</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-purple-700 dark:text-purple-300 font-mono">
              {availableToDispatchUnits.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">packets avail</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {totalPackedUnits.toLocaleString()} total packed
            </span>
            <span className="text-purple-600 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              View storage <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Card 4: Dispatched Count Tile */}
        <div
          id="tile-admin-dispatched-count"
          onClick={() => onNavigateTab('dispatch')}
          className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-sky-300 dark:hover:border-sky-800 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span className="text-sky-700 dark:text-sky-300 font-bold">Dispatched Count</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-sky-700 dark:text-sky-300 font-mono">
              {totalDispatchedOrders}
            </span>
            <span className="text-xs text-slate-500">dispatches logged</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {totalUnitsDispatched.toLocaleString()} units ({totalKgDispatched} kg)
            </span>
            <span className="text-sky-600 dark:text-sky-400 group-hover:translate-x-0.5 transition-transform flex items-center">
              Dispatches <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* Card 5: Raw Material Stock & Lineage */}
        <div
          onClick={() => onNavigateTab('intake')}
          className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-800 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Raw Material Stock</span>
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

      {/* Admin Sub-View Selector (Multi-perspective operational control) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setAdminActiveSubView('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            adminActiveSubView === 'overview'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Batch Governance & Ready Stock</span>
        </button>

        <button
          onClick={() => setAdminActiveSubView('flow')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            adminActiveSubView === 'flow'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Material Flow Matrix ({products.length} Products)</span>
        </button>

        <button
          onClick={() => setAdminActiveSubView('qc')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            adminActiveSubView === 'qc'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Thermometer className="w-3.5 h-3.5" />
          <span>Quality Control Oversight ({runningBatches.length} Running)</span>
        </button>
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

      {/* Sub-View 1: Material Flow Matrix */}
      {adminActiveSubView === 'flow' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Layers className="w-5 h-5 text-indigo-500" />
                <span>Admin View: End-to-End Product Flow Matrix</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Complete material traceability: Raw Intake → In Processing → Dried/Cured → Packaged Inventory → Dispatched
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-lg">
              {productFlowMatrix.length} Catalog Products
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-semibold">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-3 text-right">Raw Unallocated</th>
                  <th className="py-3 px-3 text-right">In Processing</th>
                  <th className="py-3 px-3 text-right">Dried Output</th>
                  <th className="py-3 px-3 text-right">Packaged Total</th>
                  <th className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">Avail to Dispatch</th>
                  <th className="py-3 px-3 text-right">Packaged Stock Weight</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {productFlowMatrix.map((row) => (
                  <tr key={row.product.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{row.product.name}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{row.product.processingType || 'Dehydrating'} • {row.product.unit}</div>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                      {row.rawInStock.toLocaleString()} {row.product.unit}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-amber-600 dark:text-amber-400 font-medium">
                      {row.inProcessing.toLocaleString()} {row.product.unit}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-teal-600 dark:text-teal-400 font-medium">
                      {row.driedOutput > 0 ? `${row.driedOutput.toLocaleString()} ${row.product.unit}` : '—'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-purple-600 dark:text-purple-400 font-medium">
                      {row.packedUnits.toLocaleString()} pkts
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">
                      {row.dispatchReadyUnits.toLocaleString()} pkts
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {row.dispatchReadyKg} kg
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onQuickIntake(row.product)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:text-emerald-300 rounded text-[11px] font-semibold transition"
                      >
                        + Intake
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-View 2: Quality Control Oversight (Running Batches with QC Log) */}
      {adminActiveSubView === 'qc' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Thermometer className="w-5 h-5 text-amber-500" />
                <span>Admin & Quality Control: Active Running Batches</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Log Quality Control Temperature &amp; Condition checks or review running drying chambers
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg">
              {runningBatches.length} Running Batches
            </span>
          </div>

          {runningBatches.length === 0 ? (
            <div className="text-center py-10 text-slate-400 space-y-2">
              <Activity className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-medium">No production batches are currently running in chambers.</p>
              <p className="text-[11px] text-slate-500">When batches are started, they will appear here for temperature and condition logging.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {runningBatches.map((batch) => {
                const latestCheck = batch.progressReadings && batch.progressReadings.length > 0
                  ? batch.progressReadings[batch.progressReadings.length - 1]
                  : null;

                return (
                  <div key={batch.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          Batch #{batch.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {batch.productName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          {batch.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>Input: <strong className="text-slate-700 dark:text-slate-300">{batch.totalQuantity || 0} {batch.unit || 'kg'}</strong></span>
                        {batch.conditions?.temperature && (
                          <span>Target Temp: <strong className="text-slate-700 dark:text-slate-300">{batch.conditions.temperature}</strong></span>
                        )}
                        {latestCheck ? (
                          <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Last Check: {latestCheck.metric || latestCheck.note || 'Recorded'}</span>
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">Awaiting initial QC reading</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={() => setQcModalBatch(batch)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition"
                      >
                        <Thermometer className="w-3.5 h-3.5" />
                        <span>Log QC Check</span>
                      </button>
                      <button
                        onClick={() => onSelectBatch(batch.id)}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition"
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
      )}

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

      {/* QC Reading Modal */}
      {renderQcModal()}
    </div>
  );
};
