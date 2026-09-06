import React, { useState, useMemo } from 'react';
import { ProductionBatch, ProductCatalogItem, FarmMember } from '../types';
import { formatQuantityWithUnit } from '../lib/unitUtils';
import { updateBatchStatus } from '../lib/farmService';
import { BatchChatModal } from './BatchChatModal';
import { User } from 'firebase/auth';
import {
  PackageCheck,
  Scale,
  Sparkles,
  TrendingDown,
  Search,
  Truck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Boxes,
  Layers,
  ArrowRight,
  MessageSquare,
  Copy,
  ExternalLink,
  PlusCircle,
  FileSpreadsheet,
} from 'lucide-react';

interface DriedStockSectionProps {
  farmId: string;
  farmName: string;
  user: User;
  member: FarmMember;
  batches: ProductionBatch[];
  products: ProductCatalogItem[];
  onBatchUpdated: (batch: ProductionBatch) => void;
  onNavigateTab: (tab: 'dashboard' | 'batches' | 'intake' | 'catalog' | 'team' | 'history') => void;
}

export const DriedStockSection: React.FC<DriedStockSectionProps> = ({
  farmId,
  farmName,
  user,
  member,
  batches,
  products,
  onBatchUpdated,
  onNavigateTab,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState('all');
  const [activeChatBatch, setActiveChatBatch] = useState<ProductionBatch | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const isAdmin = member.permissionTier === 'admin';

  // Ready Batches (available stock)
  const readyBatches = useMemo(() => {
    return batches.filter((b) => b.status === 'ready');
  }, [batches]);

  // Packaged Batches (dispatched stock)
  const packagedBatches = useMemo(() => {
    return batches.filter((b) => b.status === 'packaged');
  }, [batches]);

  // Filtered ready batches
  const filteredReadyBatches = useMemo(() => {
    return readyBatches.filter((b) => {
      const matchesSearch =
        b.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (b.statusNotes && b.statusNotes.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesProduct =
        selectedProductFilter === 'all' || b.productId === selectedProductFilter;

      return matchesSearch && matchesProduct;
    });
  }, [readyBatches, searchTerm, selectedProductFilter]);

  // Group ready stock by product
  const stockByProduct = useMemo(() => {
    const map: Record<
      string,
      {
        productId: string;
        productName: string;
        processingType: string;
        totalDriedQuantity: number;
        unit: string;
        totalRawQuantity: number;
        rawUnit: string;
        batchCount: number;
        avgYield: number;
      }
    > = {};

    for (const b of readyBatches) {
      const pId = b.productId || b.productName;
      if (!map[pId]) {
        map[pId] = {
          productId: b.productId,
          productName: b.productName || 'Product',
          processingType: b.processingType || 'drying',
          totalDriedQuantity: 0,
          unit: b.driedOutputUnit || b.unit || 'kg',
          totalRawQuantity: 0,
          rawUnit: b.unit || 'kg',
          batchCount: 0,
          avgYield: 0,
        };
      }
      const driedQty = b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity);
      const rawQty = Number(b.totalQuantity) || 0;

      map[pId].totalDriedQuantity += driedQty || 0;
      map[pId].totalRawQuantity += rawQty || 0;
      map[pId].batchCount += 1;
    }

    // Compute average yield per product
    return Object.values(map).map((item) => ({
      ...item,
      avgYield:
        item.totalRawQuantity > 0
          ? Math.round((item.totalDriedQuantity / item.totalRawQuantity) * 1000) / 10
          : 0,
    }));
  }, [readyBatches]);

  // Overall totals
  const totalDriedAvailable = useMemo(() => {
    return readyBatches.reduce((sum, b) => {
      const q = b.driedOutputQuantity !== undefined ? Number(b.driedOutputQuantity) : Number(b.totalQuantity);
      return sum + (q || 0);
    }, 0);
  }, [readyBatches]);

  const totalRawConsumed = useMemo(() => {
    return readyBatches.reduce((sum, b) => sum + (Number(b.totalQuantity) || 0), 0);
  }, [readyBatches]);

  const overallAvgYield = totalRawConsumed > 0
    ? Math.round((totalDriedAvailable / totalRawConsumed) * 1000) / 10
    : 0;

  // Handle Mark Packaged / Dispatched
  const handleMarkPackaged = async (batch: ProductionBatch) => {
    if (!isAdmin) {
      alert('Unauthorized: Only Admins can mark batches as Packaged / Dispatched.');
      return;
    }

    setIsUpdatingStatus((prev) => ({ ...prev, [batch.id]: true }));
    setFeedback(null);
    try {
      await updateBatchStatus(farmId, batch.id, 'packaged', member.uid);
      const updated: ProductionBatch = {
        ...batch,
        status: 'packaged',
        packagedAt: new Date(),
        updatedAt: new Date(),
      };
      onBatchUpdated(updated);
      setFeedback({
        type: 'success',
        message: `Batch #${batch.id.slice(-6)} (${batch.productName}) marked as PACKAGED / DISPATCHED!`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to update batch status to packaged.',
      });
    } finally {
      setIsUpdatingStatus((prev) => ({ ...prev, [batch.id]: false }));
    }
  };

  // Copy stock summary for logistics/distribution
  const handleCopySummary = () => {
    if (stockByProduct.length === 0) return;
    const lines = [
      `=== ${farmName} - DRIED & FINISHED STOCK REPORT ===`,
      `Generated: ${new Date().toLocaleString()}`,
      `Total Available Dried Stock: ${totalDriedAvailable.toLocaleString()} units`,
      `Total Ready Batches: ${readyBatches.length}`,
      `Average Yield Recovery: ${overallAvgYield}%`,
      '',
      '--- Breakdown by Product ---',
      ...stockByProduct.map(
        (p) =>
          `• ${p.productName}: ${p.totalDriedQuantity.toLocaleString()} ${p.unit} (${p.batchCount} batch${p.batchCount > 1 ? 'es' : ''}, avg yield ${p.avgYield}%)`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 text-white p-6 rounded-2xl border border-emerald-800/50 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <PackageCheck className="w-4 h-4" />
              <span>Available Inventory</span>
              <span>•</span>
              <span>{farmName}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2.5">
              <span>Dried &amp; Finished Stock Available</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                READY FOR DISPATCH
              </span>
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Authoritative stock of actual dried and finished product output ready for packaging, distribution, and retail fulfillment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopySummary}
              disabled={readyBatches.length === 0}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white border border-white/20 rounded-xl text-xs font-semibold backdrop-blur-sm transition"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedSummary ? 'Copied Stock Report!' : 'Copy Stock Report'}</span>
            </button>
            <button
              onClick={() => onNavigateTab('batches')}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>View Processing Runs</span>
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

      {/* 4 Core Inventory KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Dried Stock Available */}
        <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-xs font-medium">
            <span className="font-bold">Total Dried Stock Available</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-xs">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 font-mono">
              {totalDriedAvailable.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              total finished units
            </span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
            <span>Verified ready output</span>
            <span className="font-semibold">{readyBatches.length} batches staged</span>
          </div>
        </div>

        {/* Metric 2: Ready Batches Awaiting Dispatch */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Batches Ready</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white font-mono">
              {readyBatches.length}
            </span>
            <span className="text-xs text-slate-500">
              ready batch{readyBatches.length !== 1 ? 'es' : ''}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {stockByProduct.length} distinct product{stockByProduct.length !== 1 ? 's' : ''} ready
          </div>
        </div>

        {/* Metric 3: Overall Yield Recovery Rate */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Average Yield Recovery</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
              {overallAvgYield}%
            </span>
            <span className="text-xs text-slate-500">dried / raw ratio</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            From {totalRawConsumed.toLocaleString()} units raw material
          </div>
        </div>

        {/* Metric 4: Packaged & Dispatched Total */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Packaged / Dispatched</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-purple-700 dark:text-purple-300 font-mono">
              {packagedBatches.length}
            </span>
            <span className="text-xs text-slate-500">batches fulfilled</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Archived in operational lineage
          </div>
        </div>
      </div>

      {/* Product-Wise Dried Stock Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-500" />
            <span>Available Dried Stock by Product ({stockByProduct.length})</span>
          </h2>
          <span className="text-xs text-slate-500">
            Calculated from verified dried output weights
          </span>
        </div>

        {stockByProduct.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 space-y-3">
            <PackageCheck className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              No dried stock is currently available in &quot;Ready&quot; status.
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              When processing finishes in the dehydration chamber, advance batches to &quot;Ready&quot; and input the final dried output weight to populate this inventory.
            </p>
            <button
              onClick={() => onNavigateTab('batches')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Go to Active Batches
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stockByProduct.map((p) => (
              <div
                key={p.productId}
                className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {p.productName}
                    </h3>
                    <span className="text-[10px] text-slate-400 capitalize">
                      Process: {p.processingType}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {p.batchCount} batch{p.batchCount > 1 ? 'es' : ''}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/60">
                  <span className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase tracking-wider block">
                    Available Dried Stock
                  </span>
                  <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 font-mono mt-0.5">
                    {p.totalDriedQuantity.toLocaleString()} {p.unit}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="block text-[10px] text-slate-400">Raw Consumed</span>
                    <strong className="text-slate-700 dark:text-slate-300 font-mono">
                      {p.totalRawQuantity.toLocaleString()} {p.rawUnit}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400">Avg Yield</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-mono">
                      {p.avgYield}%
                    </strong>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedProductFilter(p.productId || 'all');
                    setSearchTerm(p.productName);
                  }}
                  className="w-full text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center justify-center space-x-1 pt-1"
                >
                  <span>Filter {p.productName} Batches</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Individual Ready Batches Table */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Boxes className="w-5 h-5 text-emerald-500" />
              <span>Verified Ready Batches Inventory</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Individual batch records showing raw intake vs. confirmed dried output
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search batches or notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>

            <select
              value={selectedProductFilter}
              onChange={(e) => setSelectedProductFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            >
              <option value="all">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredReadyBatches.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            No ready batches match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 font-semibold border-y border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Batch &amp; Product</th>
                  <th className="py-2.5 px-3">Raw Material Intake</th>
                  <th className="py-2.5 px-3">Dried Output Stock</th>
                  <th className="py-2.5 px-3">Yield Recovery</th>
                  <th className="py-2.5 px-3">Ready Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReadyBatches.map((batch) => {
                  const driedQty =
                    batch.driedOutputQuantity !== undefined
                      ? batch.driedOutputQuantity
                      : batch.totalQuantity;
                  const driedUnit = batch.driedOutputUnit || batch.unit || 'kg';
                  const yieldPct =
                    batch.yieldPercentage !== undefined
                      ? batch.yieldPercentage
                      : batch.totalQuantity > 0
                      ? Math.round((driedQty / batch.totalQuantity) * 1000) / 10
                      : null;

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-850/50 transition">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {batch.productName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          #{batch.id.slice(-6)} • {batch.processingType}
                        </div>
                        {batch.statusNotes && (
                          <div className="text-[10px] text-slate-500 italic mt-0.5 line-clamp-1">
                            QA: {batch.statusNotes}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-mono">
                        {formatQuantityWithUnit(batch.totalQuantity, batch.unit)}
                      </td>

                      <td className="py-3 px-3 font-mono">
                        <span className="font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                          {driedQty} {driedUnit}
                        </span>
                        {batch.driedOutputQuantity === undefined && (
                          <span className="text-[9px] text-amber-500 block">
                            (raw fallback)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {yieldPct !== null ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            {yieldPct}%
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-[11px] text-slate-500 dark:text-slate-400">
                        {batch.readyAt
                          ? new Date(
                              batch.readyAt?.seconds
                                ? batch.readyAt.seconds * 1000
                                : batch.readyAt
                            ).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Ready'}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setActiveChatBatch(batch)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Consult Gemini on Batch"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {isAdmin ? (
                            <button
                              onClick={() => handleMarkPackaged(batch)}
                              disabled={isUpdatingStatus[batch.id]}
                              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold flex items-center space-x-1 shadow-xs transition"
                              title="Mark as Packaged / Dispatched"
                            >
                              <Truck className="w-3 h-3" />
                              <span>
                                {isUpdatingStatus[batch.id] ? 'Dispatching...' : 'Dispatch'}
                              </span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              Admin dispatch only
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
    </div>
  );
};
