import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  ProductCatalogItem,
  HarvestLog,
  ProductionBatch,
  FarmMember,
  BatchStatus,
} from '../types';
import {
  createBatch,
  addProgressReading,
  updateBatchStatus,
} from '../lib/farmService';
import { formatUnitDisplay, formatQuantityWithUnit } from '../lib/unitUtils';
import { BatchChatModal } from './BatchChatModal';
import { BatchReadyModal } from './BatchReadyModal';
import ReactMarkdown from 'react-markdown';
import {
  Boxes,
  PlusCircle,
  Sparkles,
  Bot,
  Layers,
  Thermometer,
  Droplets,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  Send,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Activity,
  FileText,
  Truck,
  ExternalLink,
  ClipboardList,
  ArrowRight,
  Scale,
} from 'lucide-react';

interface BatchSectionProps {
  farmId: string;
  farmName: string;
  user: User;
  member: FarmMember;
  products: ProductCatalogItem[];
  harvestLogs: HarvestLog[];
  batches: ProductionBatch[];
  onBatchCreated: (newBatch: ProductionBatch) => void;
  onBatchUpdated: (updatedBatch: ProductionBatch) => void;
  preselectedProduct?: ProductCatalogItem | null;
  preselectedLogs?: HarvestLog[];
  onClearPreselection?: () => void;
  onNavigateTab?: (tab: 'intake' | 'batches' | 'catalog' | 'history' | 'team') => void;
  focusedBatchId?: string | null;
  onClearFocusedBatch?: () => void;
}

