import React, { useState, useMemo } from 'react';
import { ProductCatalogItem, HarvestLog, ProductionBatch } from '../types';
import { formatUnitDisplay, formatQuantityWithUnit } from '../lib/unitUtils';
import {
  Scale,
  PackageCheck,
  AlertTriangle,
  PlusCircle,
  Copy,
  Check,
  Layers,
  Flame,
  CheckCircle2,
  Sliders,
  TrendingDown,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface ProductionProcurementCardProps {
  products: ProductCatalogItem[];
  harvestLogs: HarvestLog[];
  batches: ProductionBatch[];
  onQuickIntake: (product: ProductCatalogItem) => void;
  onNavigateTab?: (tab: 'intake' | 'batches' | 'catalog' | 'history' | 'team') => void;
  userRoleLabel?: string;
  isCompact?: boolean;
}

export const ProductionProcurementCard: React.FC<ProductionProcurementCardProps> = ({
  products,
  harvestLogs,
  batches,
  onQuickIntake,
  onNavigateTab,
  userRoleLabel = 'Production Incharge',
  isCompact = false,
}) => {
  // Default target safety stock buffer per product line in kg (user-customizable)
  const [safetyBufferTarget, setSafetyBufferTarget] = useState<number>(100);
  const [customBuffers, setCustomBuffers] = useState<Record<string, number>>({});
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // 1. Calculate available unallocated raw stock per harvest log and per product
  const getLogAvailable = (log: HarvestLog): number => {
    if (log.remainingQuantity !== undefined) {
      return Math.max(0, log.remainingQuantity);
    }
    const linked = batches.filter((b) => b.linkedHarvestLogIds?.includes(log.id));
    const used = linked.reduce((acc, b) => {
      const specific = b.intakeAllocations?.find((a) => a.harvestLogId === log.id)?.quantityUsed;
      return acc + (specific !== undefined ? specific : (b.totalQuantity || 0));
    }, 0);
    return Math.max(0, log.quantity - used);
  };

  // Product-by-product comprehensive inventory & procurement analysis
  const productAnalytics = useMemo(() => {
    return products.map((product) => {
      // a) Raw Materials We Have (Available in stock)
      const matchingLogs = harvestLogs.filter((l) => l.productId === product.id);
      const rawAvailable = matchingLogs.reduce((sum, l) => sum + getLogAvailable(l), 0);
      const rawTotalReceived = matchingLogs.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

      // b) Dried Stock We Have (Finished Goods in inventory - batches marked 'ready')
      const readyBatches = batches.filter(
        (b) => b.productId === product.id && b.status === 'ready'
      );
      const driedInStock = readyBatches.reduce((sum, b) => {
        return sum + (Number(b.driedOutputQuantity !== undefined ? b.driedOutputQuantity : b.totalQuantity) || 0);
      }, 0);
      const rawUsedForReady = readyBatches.reduce((sum, b) => sum + (Number(b.totalQuantity) || 0), 0);
      const yieldPct = rawUsedForReady > 0
        ? Math.round((driedInStock / rawUsedForReady) * 1000) / 10
        : undefined;

      // c) In-Processing (Work In Progress inside dryers/chambers)
      const processingBatches = batches.filter(
        (b) => b.productId === product.id && b.status === 'processing'
      );
      const inProcessingRaw = processingBatches.reduce(
        (sum, b) => sum + (Number(b.totalQuantity) || 0),
        0
      );

      // d) How Much Need to Procure (Procurement Deficit / Reorder Planning)
      const targetThreshold = customBuffers[product.id] ?? safetyBufferTarget;
      const deficit = Math.max(0, Math.round((targetThreshold - rawAvailable) * 10) / 10);
      const surplus = Math.max(0, Math.round((rawAvailable - targetThreshold) * 10) / 10);

      return {
        product,
        rawAvailable: Math.round(rawAvailable * 10) / 10,
        rawTotalReceived: Math.round(rawTotalReceived * 10) / 10,
        driedInStock: Math.round(driedInStock * 10) / 10,
        readyBatchCount: readyBatches.length,
        yieldPct,
        inProcessingRaw: Math.round(inProcessingRaw * 10) / 10,
        processingBatchCount: processingBatches.length,
        targetThreshold,
        deficit,
        surplus,
        needsProcurement: deficit > 0,
        unit: product.unit || 'kg',
      };
    });
  }, [products, harvestLogs, batches, customBuffers, safetyBufferTarget]);

  // Overall Facility Totals for Production Incharge
  const totalRawWeHave = useMemo(() => {
    return Math.round(productAnalytics.reduce((sum, p) => sum + p.rawAvailable, 0) * 10) / 10;
  }, [productAnalytics]);

  const totalDriedWeHave = useMemo(() => {
    return Math.round(productAnalytics.reduce((sum, p) => sum + p.driedInStock, 0) * 10) / 10;
  }, [productAnalytics]);

  const totalNeedToProcure = useMemo(() => {
    return Math.round(productAnalytics.reduce((sum, p) => sum + p.deficit, 0) * 10) / 10;
  }, [productAnalytics]);

  const totalWipInProcessing = useMemo(() => {
    return Math.round(productAnalytics.reduce((sum, p) => sum + p.inProcessingRaw, 0) * 10) / 10;
  }, [productAnalytics]);

  // Copy plain text order request for Production Incharge to send via SMS / WhatsApp / Slack
  const handleCopyOrderText = () => {
    const lines = [
      `📋 *PRODUCTION INCHARGE PROCUREMENT NOTICE*`,
      `Facility Status: ${new Date().toLocaleDateString()}`,
      `Total Raw Materials In Stock: ${totalRawWeHave} kg`,
      `Total Dried Stock Ready: ${totalDriedWeHave} kg`,
      `Total Procurement Deficit: ${totalNeedToProcure} kg`,
      ``,
      `*Raw Material Reorder Requirements:*`,
    ];

    productAnalytics.forEach((item) => {
      if (item.deficit > 0) {
        lines.push(
          `• *${item.product.name}*: Available ${item.rawAvailable} ${item.unit} | Target ${item.targetThreshold} ${item.unit} | ⚠️ NEED TO PROCURE: ${item.deficit} ${item.unit}`
        );
      } else {
        lines.push(
          `• ${item.product.name}: Available ${item.rawAvailable} ${item.unit} (Stock Adequate)`
        );
      }
    });

    lines.push(``);
    lines.push(`Dispatched by: ${userRoleLabel}`);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <div
      id="production-incharge-card"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
    >
      {/* Top Banner with Production Incharge Badge */}
      <div className="px-5 py-4 bg-slate-900 text-white border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              Production Incharge Command
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs text-slate-300 font-medium">
              Raw Inventory vs. Dried Stock vs. Procurement Deficit
            </span>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
            Production &amp; Procurement Balance Sheet
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          {/* Buffer configuration toggle */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs border border-slate-700 transition"
            title="Adjust Safety Buffer Target"
          >
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Target: {safetyBufferTarget}kg</span>
          </button>

          {/* 1-Click Copy Procurement Sheet */}
          <button
            onClick={handleCopyOrderText}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs transition"
            title="Copy formatted procurement message to clipboard"
          >
            {copiedSummary ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-200" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Procurement Order</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Target Buffer Configurator Drawer (Collapsible) */}
      {showConfig && (
        <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-xs space-y-3 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Minimum Safety Stock Threshold (Target Buffer):
              </span>
              <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-0.5">
                When available raw material stock falls below this threshold, the system flags a procurement deficit.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {[50, 100, 150, 200].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSafetyBufferTarget(val)}
                  className={`px-2.5 py-1 rounded-md font-semibold text-xs transition ${
                    safetyBufferTarget === val
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {val} kg
                </button>
              ))}
              <input
                type="number"
                min="10"
                step="10"
                value={safetyBufferTarget}
                onChange={(e) => setSafetyBufferTarget(Math.max(1, Number(e.target.value)))}
                className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-center text-slate-900 dark:text-white font-mono text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3 Core Production Incharge Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 border-b border-slate-200 dark:border-slate-800">
        {/* Metric 1: RAW MATERIALS WE HAVE */}
        <div className="p-5 space-y-1.5 bg-sky-50/40 dark:bg-sky-950/20">
          <div className="flex items-center justify-between text-xs font-semibold text-sky-800 dark:text-sky-300">
            <span className="flex items-center space-x-1.5">
              <Scale className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>1. Raw Materials We Have</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200 font-bold">
              Available Intake
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white font-mono tracking-tight">
            {totalRawWeHave.toLocaleString()} <span className="text-sm font-sans font-normal text-slate-500">kg</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
            <span>Unallocated &amp; ready to process</span>
            {totalWipInProcessing > 0 && (
              <span className="text-sky-700 dark:text-sky-300 font-medium">
                +{totalWipInProcessing} kg in dryers
              </span>
            )}
          </div>
        </div>

        {/* Metric 2: DRIED STOCK WE HAVE */}
        <div className="p-5 space-y-1.5 bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            <span className="flex items-center space-x-1.5">
              <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>2. Dried Stock We Have</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-bold">
              Finished Goods
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-emerald-700 dark:text-emerald-300 font-mono tracking-tight">
            {totalDriedWeHave.toLocaleString()} <span className="text-sm font-sans font-normal text-slate-500">kg</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
            <span>Original dried leaf in stock</span>
            <span className="text-emerald-700 dark:text-emerald-300 font-medium">
              Ready for Distribution
            </span>
          </div>
        </div>

        {/* Metric 3: HOW MUCH NEED TO PROCURE */}
        <div
          className={`p-5 space-y-1.5 ${
            totalNeedToProcure > 0
              ? 'bg-rose-50/50 dark:bg-rose-950/20'
              : 'bg-slate-50/50 dark:bg-slate-950/20'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span
              className={`flex items-center space-x-1.5 ${
                totalNeedToProcure > 0
                  ? 'text-rose-800 dark:text-rose-300'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              <TrendingDown
                className={`w-4 h-4 ${
                  totalNeedToProcure > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}
              />
              <span>3. How Much Need to Procure</span>
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                totalNeedToProcure > 0
                  ? 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200 animate-pulse'
                  : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              {totalNeedToProcure > 0 ? 'Procurement Deficit' : 'Sufficient Stock'}
            </span>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${
              totalNeedToProcure > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {totalNeedToProcure > 0 ? totalNeedToProcure.toLocaleString() : '0'}{' '}
            <span className="text-sm font-sans font-normal text-slate-500">kg</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between pt-1">
            <span>Based on {safetyBufferTarget}kg target buffer</span>
            {totalNeedToProcure > 0 ? (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                Reorder Required
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                Target Met
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Product-by-Product Production & Procurement Table */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
            <Layers className="w-4 h-4 text-emerald-500" />
            <span>Product Catalog Breakdown for Production Incharge</span>
          </h3>
          <span className="text-[11px] text-slate-400">
            {products.length} registered product line{products.length !== 1 ? 's' : ''}
          </span>
        </div>

        {productAnalytics.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            No products defined in catalog yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Raw Materials In Stock</th>
                  <th className="py-2.5 px-3">Dried Finished Goods</th>
                  <th className="py-2.5 px-3">WIP in Dryers</th>
                  <th className="py-2.5 px-3">Target Buffer</th>
                  <th className="py-2.5 px-3">Need to Procure</th>
                  <th className="py-2.5 px-3 text-right">Procure Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {productAnalytics.map((item) => (
                  <tr
                    key={item.product.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition"
                  >
                    {/* Product Name */}
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {item.product.name}
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize">
                        {item.product.processingType || 'Processing'}
                      </div>
                    </td>

                    {/* Raw Materials In Stock */}
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {item.rawAvailable} {item.unit}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.rawTotalReceived} {item.unit} received total
                      </div>
                    </td>

                    {/* Dried Finished Goods */}
                    <td className="py-3 px-3">
                      <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                        {item.driedInStock} {item.unit}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {item.readyBatchCount} ready batch{item.readyBatchCount !== 1 ? 'es' : ''}{' '}
                        {item.yieldPct !== undefined ? `(~${item.yieldPct}% yield)` : ''}
                      </div>
                    </td>

                    {/* WIP in Dryers */}
                    <td className="py-3 px-3">
                      {item.inProcessingRaw > 0 ? (
                        <div>
                          <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                            {item.inProcessingRaw} {item.unit}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {item.processingBatchCount} active run{item.processingBatchCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Target Buffer */}
                    <td className="py-3 px-3">
                      <div className="font-mono text-slate-700 dark:text-slate-300">
                        {item.targetThreshold} {item.unit}
                      </div>
                      <div className="text-[10px] text-slate-400">minimum buffer</div>
                    </td>

                    {/* Need to Procure */}
                    <td className="py-3 px-3">
                      {item.deficit > 0 ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                          <span>Need {item.deficit} {item.unit}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>Adequate (+{item.surplus} {item.unit})</span>
                        </span>
                      )}
                    </td>

                    {/* 1-Click Action: Procure / Log Intake */}
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onQuickIntake(item.product)}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition"
                        title={`Record incoming raw delivery for ${item.product.name}`}
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Procure Intake</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
