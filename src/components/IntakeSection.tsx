import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { ProductCatalogItem, HarvestLog, FarmMember, ProductionBatch } from '../types';
import { addHarvestLog, addProduct } from '../lib/farmService';
import {
  ClipboardList,
  PlusCircle,
  Search,
  Filter,
  Layers,
  Calendar,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  PackageCheck,
  Scale,
  Boxes,
} from 'lucide-react';

interface IntakeSectionProps {
  farmId: string;
  user: User;
  member: FarmMember;
  products: ProductCatalogItem[];
  harvestLogs: HarvestLog[];
  batches?: ProductionBatch[];
  onLogAdded: (newLog: HarvestLog) => void;
  onProductAdded: (newProd: ProductCatalogItem) => void;
  onStartBatchWithLogs: (selectedLogs: HarvestLog[], product: ProductCatalogItem) => void;
  preselectedProduct?: ProductCatalogItem | null;
  onSelectBatch?: (batchId: string) => void;
  onNavigateTab?: (tab: 'intake' | 'batches' | 'catalog' | 'history' | 'team') => void;
}

export const IntakeSection: React.FC<IntakeSectionProps> = ({
  farmId,
  user,
  member,
  products,
  harvestLogs,
  batches = [],
  onLogAdded,
  onProductAdded,
  onStartBatchWithLogs,
  preselectedProduct,
  onSelectBatch,
  onNavigateTab,
}) => {
  const [showLogForm, setShowLogForm] = useState(!!preselectedProduct);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    preselectedProduct?.id || (products.length > 0 ? products[0].id : '')
  );
  const [quantity, setQuantity] = useState<string>('50');
  const [notes, setNotes] = useState<string>('');

  // Inline new product modal/drawer state
  const [isInlineAddingProduct, setIsInlineAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductUnit, setNewProductUnit] = useState('kg');
  const [newProductProcess, setNewProductProcess] = useState('drying');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter states
  const [filterProductId, setFilterProductId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'ready' | 'processing' | 'exhausted'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selection for batch creation
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // Analyze intake log against batches to compute live lifecycle and inventory balances
  const getLogAnalysis = (log: HarvestLog) => {
    const linkedBatches = (batches || []).filter((b) => b.linkedHarvestLogIds?.includes(log.id));

    // Dynamic derivation of allocated and remaining quantities
    let totalAllocated = 0;
    if (log.allocatedQuantity !== undefined) {
      totalAllocated = log.allocatedQuantity;
    } else {
      totalAllocated = linkedBatches.reduce((acc, b) => {
        const specific = b.intakeAllocations?.find((a) => a.harvestLogId === log.id)?.quantityUsed;
        return acc + (specific !== undefined ? specific : (b.totalQuantity || 0));
      }, 0);
    }
    totalAllocated = Math.min(log.quantity, Math.max(0, totalAllocated));
    const remainingQuantity = Math.max(0, log.quantity - totalAllocated);

    const isFullyAllocated = remainingQuantity <= 0;
    const isPartiallyAllocated = totalAllocated > 0 && remainingQuantity > 0;
    const isFresh = totalAllocated === 0;

    const readyBatches = linkedBatches.filter((b) => b.status === 'ready');
    const processingBatches = linkedBatches.filter((b) => b.status === 'processing');
    const packagedBatches = linkedBatches.filter((b) => b.status === 'packaged');
    const latestBatch = linkedBatches[linkedBatches.length - 1];

    return {
      linkedBatches,
      totalAllocated,
      remainingQuantity,
      isFullyAllocated,
      isPartiallyAllocated,
      isFresh,
      readyBatches,
      processingBatches,
      packagedBatches,
      latestBatch,
    };
  };

  const handleInlineProductSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;
    try {
      const created = await addProduct(
        farmId,
        newProductName.trim(),
        newProductUnit.trim() || 'kg',
        newProductProcess.trim() || 'processing',
        user.uid
      );
      onProductAdded(created);
      setSelectedProductId(created.id);
      setIsInlineAddingProduct(false);
      setNewProductName('');
      setFeedback({
        type: 'success',
        message: `Created product "${created.name}" and selected for intake.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to create inline product.' });
    }
  };

  const handleLogIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!selectedProduct) {
      setFeedback({ type: 'error', message: 'Please select or add a product to log intake.' });
      return;
    }

    const numQty = parseFloat(quantity);
    if (isNaN(numQty) || numQty <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid positive quantity.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const logData = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity: numQty,
        unit: selectedProduct.unit,
        notes: notes.trim(),
        loggedByUid: user.uid,
        loggedByName: user.displayName || user.email || 'Team Member',
        loggedByRole: member.roleLabel || member.permissionTier,
      };

      const logId = await addHarvestLog(farmId, logData);
      const newLog: HarvestLog = {
        id: logId,
        ...logData,
        harvestedAt: new Date(),
      };

      onLogAdded(newLog);
      setFeedback({
        type: 'success',
        message: `Logged ${numQty} ${selectedProduct.unit} of ${selectedProduct.name} successfully.`,
      });
      setNotes('');
      setShowLogForm(false);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to log raw material intake.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredLogs = harvestLogs.filter((log) => {
    const matchesProduct = filterProductId === 'all' || log.productId === filterProductId;
    const matchesSearch =
      log.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.notes && log.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.loggedByName && log.loggedByName.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesProduct || !matchesSearch) return false;

    if (filterStatus !== 'all') {
      const analysis = getLogAnalysis(log);
      if (filterStatus === 'available') return analysis.remainingQuantity > 0;
      if (filterStatus === 'ready') return analysis.readyBatches.length > 0;
      if (filterStatus === 'processing') return analysis.processingBatches.length > 0;
      if (filterStatus === 'exhausted') return analysis.isFullyAllocated;
    }

    return true;
  });

  const toggleLogSelection = (id: string) => {
    const targetLog = harvestLogs.find((l) => l.id === id);
    if (targetLog) {
      const analysis = getLogAnalysis(targetLog);
      if (analysis.isFullyAllocated) {
        setFeedback({
          type: 'error',
          message: `Intake delivery record for ${targetLog.productName} is 100% allocated. Record new raw material intake or draw from available deliveries.`,
        });
        return;
      }
    }
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleStartBatchFromSelected = () => {
    const selected = harvestLogs.filter((l) => selectedLogIds.includes(l.id));
    if (selected.length === 0) return;
    const firstProduct = products.find((p) => p.id === selected[0].productId);
    if (!firstProduct) return;

    // Attach current calculated remaining quantities
    const enrichedSelected = selected.map((l) => {
      const analysis = getLogAnalysis(l);
      return {
        ...l,
        remainingQuantity: analysis.remainingQuantity,
      };
    });

    onStartBatchWithLogs(enrichedSelected, firstProduct);
  };

  // Compute total available from selected logs
  const selectedTotalAvailable = selectedLogIds.reduce((sum, id) => {
    const log = harvestLogs.find((l) => l.id === id);
    if (!log) return sum;
    const analysis = getLogAnalysis(log);
    return sum + analysis.remainingQuantity;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <ClipboardList className="w-5 h-5 text-emerald-500" />
            <span>Raw Material Intake &amp; Lineage</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time delivery stock, partial intake allocation, and live batch production lifecycle
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {selectedLogIds.length > 0 && (
            <button
              onClick={handleStartBatchFromSelected}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold shadow transition animate-in fade-in"
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>
                Start Batch from {selectedLogIds.length} Intake{selectedLogIds.length > 1 ? 's' : ''} ({selectedTotalAvailable.toLocaleString()} Available)
              </span>
            </button>
          )}

          <button
            onClick={() => {
              setShowLogForm(!showLogForm);
              setFeedback(null);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Log Intake Entry</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
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

      {/* Log Intake Form Drawer */}
      {showLogForm && (
        <div className="bg-slate-50 dark:bg-slate-850 p-5 rounded-xl border border-emerald-500/40 dark:border-emerald-500/30 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center space-x-2 text-sm font-bold text-slate-800 dark:text-white">
              <Scale className="w-4 h-4 text-emerald-500" />
              <span>Record Incoming Raw Material Delivery</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Logged by: <strong className="text-slate-700 dark:text-slate-300">{member.roleLabel || member.permissionTier}</strong>
            </span>
          </div>

          <form onSubmit={handleLogIntake} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Product Select */}
              <div className="space-y-1 sm:col-span-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Product from Catalog
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsInlineAddingProduct(!isInlineAddingProduct)}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    + Add New Product
                  </button>
                </div>

                {products.length > 0 ? (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit} • {p.processingType})
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 py-1">
                    Catalog empty. Please add a product first!
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Quantity ({selectedProduct?.unit || 'units'})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="e.g. 100"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none pr-12"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 uppercase font-mono">
                    {selectedProduct?.unit || 'kg'}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Notes / Source Batch / Grade
                </label>
                <input
                  type="text"
                  placeholder="e.g. Supplier Lot #412, fresh unblemished Grade A"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Inline New Product Subform */}
            {isInlineAddingProduct && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl space-y-2 text-xs">
                <div className="font-semibold text-emerald-900 dark:text-emerald-300">
                  Quick-Define New Product
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Product Name (e.g. Papad Dough)"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Unit (e.g. kg)"
                    value={newProductUnit}
                    onChange={(e) => setNewProductUnit(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder="Process (e.g. drying, fermenting)"
                    value={newProductProcess}
                    onChange={(e) => setNewProductProcess(e.target.value)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsInlineAddingProduct(false)}
                    className="px-2 py-1 text-slate-600 dark:text-slate-400 hover:underline"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleInlineProductSave}
                    disabled={!newProductName.trim()}
                    className="px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 font-semibold"
                  >
                    Save &amp; Select
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedProduct}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving Intake Record...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Save Intake Log</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={filterProductId}
            onChange={(e) => setFilterProductId(e.target.value)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Products ({harvestLogs.length})</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e: any) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
          >
            <option value="all">All Inventory Statuses</option>
            <option value="available">Available in Stock</option>
            <option value="ready">Ready for Distribution</option>
            <option value="processing">In Processing</option>
            <option value="exhausted">Fully Allocated</option>
          </select>

          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Search intake records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="text-slate-500 dark:text-slate-400 text-[11px] self-end sm:self-center">
          Showing {filteredLogs.length} intake entries
        </div>
      </div>

      {/* Intake Records Table */}
      {filteredLogs.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8">
          <ClipboardList className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No intake entries found
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Log your incoming raw materials to start tracking batches and schedules.
          </p>
          <button
            onClick={() => setShowLogForm(true)}
            className="mt-3 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition"
          >
            + Record First Intake
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3 w-8">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="p-3">Product &amp; Production Lineage</th>
                  <th className="p-3">Quantity &amp; Inventory Balance</th>
                  <th className="p-3">Logged By</th>
                  <th className="p-3">Date &amp; Time</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3 text-right">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredLogs.map((log) => {
                  const isSelected = selectedLogIds.includes(log.id);
                  const logDate = log.harvestedAt?.toDate
                    ? log.harvestedAt.toDate()
                    : new Date(log.harvestedAt || Date.now());

                  const analysis = getLogAnalysis(log);
                  const pctUsed = Math.min(100, Math.round((analysis.totalAllocated / log.quantity) * 100));

                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition ${
                        isSelected ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={analysis.isFullyAllocated}
                          onChange={() => toggleLogSelection(log.id)}
                          title={analysis.isFullyAllocated ? 'All raw material allocated to batches' : 'Select to start batch'}
                          className={`rounded text-emerald-600 focus:ring-emerald-500 ${
                            analysis.isFullyAllocated ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        />
                      </td>
                      <td className="p-3 max-w-sm">
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">
                          {log.productName}
                        </div>

                        {/* Intake Stock & Production Linkage Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {/* Stock Status Badge */}
                          {analysis.isFresh ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              100% In Stock ({log.quantity} {log.unit} available)
                            </span>
                          ) : analysis.isPartiallyAllocated ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              Partially Allocated ({analysis.totalAllocated} {log.unit} in batch • {analysis.remainingQuantity} {log.unit} available)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                              Fully Allocated ({log.quantity} {log.unit} in batch runs)
                            </span>
                          )}

                          {/* Linked Production Batches with LIVE Status */}
                          {analysis.linkedBatches.map((batch) => {
                            const qtyAllocated = batch.intakeAllocations?.find((a) => a.harvestLogId === log.id)?.quantityUsed;
                            const qtyLabel = qtyAllocated !== undefined ? `${qtyAllocated} ${log.unit}` : `${batch.totalQuantity} ${batch.unit}`;

                            if (batch.status === 'ready') {
                              return (
                                <button
                                  key={batch.id}
                                  type="button"
                                  onClick={() => {
                                    if (onSelectBatch) onSelectBatch(batch.id);
                                    else if (onNavigateTab) onNavigateTab('batches');
                                  }}
                                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition"
                                  title="Click to view ready batch in Batches tab"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Batch #{batch.id.slice(-6)}: Ready for Distribution ({qtyLabel})</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              );
                            }

                            if (batch.status === 'processing') {
                              return (
                                <button
                                  key={batch.id}
                                  type="button"
                                  onClick={() => {
                                    if (onSelectBatch) onSelectBatch(batch.id);
                                    else if (onNavigateTab) onNavigateTab('batches');
                                  }}
                                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900 transition"
                                  title="Click to view in-progress batch in Batches tab"
                                >
                                  <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                                  <span>Batch #{batch.id.slice(-6)}: In Processing ({qtyLabel})</span>
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              );
                            }

                            return (
                              <button
                                key={batch.id}
                                type="button"
                                onClick={() => {
                                  if (onNavigateTab) onNavigateTab('history');
                                }}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                              >
                                <PackageCheck className="w-3 h-3 text-purple-600" />
                                <span>Batch #{batch.id.slice(-6)}: Packaged</span>
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Quantity & Inventory Balance Column */}
                      <td className="p-3">
                        <div className="flex items-baseline space-x-1 font-mono">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">
                            {analysis.remainingQuantity.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            / {log.quantity.toLocaleString()} {log.unit} left
                          </span>
                        </div>

                        {/* Progress balance bar */}
                        <div className="w-32 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full ${analysis.isFullyAllocated ? 'bg-slate-400' : 'bg-emerald-500'}`}
                            style={{ width: `${pctUsed}%` }}
                            title={`${pctUsed}% allocated to batches`}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {analysis.totalAllocated > 0
                            ? `${analysis.totalAllocated.toLocaleString()} ${log.unit} in batch runs`
                            : 'No batches drawn yet'}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex items-center space-x-1">
                          <UserCheck className="w-3 h-3 text-slate-400" />
                          <span>{log.loggedByName || 'Team Member'}</span>
                          <span className="text-[10px] text-slate-400 px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800">
                            {log.loggedByRole}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-500 dark:text-slate-400">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{logDate.toLocaleDateString()} {logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {log.notes || '—'}
                      </td>

                      {/* Dynamic Lifecycle Actions Column */}
                      <td className="p-3 text-right whitespace-nowrap">
                        {analysis.remainingQuantity > 0 ? (
                          <div className="flex flex-col items-end space-y-1">
                            <button
                              onClick={() => {
                                const prod = products.find((p) => p.id === log.productId) || {
                                  id: log.productId,
                                  name: log.productName,
                                  unit: log.unit,
                                  processingType: 'processing',
                                  createdByUid: user.uid,
                                };
                                onStartBatchWithLogs([{ ...log, remainingQuantity: analysis.remainingQuantity }], prod);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg border border-emerald-300 dark:border-emerald-700 transition inline-flex items-center space-x-1 shadow-sm"
                            >
                              <span>
                                {analysis.isPartiallyAllocated
                                  ? `+ Draw Batch (${analysis.remainingQuantity} ${log.unit} left)`
                                  : `+ Start Batch (${log.quantity} ${log.unit})`}
                              </span>
                              <ArrowRight className="w-3 h-3" />
                            </button>

                            {/* Secondary link to active batch if exists */}
                            {analysis.readyBatches.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectBatch) onSelectBatch(analysis.readyBatches[0].id);
                                  else if (onNavigateTab) onNavigateTab('batches');
                                }}
                                className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Batch #{analysis.readyBatches[0].id.slice(-6)} Ready</span>
                              </button>
                            ) : analysis.processingBatches.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectBatch) onSelectBatch(analysis.processingBatches[0].id);
                                  else if (onNavigateTab) onNavigateTab('batches');
                                }}
                                className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                              >
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                <span>Batch #{analysis.processingBatches[0].id.slice(-6)} Processing</span>
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-col items-end space-y-1">
                            {analysis.readyBatches.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectBatch) onSelectBatch(analysis.readyBatches[0].id);
                                  else if (onNavigateTab) onNavigateTab('batches');
                                }}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition inline-flex items-center space-x-1.5"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Ready for Distribution (View Batch #{analysis.readyBatches[0].id.slice(-6)})</span>
                              </button>
                            ) : analysis.processingBatches.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectBatch) onSelectBatch(analysis.processingBatches[0].id);
                                  else if (onNavigateTab) onNavigateTab('batches');
                                }}
                                className="px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 rounded-lg border border-blue-200 dark:border-blue-800 transition inline-flex items-center space-x-1.5"
                              >
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                <span>In Processing (View Batch #{analysis.processingBatches[0].id.slice(-6)})</span>
                              </button>
                            ) : analysis.packagedBatches.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onNavigateTab) onNavigateTab('history');
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-800 transition inline-flex items-center space-x-1.5"
                              >
                                <PackageCheck className="w-3.5 h-3.5 text-purple-600" />
                                <span>Packaged &amp; Shipped</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                                Fully Allocated
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