export const BatchSection: React.FC<BatchSectionProps> = ({
  farmId,
  farmName,
  user,
  member,
  products,
  harvestLogs,
  batches,
  onBatchCreated,
  onBatchUpdated,
  preselectedProduct,
  preselectedLogs = [],
  onClearPreselection,
  onNavigateTab,
  focusedBatchId,
  onClearFocusedBatch,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(
    !!preselectedProduct || preselectedLogs.length > 0
  );

  // Form State
  const [selectedProductId, setSelectedProductId] = useState<string>(
    preselectedProduct?.id || (products.length > 0 ? products[0].id : '')
  );
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>(
    preselectedLogs.map((l) => l.id)
  );

  // Specific quantity drawn per selected harvest log: { [logId: string]: number }
  const [logAllocations, setLogAllocations] = useState<{ [logId: string]: number }>({});

  // Helper to compute available remaining quantity for any harvest log
  const getLogAvailableQuantity = (log: HarvestLog): number => {
    if (log.remainingQuantity !== undefined) {
      return Math.max(0, log.remainingQuantity);
    }
    const linkedBatches = batches.filter((b) => b.linkedHarvestLogIds?.includes(log.id));
    const used = linkedBatches.reduce((acc, b) => {
      const specific = b.intakeAllocations?.find((a) => a.harvestLogId === log.id)?.quantityUsed;
      return acc + (specific !== undefined ? specific : (b.totalQuantity || 0));
    }, 0);
    return Math.max(0, log.quantity - used);
  };

  // Synchronize when incoming preselected props update
  useEffect(() => {
    if (preselectedProduct) {
      setSelectedProductId(preselectedProduct.id);
      setShowCreateModal(true);
    }
    if (preselectedLogs && preselectedLogs.length > 0) {
      setSelectedLogIds(preselectedLogs.map((l) => l.id));
      const initialAlloc: { [id: string]: number } = {};
      preselectedLogs.forEach((l) => {
        initialAlloc[l.id] =
          l.remainingQuantity !== undefined ? l.remainingQuantity : getLogAvailableQuantity(l);
      });
      setLogAllocations((prev) => ({ ...prev, ...initialAlloc }));
      if (preselectedLogs[0]?.productId) {
        setSelectedProductId(preselectedLogs[0].productId);
      }
      setShowCreateModal(true);
    }
  }, [preselectedProduct, preselectedLogs]);

  // Expand and highlight focused batch if navigated from Intake view
  useEffect(() => {
    if (focusedBatchId) {
      setExpandedBatchId(focusedBatchId);
      setTimeout(() => {
        const el = document.getElementById(`batch-${focusedBatchId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }, [focusedBatchId]);

  // Environmental conditions
  const [temperature, setTemperature] = useState('50°C - 55°C (Chamber)');
  const [humidity, setHumidity] = useState('Below 25% RH');
  const [method, setMethod] = useState('Multi-tray cabinet dehydrator');
  const [duration, setDuration] = useState('24 - 36 hours');
  const [targetCriteria, setTargetCriteria] = useState(
    'Crisp snap test, residual moisture < 7%, vibrant natural color'
  );
  const [customNotes, setCustomNotes] = useState('');

  // AI Generation State
  const [generatedSchedule, setGeneratedSchedule] = useState<string>('');
  const [scheduleModelUsed, setScheduleModelUsed] = useState<string>('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Active Batch Details & Chat Modal State
  const [activeChatBatch, setActiveChatBatch] = useState<ProductionBatch | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [viewingScheduleBatch, setViewingScheduleBatch] = useState<ProductionBatch | null>(null);

  // Ready Status Transition & Next Steps Modal
  const [readyModalData, setReadyModalData] = useState<{
    batch: ProductionBatch;
    slackNotified: boolean;
  } | null>(null);

  // Progress Reading sub-state per batch
  const [newReadingNote, setNewReadingNote] = useState<{ [batchId: string]: string }>({});
  const [newReadingMetric, setNewReadingMetric] = useState<{ [batchId: string]: string }>({});
  const [isSubmittingReading, setIsSubmittingReading] = useState<{ [batchId: string]: boolean }>({});

  // Status update loading state
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<{ [batchId: string]: boolean }>({});

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Compute set of harvest log IDs that have zero remaining stock
  const exhaustedHarvestLogIds = useMemo(() => {
    const set = new Set<string>();
    harvestLogs.forEach((l) => {
      if (getLogAvailableQuantity(l) <= 0) {
        set.add(l.id);
      }
    });
    return set;
  }, [harvestLogs, batches]);

  // Available harvest logs for the selected product
  const availableLogs = useMemo(() => {
    return harvestLogs.filter((l) => l.productId === selectedProductId);
  }, [harvestLogs, selectedProductId]);

  // Unallocated logs (fresh intake deliveries or deliveries with remaining unallocated stock)
  const unallocatedLogs = useMemo(() => {
    return availableLogs.filter((l) => !exhaustedHarvestLogIds.has(l.id));
  }, [availableLogs, exhaustedHarvestLogIds]);

  // Calculate total quantity strictly from selected logs and their allocated draw amounts
  const calculatedQuantity = useMemo(() => {
    return selectedLogIds.reduce((sum, logId) => {
      const log = harvestLogs.find((l) => l.id === logId);
      if (!log) return sum;
      const maxAvailable = getLogAvailableQuantity(log);
      const allocated =
        logAllocations[logId] !== undefined ? logAllocations[logId] : maxAvailable;
      return sum + Math.max(0, Math.min(maxAvailable, Number(allocated) || 0));
    }, 0);
  }, [selectedLogIds, logAllocations, harvestLogs, batches]);

  // Handle product dropdown change with intake awareness
  const handleProductChange = (newProdId: string) => {
    setSelectedProductId(newProdId);
    const logsForNewProd = harvestLogs.filter((l) => l.productId === newProdId);
    // Auto-select logs with remaining unallocated stock
    const freshLogs = logsForNewProd.filter((l) => getLogAvailableQuantity(l) > 0);
    if (freshLogs.length > 0) {
      setSelectedLogIds(freshLogs.map((l) => l.id));
      const initialAlloc: { [id: string]: number } = {};
      freshLogs.forEach((l) => {
        initialAlloc[l.id] = getLogAvailableQuantity(l);
      });
      setLogAllocations((prev) => ({ ...prev, ...initialAlloc }));
    } else {
      setSelectedLogIds([]);
    }
    setGeneratedSchedule('');
  };

  // Generate AI Schedule using Gemini with Resilient Fallback Ladder
  const handleGenerateAISchedule = async () => {
    if (!selectedProduct) return;
    setIsGeneratingAI(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/batches/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selectedProduct.name,
          processingType: selectedProduct.processingType,
          conditions: {
            temperature,
            humidity,
            method,
            duration,
            targetCriteria,
            customNotes,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || data.error || 'Schedule generation failed');
      }

      setGeneratedSchedule(data.schedule);
      setScheduleModelUsed(data.modelUsed || 'gemini-3.6-flash');
      setFeedback({
        type: 'success',
        message: `Schedule generated successfully with ${data.modelUsed || 'Gemini'}!`,
      });
    } catch (err: any) {
      console.error('Error generating AI schedule:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Could not generate schedule from Gemini API.',
      });
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Create Batch
  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    // Strict Requirement: A batch CANNOT be started without raw material intake update!
    if (selectedLogIds.length === 0 || calculatedQuantity <= 0) {
      setFeedback({
        type: 'error',
        message:
          'Raw material intake update required: You must link at least one raw material delivery record with allocated quantity > 0 before launching a production batch.',
      });
      return;
    }

    setFeedback(null);
    setIsCreatingBatch(true);

    // Build structured intake allocations array
    const intakeAllocations = selectedLogIds.map((logId) => {
      const log = harvestLogs.find((l) => l.id === logId);
      const maxAvailable = log ? getLogAvailableQuantity(log) : 0;
      const allocatedAmt =
        logAllocations[logId] !== undefined ? logAllocations[logId] : maxAvailable;
      return {
        harvestLogId: logId,
        quantityUsed: Math.max(0, Math.min(maxAvailable, Number(allocatedAmt) || 0)),
      };
    });

    try {
      const batchData = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        processingType: selectedProduct.processingType,
        linkedHarvestLogIds: selectedLogIds,
        intakeAllocations,
        totalQuantity: calculatedQuantity,
        unit: selectedProduct.unit,
        conditions: {
          temperature,
          humidity,
          method,
          duration,
          targetCriteria,
          customNotes,
        },
        schedule: generatedSchedule || 'Standard processing schedule initialized.',
        scheduleModelUsed: scheduleModelUsed || 'gemini-3.6-flash',
      };

      const newBatchId = await createBatch(farmId, batchData);
      const createdBatchObj: ProductionBatch = {
        id: newBatchId,
        ...batchData,
        status: 'processing',
        progressReadings: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      onBatchCreated(createdBatchObj);
      setShowCreateModal(false);
      if (onClearPreselection) onClearPreselection();
      setFeedback({
        type: 'success',
        message: `Batch #${newBatchId.slice(-6)} (${selectedProduct.name}) launched with ${calculatedQuantity} ${selectedProduct.unit} allocated from raw material intake!`,
      });
    } catch (err: any) {
      console.error('Error creating batch:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to create production batch in Firestore.',
      });
    } finally {
      setIsCreatingBatch(false);
    }
  };

  // Add progress reading (Workers & Admins permitted)
  const handleAddReading = async (batch: ProductionBatch) => {
    const note = (newReadingNote[batch.id] || '').trim();
    const metric = (newReadingMetric[batch.id] || '').trim();
    if (!note) return;

    setIsSubmittingReading((prev) => ({ ...prev, [batch.id]: true }));
    try {
      await addProgressReading(farmId, batch.id, batch.progressReadings || [], {
        note,
        metric: metric || 'Observation',
        loggedByUid: user.uid,
        loggedByName: user.displayName || user.email || 'Team Member',
        loggedByRole: member.roleLabel || member.permissionTier,
      });

      const updatedReadings = [
        ...(batch.progressReadings || []),
        {
          id: 'read_' + Date.now(),
          timestamp: new Date().toISOString(),
          note,
          metric: metric || 'Observation',
          loggedByUid: user.uid,
          loggedByName: user.displayName || user.email || 'Team Member',
          loggedByRole: member.roleLabel || member.permissionTier,
        },
      ];

      onBatchUpdated({ ...batch, progressReadings: updatedReadings });
      setNewReadingNote((prev) => ({ ...prev, [batch.id]: '' }));
      setNewReadingMetric((prev) => ({ ...prev, [batch.id]: '' }));
    } catch (err: any) {
      console.error('Error adding progress reading:', err);
      alert('Could not save progress reading.');
    } finally {
      setIsSubmittingReading((prev) => ({ ...prev, [batch.id]: false }));
    }
  };

  // Status transition handler (Restricted to Admin for 'ready' and 'packaged')
  const handleStatusChange = async (batch: ProductionBatch, targetStatus: BatchStatus) => {
    if (member.permissionTier !== 'admin' && (targetStatus === 'ready' || targetStatus === 'packaged')) {
      alert('Access Denied: Only Admins can mark a batch Ready or Packaged.');
      return;
    }

    setIsUpdatingStatus((prev) => ({ ...prev, [batch.id]: true }));
    try {
      // 1. Update Firestore status
      await updateBatchStatus(farmId, batch.id, targetStatus);

      // 2. If marking Ready, trigger server-side logistics notification (Slack webhook if configured)
      let slackNotified = false;
      if (targetStatus === 'ready') {
        try {
          const res = await fetch('/api/batches/notify-ready', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId: batch.id,
              productName: batch.productName,
              quantity: batch.totalQuantity,
              unit: batch.unit,
              farmName: farmName || 'Facility',
              readyAt: new Date().toISOString(),
            }),
          });
          const resData = await res.json();
          slackNotified = Boolean(resData?.notified);
        } catch (notifyErr) {
          console.warn('Non-blocking ready notification failed:', notifyErr);
        }
      }

      const updatedBatch: ProductionBatch = {
        ...batch,
        status: targetStatus,
        readyAt: targetStatus === 'ready' ? new Date() : batch.readyAt,
      };

      onBatchUpdated(updatedBatch);

      // 3. If transitioning to 'ready', open the popup showing status update and what to do next!
      if (targetStatus === 'ready') {
        setReadyModalData({
          batch: updatedBatch,
          slackNotified,
        });
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      alert('Failed to update batch status in database.');
    } finally {
      setIsUpdatingStatus((prev) => ({ ...prev, [batch.id]: false }));
    }
  };

  const getStatusBadge = (status: BatchStatus) => {
    switch (status) {
      case 'harvested':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            Intake / Harvested
          </span>
        );
      case 'processing':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800 flex items-center space-x-1">
            <Activity className="w-3 h-3 animate-pulse" />
            <span>In Processing</span>
          </span>
        );
      case 'ready':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Ready for Distribution</span>
          </span>
        );
      case 'packaged':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center space-x-1">
            <Truck className="w-3 h-3" />
            <span>Packaged &amp; Dispatched</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Notice Banner if zero raw material intake logs exist across the facility */}
      {harvestLogs.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start space-x-3">
            <ClipboardList className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Raw Material Intake Required Before Starting Batches
              </h3>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                Your facility does not have any raw material deliveries logged yet. Every production run must be linked to raw material intake records to track origin, quantity, and lineage.
              </p>
            </div>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('intake')}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow transition shrink-0 self-start sm:self-auto flex items-center space-x-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Log Raw Material Intake</span>
            </button>
          )}
        </div>
      )}

      {/* Header & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Boxes className="w-5 h-5 text-emerald-500" />
            <span>Production Batches &amp; AI Schedules</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Grounded multi-turn AI advice, conditions monitoring, and readiness workflows
          </p>
        </div>

        <button
          onClick={() => {
            if (harvestLogs.length === 0) {
              setFeedback({
                type: 'error',
                message:
                  'Raw material intake required: You must record at least one raw material intake delivery before starting a production batch.',
              });
              if (onNavigateTab) {
                onNavigateTab('intake');
              }
              return;
            }
            setShowCreateModal(true);
            setFeedback(null);
          }}
          className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Production Batch</span>
        </button>
      </div>

      {/* Global feedback banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Create Batch Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Initialize Batch &amp; AI Schedule
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Gemini generates precision criteria for your specific conditions
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleCreateBatch} className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Product selector */}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  Target Product from Catalog
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-emerald-500"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.unit} • {p.processingType})
                    </option>
                  ))}
                </select>
              </div>

              {/* Linked Harvest Logs Checklist & Raw Material Intake Enforcement */}
              {availableLogs.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2.5">
                  <div className="flex items-start space-x-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        Raw Material Intake Required
                      </h4>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">
                        No raw material intake deliveries have been recorded for{' '}
                        <strong>{selectedProduct?.name || 'this product'}</strong>. A production batch cannot be initiated without an intake update.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      if (onNavigateTab) {
                        onNavigateTab('intake');
                      }
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow transition"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Log Raw Material Intake First</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="block font-semibold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                      <Scale className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Link Raw Material Intake Records (Required *):</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {selectedLogIds.length} of {availableLogs.length} selected
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Select intake delivery records and specify how much quantity to draw for this batch (supports partial draws):
                  </p>

                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {availableLogs.map((log) => {
                      const maxAvailable = getLogAvailableQuantity(log);
                      const isExhausted = maxAvailable <= 0;
                      const isSelected = selectedLogIds.includes(log.id);
                      const allocatedAmt =
                        logAllocations[log.id] !== undefined
                          ? logAllocations[log.id]
                          : maxAvailable;
                      const remainingAfter = Math.max(
                        0,
                        Math.round((maxAvailable - (Number(allocatedAmt) || 0)) * 100) / 100
                      );

                      return (
                        <div
                          key={log.id}
                          className={`p-2.5 rounded-xl border transition text-[11px] ${
                            isExhausted
                              ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'
                              : isSelected
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-white shadow-xs'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <label className="flex items-start space-x-2.5 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                disabled={isExhausted}
                                checked={isSelected && !isExhausted}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLogIds([...selectedLogIds, log.id]);
                                    setLogAllocations((prev) => ({
                                      ...prev,
                                      [log.id]: prev[log.id] ?? maxAvailable,
                                    }));
                                  } else {
                                    setSelectedLogIds(selectedLogIds.filter((id) => id !== log.id));
                                  }
                                }}
                                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 mt-0.5"
                              />
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                                  <span>
                                    {log.quantity} {formatUnitDisplay(log.unit)} delivery
                                  </span>
                                  <span className="font-normal text-slate-500">
                                    — {log.notes || 'Intake delivery'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Logged by {log.loggedByName || 'Staff'} ({log.loggedByRole || 'Team'}) •{' '}
                                  {log.harvestedAt?.toDate
                                    ? log.harvestedAt.toDate().toLocaleDateString()
                                    : 'Recent intake'}
                                </div>
                              </div>
                            </label>

                            <div className="flex items-center space-x-1.5 shrink-0">
                              {isExhausted ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
                                  Exhausted (All used)
                                </span>
                              ) : maxAvailable < log.quantity ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold border border-amber-300 dark:border-amber-800">
                                  {maxAvailable} {formatUnitDisplay(log.unit)} remaining in stock
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium">
                                  Full {log.quantity} {formatUnitDisplay(log.unit)} available
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Interactive Draw / Allocation Sub-panel for checked intake */}
                          {isSelected && !isExhausted && (
                            <div className="mt-2.5 pt-2 border-t border-emerald-200 dark:border-emerald-800/60 pl-6 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-1">
                                <label className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                  Draw quantity for this batch ({formatUnitDisplay(log.unit)}):
                                </label>
                                <span className="text-[10px] text-slate-500">
                                  Max available: <strong>{maxAvailable} {formatUnitDisplay(log.unit)}</strong>
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min="0.1"
                                  max={maxAvailable}
                                  step="any"
                                  value={allocatedAmt}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    const clamped = isNaN(val)
                                      ? 0
                                      : Math.max(0, Math.min(maxAvailable, val));
                                    setLogAllocations((prev) => ({
                                      ...prev,
                                      [log.id]: clamped,
                                    }));
                                  }}
                                  className="w-28 px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-emerald-500"
                                />
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                  {formatUnitDisplay(log.unit)}
                                </span>

                                {/* Dynamic percentage shortcuts */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLogAllocations((prev) => ({
                                      ...prev,
                                      [log.id]: maxAvailable,
                                    }));
                                  }}
                                  className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-300 rounded border border-emerald-300 dark:border-emerald-700 transition"
                                >
                                  100% (All {maxAvailable})
                                </button>
                                {maxAvailable >= 10 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const threeFourths = Math.round((maxAvailable * 0.75) * 10) / 10;
                                      setLogAllocations((prev) => ({
                                        ...prev,
                                        [log.id]: threeFourths,
                                      }));
                                    }}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 transition"
                                  >
                                    75% ({Math.round((maxAvailable * 0.75) * 10) / 10})
                                  </button>
                                )}
                                {maxAvailable >= 4 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const half = Math.round((maxAvailable * 0.5) * 10) / 10;
                                      setLogAllocations((prev) => ({
                                        ...prev,
                                        [log.id]: half,
                                      }));
                                    }}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 transition"
                                  >
                                    50% ({Math.round((maxAvailable * 0.5) * 10) / 10})
                                  </button>
                                )}
                                {maxAvailable >= 10 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const quarter = Math.round((maxAvailable * 0.25) * 10) / 10;
                                      setLogAllocations((prev) => ({
                                        ...prev,
                                        [log.id]: quarter,
                                      }));
                                    }}
                                    className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 transition"
                                  >
                                    25% ({Math.round((maxAvailable * 0.25) * 10) / 10})
                                  </button>
                                )}
                              </div>

                              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                Allocating <strong>{allocatedAmt} {formatUnitDisplay(log.unit)}</strong> →{' '}
                                <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  {remainingAfter} {formatUnitDisplay(log.unit)}
                                </strong>{' '}
                                will remain in intake inventory for future batches
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      Derived Total Batch Quantity:
                    </span>
                    <span
                      className={`font-bold ${
                        calculatedQuantity > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-500'
                      }`}
                    >
                      {calculatedQuantity} {selectedProduct?.unit}
                    </span>
                  </div>

                  {selectedLogIds.length === 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center space-x-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Please check at least one intake delivery record above to proceed.</span>
                    </p>
                  )}
                </div>
              )}

              {/* Environmental conditions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Operating Temperature
                  </label>
                  <input
                    type="text"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="e.g. 52°C controlled, 28°C ambient"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Humidity / Moisture Target
                  </label>
                  <input
                    type="text"
                    value={humidity}
                    onChange={(e) => setHumidity(e.target.value)}
                    placeholder="e.g. < 25% RH, Ambient 60%"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Method &amp; Equipment
                  </label>
                  <input
                    type="text"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    placeholder="e.g. Multi-tray dehydrator, Stone burr grinder"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Estimated Duration
                  </label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g. 24-36 hrs, 14 days"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    Specific Quality Criteria / Completion Checkpoints
                  </label>
                  <input
                    type="text"
                    value={targetCriteria}
                    onChange={(e) => setTargetCriteria(e.target.value)}
                    placeholder="e.g. Brittle stem snap, moisture < 7%, pH < 4.1"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* AI Schedule Generator Callout */}
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-bold text-emerald-900 dark:text-emerald-300">
                    <Bot className="w-4 h-4" />
                    <span>Gemini 3.6 Flash Processing Schedule</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateAISchedule}
                    disabled={isGeneratingAI}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center space-x-1.5 shadow transition"
                  >
                    {isGeneratingAI ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate Schedule</span>
                      </>
                    )}
                  </button>
                </div>

                {generatedSchedule ? (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-300 dark:border-emerald-800/80 max-h-48 overflow-y-auto text-[11px] prose prose-xs dark:prose-invert">
                    <ReactMarkdown>{generatedSchedule}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-400">
                    Click "Generate Schedule" to compute optimal monitoring checkpoints, sensory thresholds, and environmental control points for {selectedProduct?.name || 'this product'}.
                  </p>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    {selectedLogIds.length === 0 ? (
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Link at least one raw material intake record to launch</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>
                          {calculatedQuantity} {selectedProduct?.unit} ready to launch
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
                        isCreatingBatch ||
                        !selectedProduct ||
                        selectedLogIds.length === 0 ||
                        calculatedQuantity <= 0
                      }
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow flex items-center space-x-2 transition"
                    >
                      {isCreatingBatch ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving Batch &amp; Schedule...</span>
                        </>
                      ) : (
                        <>
                          <PlusCircle className="w-4 h-4" />
                          <span>Launch Production Batch</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Schedule Drawer / Modal */}
      {viewingScheduleBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  Schedule: {viewingScheduleBatch.productName}
                </h3>
              </div>
              <button
                onClick={() => setViewingScheduleBatch(null)}
                className="text-xs px-2 py-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto prose prose-xs dark:prose-invert max-w-none text-slate-800 dark:text-slate-200">
              <ReactMarkdown>{viewingScheduleBatch.schedule}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Active Batches List */}
      {batches.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8">
          <Boxes className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No active batches running
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Launch a production batch from your raw intake to compute Gemini processing schedules.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-3 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition"
          >
            + Create First Batch
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => {
            const isExpanded = expandedBatchId === batch.id;
            const readingCount = batch.progressReadings?.length || 0;

            return (
              <div
                key={batch.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden transition"
              >
                {/* Batch Card Header */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div>
                    <div className="flex items-center space-x-2.5">
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">
                        {batch.productName}
                      </h3>
                      {getStatusBadge(batch.status)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span>Batch #{batch.id.slice(-6)}</span>
                      <span>•</span>
                      <span>Total: <strong className="text-slate-700 dark:text-slate-200">{batch.totalQuantity} {batch.unit}</strong></span>
                      <span>•</span>
                      <span className="capitalize">{batch.processingType}</span>
                    </div>
                  </div>

                  {/* Actions Strip */}
                  <div className="flex items-center space-x-2">
                    {/* "Ask AI" Multi-turn consultation button */}
                    <button
                      onClick={() => setActiveChatBatch(batch)}
                      className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      <span>Ask AI</span>
                    </button>

                    {/* View Schedule Button */}
                    <button
                      onClick={() => setViewingScheduleBatch(batch)}
                      className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition flex items-center space-x-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Schedule</span>
                    </button>

                    {/* Expand/Collapse Readings */}
                    <button
                      onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Batch Conditions Snapshot */}
                <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/50 text-xs text-slate-600 dark:text-slate-400 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center space-x-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Temp: <strong className="text-slate-800 dark:text-slate-200">{batch.conditions.temperature || 'Ambient'}</strong></span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Droplets className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>RH: <strong className="text-slate-800 dark:text-slate-200">{batch.conditions.humidity || 'Standard'}</strong></span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Duration: <strong className="text-slate-800 dark:text-slate-200">{batch.conditions.duration || 'Flexible'}</strong></span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Readings: <strong className="text-slate-800 dark:text-slate-200">{readingCount}</strong></span>
                  </div>
                </div>

                {/* Expanded Details: Progress Readings & Status Transitions */}
                {isExpanded && (
                  <div className="p-5 space-y-5 bg-white dark:bg-slate-900">
                    {/* Status Lifecycle Controls */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                          {member.permissionTier === 'admin' ? (
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <ShieldAlert className="w-4 h-4 text-amber-500" />
                          )}
                          <span>Batch Status Lifecycle</span>
                        </div>
                        {member.permissionTier !== 'admin' && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400">
                            * Admin tier required to mark Ready or Packaged
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleStatusChange(batch, 'processing')}
                          disabled={batch.status === 'processing' || isUpdatingStatus[batch.id]}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            batch.status === 'processing'
                              ? 'bg-sky-600 text-white'
                              : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          Processing
                        </button>

                        <button
                          onClick={() => handleStatusChange(batch, 'ready')}
                          disabled={
                            batch.status === 'ready' ||
                            member.permissionTier !== 'admin' ||
                            isUpdatingStatus[batch.id]
                          }
                          title={
                            member.permissionTier !== 'admin'
                              ? 'Only Admins can mark a batch Ready'
                              : 'Mark Ready and trigger external logistics notification'
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                            batch.status === 'ready'
                              ? 'bg-emerald-600 text-white'
                              : member.permissionTier === 'admin'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Ready</span>
                        </button>

                        <button
                          onClick={() => handleStatusChange(batch, 'packaged')}
                          disabled={
                            batch.status === 'packaged' ||
                            member.permissionTier !== 'admin' ||
                            isUpdatingStatus[batch.id]
                          }
                          title={
                            member.permissionTier !== 'admin'
                              ? 'Only Admins can mark a batch Packaged'
                              : 'Mark Packaged & Dispatched'
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                            batch.status === 'packaged'
                              ? 'bg-purple-600 text-white'
                              : member.permissionTier === 'admin'
                              ? 'bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                              : 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Mark Packaged</span>
                        </button>
                      </div>
                    </div>

                    {/* Progress Readings Section */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                        <Activity className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Progress Readings &amp; Observations ({readingCount})</span>
                      </h4>

                      {/* Log New Reading Sub-form (Workers & Admins permitted) */}
                      <div className="flex flex-col sm:flex-row items-center gap-2">
                        <input
                          type="text"
                          placeholder="Reading / Metric (e.g. Moisture: 12%, pH 4.2, Weight: 42kg)"
                          value={newReadingMetric[batch.id] || ''}
                          onChange={(e) =>
                            setNewReadingMetric((prev) => ({
                              ...prev,
                              [batch.id]: e.target.value,
                            }))
                          }
                          className="w-full sm:w-1/3 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                        <input
                          type="text"
                          placeholder="Observation note (e.g. Rotated trays, texture crisping nicely)"
                          value={newReadingNote[batch.id] || ''}
                          onChange={(e) =>
                            setNewReadingNote((prev) => ({
                              ...prev,
                              [batch.id]: e.target.value,
                            }))
                          }
                          className="w-full sm:flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                        />
                        <button
                          onClick={() => handleAddReading(batch)}
                          disabled={
                            isSubmittingReading[batch.id] || !(newReadingNote[batch.id] || '').trim()
                          }
                          className="w-full sm:w-auto px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition shrink-0"
                        >
                          {isSubmittingReading[batch.id] ? 'Saving...' : 'Add Reading'}
                        </button>
                      </div>

                      {/* Readings Timeline */}
                      {readingCount === 0 ? (
                        <p className="text-xs text-slate-400 italic py-2">
                          No progress readings recorded yet. Workers can log periodic moisture, temperature, or sensory checks.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                          {batch.progressReadings.map((reading) => (
                            <div
                              key={reading.id}
                              className="p-3 text-xs bg-slate-50/50 dark:bg-slate-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {reading.metric || 'Reading'}:
                                </span>{' '}
                                <span className="text-slate-700 dark:text-slate-300">
                                  {reading.note}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center space-x-2 shrink-0">
                                <span>{reading.loggedByName} ({reading.loggedByRole})</span>
                                <span>•</span>
                                <span>{new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Batch Chat Modal */}
      {activeChatBatch && (
        <BatchChatModal
          farmId={farmId}
          batch={activeChatBatch}
          user={user}
          member={member}
          isOpen={!!activeChatBatch}
          onClose={() => setActiveChatBatch(null)}
        />
      )}

      {/* Batch Ready Confirmation & Next Steps Modal */}
      {readyModalData && (
        <BatchReadyModal
          batch={readyModalData.batch}
          isOpen={!!readyModalData}
          slackNotified={readyModalData.slackNotified}
          onClose={() => {
            setReadyModalData(null);
            setExpandedBatchId(null);
          }}
          onMarkPackaged={(batchToPackage) => {
            handleStatusChange(batchToPackage, 'packaged');
          }}
          onOpenAiConsultation={(b) => {
            setActiveChatBatch(b);
          }}
          onViewHistory={
            onNavigateTab ? () => onNavigateTab('history') : undefined
          }
          onStartNextBatch={() => {
            const freshIntakeLogs = harvestLogs.filter((l) => !exhaustedHarvestLogIds.has(l.id));
            if (freshIntakeLogs.length > 0) {
              setShowCreateModal(true);
            } else if (onNavigateTab) {
              onNavigateTab('intake');
            } else {
              setShowCreateModal(true);
            }
          }}
        />
      )}
    </div>
  );
};
