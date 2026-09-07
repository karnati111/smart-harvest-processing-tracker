import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  ProductCatalogItem,
  ProductionBatch,
  FarmMember,
  PackagingRecord,
  isQualityInspector,
  isProductionLead,
} from '../types';
import {
  getPackagingLogs,
  addPackagingRecord,
} from '../lib/farmService';
import { formatUnitDisplay } from '../lib/unitUtils';
import {
  Package,
  Boxes,
  PlusCircle,
  Scale,
  Sparkles,
  Warehouse,
  Truck,
  CheckCircle2,
  AlertCircle,
  Search,
  Layers,
  ArrowRight,
  Loader2,
  Tag,
  MapPin,
  Calendar,
  X,
  FileCheck2,
  ShieldCheck,
  ShieldAlert,
  Eye,
} from 'lucide-react';

interface PackagingSectionProps {
  farmId: string;
  user: User;
  member: FarmMember;
  products: ProductCatalogItem[];
  batches: ProductionBatch[];
  onNavigateTab?: (tab: 'dashboard' | 'batches' | 'intake' | 'catalog' | 'packaging' | 'dispatch' | 'team' | 'history') => void;
  onSelectForDispatch?: (packagingRecord: PackagingRecord) => void;
}

export const PackagingSection: React.FC<PackagingSectionProps> = ({
  farmId,
  user,
  member,
  products,
  batches,
  onNavigateTab,
  onSelectForDispatch,
}) => {
  const [packagingLogs, setPackagingLogs] = useState<PackagingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPackModal, setShowPackModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<'all' | 'Grade A' | 'Grade B'>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Pack & Store Form State
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<'Grade A' | 'Grade B'>('Grade A');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [packageSizeGrams, setPackageSizeGrams] = useState<number>(100);
  const [customGrams, setCustomGrams] = useState<string>('100');
  const [unitsPackedStr, setUnitsPackedStr] = useState<string>('20');
  const [storageLocation, setStorageLocation] = useState<string>('Rack A1 - Finished Goods Bay 1');
  const [batchCode, setBatchCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Load Packaging Logs
  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const logs = await getPackagingLogs(farmId);
      setPackagingLogs(logs || []);
    } catch (err: any) {
      console.error('Failed to load packaging logs:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to load packaging records.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [farmId]);

  // Available dried stock per product and per grade from batches marked ready or packaged
  const driedStockByProduct = useMemo(() => {
    const map: {
      [productId: string]: {
        productName: string;
        unit: string;
        gradeATotalDriedKg: number;
        gradeBTotalDriedKg: number;
        totalDriedKg: number;
        gradeAPackedKg: number;
        gradeBPackedKg: number;
        gradeAAvailableKg: number;
        gradeBAvailableKg: number;
        totalAvailableKg: number;
        batches: ProductionBatch[];
      };
    } = {};

    // Initialize with catalog products
    products.forEach((p) => {
      map[p.id] = {
        productName: p.name,
        unit: p.unit || 'kg',
        gradeATotalDriedKg: 0,
        gradeBTotalDriedKg: 0,
        totalDriedKg: 0,
        gradeAPackedKg: 0,
        gradeBPackedKg: 0,
        gradeAAvailableKg: 0,
        gradeBAvailableKg: 0,
        totalAvailableKg: 0,
        batches: [],
      };
    });

    // Sum from batches marked ready or packaged
    batches.forEach((b) => {
      if (b.status === 'ready' || b.status === 'packaged') {
        if (!map[b.productId]) {
          map[b.productId] = {
            productName: b.productName || 'Product',
            unit: b.unit || 'kg',
            gradeATotalDriedKg: 0,
            gradeBTotalDriedKg: 0,
            totalDriedKg: 0,
            gradeAPackedKg: 0,
            gradeBPackedKg: 0,
            gradeAAvailableKg: 0,
            gradeBAvailableKg: 0,
            totalAvailableKg: 0,
            batches: [],
          };
        }

        const entry = map[b.productId];
        entry.batches.push(b);

        const driedKg = b.driedOutputQuantity
          ? (b.driedOutputUnit === 'g' ? b.driedOutputQuantity / 1000 : b.driedOutputQuantity)
          : (b.totalQuantity || 0);

        const gradeAKg = b.gradeAOutputQuantity !== undefined
          ? (b.driedOutputUnit === 'g' ? b.gradeAOutputQuantity / 1000 : b.gradeAOutputQuantity)
          : (b.gradeBOutputQuantity !== undefined ? 0 : driedKg); // if no grade split specified, treat as Grade A

        const gradeBKg = b.gradeBOutputQuantity !== undefined
          ? (b.driedOutputUnit === 'g' ? b.gradeBOutputQuantity / 1000 : b.gradeBOutputQuantity)
          : 0;

        entry.gradeATotalDriedKg += gradeAKg;
        entry.gradeBTotalDriedKg += gradeBKg;
        entry.totalDriedKg += (gradeAKg + gradeBKg > 0 ? (gradeAKg + gradeBKg) : driedKg);
      }
    });

    // Subtract already packed quantities from packagingLogs
    packagingLogs.forEach((pkg) => {
      if (map[pkg.productId]) {
        const packedKg = pkg.totalKg || (pkg.totalGrams / 1000);
        if (pkg.grade === 'Grade B') {
          map[pkg.productId].gradeBPackedKg += packedKg;
        } else {
          map[pkg.productId].gradeAPackedKg += packedKg;
        }
      }
    });

    // Calculate available remaining
    Object.values(map).forEach((entry) => {
      entry.gradeAAvailableKg = Math.max(0, Math.round((entry.gradeATotalDriedKg - entry.gradeAPackedKg) * 100) / 100);
      entry.gradeBAvailableKg = Math.max(0, Math.round((entry.gradeBTotalDriedKg - entry.gradeBPackedKg) * 100) / 100);
      entry.totalAvailableKg = Math.round((entry.gradeAAvailableKg + entry.gradeBAvailableKg) * 100) / 100;
    });

    return map;
  }, [products, batches, packagingLogs]);

  // Overall totals across all products
  const aggregateMetrics = useMemo(() => {
    let totalGradeADried = 0;
    let totalGradeBDried = 0;
    let totalGradeAAvailable = 0;
    let totalGradeBAvailable = 0;
    let totalUnitsStored = 0;
    let totalUnitsRemaining = 0;
    let totalUnitsDispatched = 0;
    let totalPackagedKg = 0;

    Object.values(driedStockByProduct).forEach((p) => {
      totalGradeADried += p.gradeATotalDriedKg;
      totalGradeBDried += p.gradeBTotalDriedKg;
      totalGradeAAvailable += p.gradeAAvailableKg;
      totalGradeBAvailable += p.gradeBAvailableKg;
    });

    packagingLogs.forEach((p) => {
      totalUnitsStored += p.unitsPacked || 0;
      totalUnitsRemaining += (p.unitsRemaining !== undefined ? p.unitsRemaining : p.unitsPacked);
      totalUnitsDispatched += p.unitsDispatched || 0;
      totalPackagedKg += p.totalKg || (p.totalGrams / 1000);
    });

    return {
      totalGradeADried: Math.round(totalGradeADried * 100) / 100,
      totalGradeBDried: Math.round(totalGradeBDried * 100) / 100,
      totalGradeAAvailable: Math.round(totalGradeAAvailable * 100) / 100,
      totalGradeBAvailable: Math.round(totalGradeBAvailable * 100) / 100,
      totalUnitsStored,
      totalUnitsRemaining,
      totalUnitsDispatched,
      totalPackagedKg: Math.round(totalPackagedKg * 100) / 100,
    };
  }, [driedStockByProduct, packagingLogs]);

  // Open modal preselected with a specific product & grade
  const handleOpenPackModal = (prodId?: string, grade?: 'Grade A' | 'Grade B') => {
    const targetProdId = prodId || (products.length > 0 ? products[0].id : '');
    setSelectedProductId(targetProdId);
    setSelectedGrade(grade || 'Grade A');

    // Suggest lot code
    const prod = products.find((p) => p.id === targetProdId);
    const prefix = prod ? prod.name.slice(0, 3).toUpperCase() : 'LOT';
    setBatchCode(`LOT-${prefix}-${new Date().getFullYear()}-${String(packagingLogs.length + 1).padStart(2, '0')}`);

    // Set batch if available
    if (targetProdId && driedStockByProduct[targetProdId]?.batches.length > 0) {
      setSelectedBatchId(driedStockByProduct[targetProdId].batches[0].id);
    } else {
      setSelectedBatchId('');
    }

    setShowPackModal(true);
  };

  // Submit Pack & Store
  const handleCreatePackagingRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const sizeGrams = packageSizeGrams > 0 ? packageSizeGrams : parseFloat(customGrams);
    const units = parseInt(unitsPackedStr, 10);

    if (isNaN(sizeGrams) || sizeGrams <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid positive package size in grams.' });
      return;
    }

    if (isNaN(units) || units <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid positive number of packages packed.' });
      return;
    }

    const prod = products.find((p) => p.id === selectedProductId);
    const productName = prod ? prod.name : 'Unknown Product';
    const totalGrams = Math.round(sizeGrams * units);
    const totalKg = Math.round((totalGrams / 1000) * 100) / 100;

    setIsSubmitting(true);
    try {
      await addPackagingRecord(farmId, {
        productId: selectedProductId,
        productName,
        batchId: selectedBatchId || undefined,
        grade: selectedGrade,
        packageSizeGrams: sizeGrams,
        unitsPacked: units,
        totalGrams,
        totalKg,
        unitsDispatched: 0,
        unitsRemaining: units,
        storageLocation: storageLocation.trim() || 'Finished Goods Bay 1',
        batchCode: batchCode.trim() || `LOT-${Date.now().toString().slice(-4)}`,
        notes: notes.trim() || undefined,
        packedByUid: user.uid,
        packedByName: user.displayName || user.email || 'Facility Staff',
        packedByRole: member.roleLabel || (member.permissionTier === 'admin' ? 'Facility Admin' : 'Packaging Worker'),
      });

      setFeedback({
        type: 'success',
        message: `Successfully stored ${units} packets (${sizeGrams}g each = ${totalKg} kg) of ${productName} (${selectedGrade}) in ${storageLocation}!`,
      });

      setShowPackModal(false);
      setNotes('');
      await loadLogs();
    } catch (err: any) {
      console.error('Error saving packaging record:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to save packaging record.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered packaging logs
  const filteredLogs = useMemo(() => {
    return packagingLogs.filter((log) => {
      const matchSearch =
        log.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.storageLocation.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.batchCode && log.batchCode.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchGrade = gradeFilter === 'all' || log.grade === gradeFilter;
      const matchProduct = productFilter === 'all' || log.productId === productFilter;

      return matchSearch && matchGrade && matchProduct;
    });
  }, [packagingLogs, searchQuery, gradeFilter, productFilter]);

  // Current calculation in modal
  const modalSizeGrams = packageSizeGrams > 0 ? packageSizeGrams : parseFloat(customGrams) || 0;
  const modalUnits = parseInt(unitsPackedStr, 10) || 0;
  const modalTotalGrams = modalSizeGrams * modalUnits;
  const modalTotalKg = Math.round((modalTotalGrams / 1000) * 100) / 100;

  const currentAvailableKg = selectedProductId
    ? (selectedGrade === 'Grade A'
        ? driedStockByProduct[selectedProductId]?.gradeAAvailableKg || 0
        : driedStockByProduct[selectedProductId]?.gradeBAvailableKg || 0)
    : 0;

  const isAdmin = member.permissionTier === 'admin';
  const isQC = isQualityInspector(member.roleLabel, member.permissionTier);
  const isLead = isProductionLead(member.roleLabel, member.permissionTier);
  const canControlPackaging = isAdmin || isQC;

  return (
    <div id="packaging-section" className="space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300">
                <Package className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Packaging &amp; Finished Goods Storage
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                Grade Inventory
              </span>
              {canControlPackaging ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Control: Active (QC &amp; Admin)</span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 flex items-center space-x-1">
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Only (Production Lead)</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Track dried stock by <strong>Grade A</strong> and <strong>Grade B</strong>, pack into measured gram pouches or containers, and manage storage inventory ready for dispatch.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {canControlPackaging ? (
              <button
                id="btn-pack-and-store"
                onClick={() => handleOpenPackModal()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Pack &amp; Store Packages</span>
              </button>
            ) : (
              <div className="px-3.5 py-2 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl text-xs font-semibold text-sky-700 dark:text-sky-300 flex items-center space-x-1.5">
                <Eye className="w-4 h-4 text-sky-500" />
                <span>View Only (Production Lead)</span>
              </div>
            )}
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('dispatch')}
                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition flex items-center space-x-1.5"
              >
                <Truck className="w-4 h-4 text-emerald-500" />
                <span>Go to Dispatching</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Production Lead Notice Banner */}
      {isLead && !isAdmin && (
        <div id="notice-production-lead" className="p-3.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl text-xs text-sky-800 dark:text-sky-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Eye className="w-4 h-4 text-sky-500 shrink-0" />
            <span>
              <strong>Production Lead View:</strong> Storage counts, Grade A/B stock, and package batch codes are visible for operational tracking. No action needed—packaging operations and lot sealing are controlled by the Quality Inspector &amp; Admin.
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-sky-200 dark:bg-sky-900 text-[10px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-200">
            Visible / Read Only
          </span>
        </div>
      )}

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs transition ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards: Grade A vs Grade B Stock & Storage Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Grade A Dried Stock */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Grade A Dried Leaf Stock</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              Premium
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300">
              {aggregateMetrics.totalGradeAAvailable} kg
            </span>
            <span className="text-xs text-slate-400">available to pack</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Total Produced: <strong>{aggregateMetrics.totalGradeADried} kg</strong></span>
            {canControlPackaging ? (
              <button
                onClick={() => handleOpenPackModal(undefined, 'Grade A')}
                className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
              >
                + Pack Grade A
              </button>
            ) : (
              <span className="text-slate-400 text-[10px] font-medium">Controlled by QC &amp; Admin</span>
            )}
          </div>
        </div>

        {/* Grade B Dried Stock */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Grade B Dried Leaf Stock</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
              Secondary
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300">
              {aggregateMetrics.totalGradeBAvailable} kg
            </span>
            <span className="text-xs text-slate-400">available to pack</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Total Produced: <strong>{aggregateMetrics.totalGradeBDried} kg</strong></span>
            {canControlPackaging ? (
              <button
                onClick={() => handleOpenPackModal(undefined, 'Grade B')}
                className="text-amber-600 dark:text-amber-400 font-bold hover:underline"
              >
                + Pack Grade B
              </button>
            ) : (
              <span className="text-slate-400 text-[10px] font-medium">Controlled by QC &amp; Admin</span>
            )}
          </div>
        </div>

        {/* Finished Goods Packages in Storage */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/60 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-800 dark:text-purple-300 flex items-center space-x-1.5">
              <Warehouse className="w-3.5 h-3.5" />
              <span>Stored Finished Packages</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
              In Storage
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-purple-700 dark:text-purple-300">
              {aggregateMetrics.totalUnitsRemaining}
            </span>
            <span className="text-xs text-slate-400">units in racks</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Total Packed: {aggregateMetrics.totalUnitsStored} units</span>
            <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">
              {aggregateMetrics.totalPackagedKg} kg packed
            </span>
          </div>
        </div>

        {/* Ready to Dispatch / Dispatched Ratio */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-800 dark:text-sky-300 flex items-center space-x-1.5">
              <Truck className="w-3.5 h-3.5" />
              <span>Dispatch Pipeline</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              Active Stock
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-sky-700 dark:text-sky-300">
              {aggregateMetrics.totalUnitsDispatched}
            </span>
            <span className="text-xs text-slate-400">units shipped</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Remaining Stock: <strong>{aggregateMetrics.totalUnitsRemaining} units</strong></span>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('dispatch')}
                className="text-sky-600 dark:text-sky-400 font-bold hover:underline flex items-center space-x-1"
              >
                <span>Dispatch</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dried Stock Inventory Breakdown by Product Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-850/50">
          <div className="flex items-center space-x-2">
            <Scale className="w-4 h-4 text-emerald-500" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Dried Quantity Stock Balance by Grade
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Computed from Production Batches marked Ready
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/75 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-4">Product / Item</th>
                <th className="py-3 px-4">Grade A Produced</th>
                <th className="py-3 px-4">Grade A Packed</th>
                <th className="py-3 px-4">Grade A Available</th>
                <th className="py-3 px-4">Grade B Produced</th>
                <th className="py-3 px-4">Grade B Packed</th>
                <th className="py-3 px-4">Grade B Available</th>
                <th className="py-3 px-4 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {Object.entries(driedStockByProduct).map(([prodId, p]) => (
                <tr key={prodId} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-500" />
                      <span>{p.productName}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {p.batches.length} dried batch{p.batches.length !== 1 ? 'es' : ''}
                    </span>
                  </td>

                  {/* Grade A Columns */}
                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                    {p.gradeATotalDriedKg} kg
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {p.gradeAPackedKg} kg
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {p.gradeAAvailableKg} kg
                  </td>

                  {/* Grade B Columns */}
                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                    {p.gradeBTotalDriedKg} kg
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {p.gradeBPackedKg} kg
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-amber-600 dark:text-amber-400">
                    {p.gradeBAvailableKg} kg
                  </td>

                  {/* Action */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end space-x-1.5">
                      <button
                        onClick={() => handleOpenPackModal(prodId, 'Grade A')}
                        disabled={p.gradeAAvailableKg <= 0 && p.totalDriedKg <= 0}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-200 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg transition disabled:opacity-30"
                        title="Pack Grade A"
                      >
                        + Pack Grade A
                      </button>
                      <button
                        onClick={() => handleOpenPackModal(prodId, 'Grade B')}
                        disabled={p.gradeBAvailableKg <= 0 && p.totalDriedKg <= 0}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-lg transition disabled:opacity-30"
                        title="Pack Grade B"
                      >
                        + Pack Grade B
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Finished Goods Storage Logs Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Controls Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/70 dark:bg-slate-850/50">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
              <Warehouse className="w-4 h-4 text-purple-500" />
              <span>Finished Goods Storage Inventory ({filteredLogs.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Individual packed lots with grams per package and stored warehouse location.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search storage, lot, product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500 w-44"
              />
            </div>

            {/* Grade Filter */}
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">All Grades</option>
              <option value="Grade A">Grade A Only</option>
              <option value="Grade B">Grade B Only</option>
            </select>

            {/* Product Filter */}
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">All Products</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Logs Table */}
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
            <span>Loading storage records...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Boxes className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-xs text-slate-500 font-medium">No packaging records match your filters.</p>
            <button
              onClick={() => handleOpenPackModal()}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition"
            >
              + Pack First Batch of Units
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/75 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-4">Item &amp; Lot Code</th>
                  <th className="py-3 px-4">Grade</th>
                  <th className="py-3 px-4">Pack Size</th>
                  <th className="py-3 px-4">Units Packed &amp; Weight</th>
                  <th className="py-3 px-4">Storage Availability</th>
                  <th className="py-3 px-4">Warehouse Location</th>
                  <th className="py-3 px-4">Packed Date &amp; Staff</th>
                  <th className="py-3 px-4 text-right">Dispatch Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((log) => {
                  const remaining = log.unitsRemaining !== undefined ? log.unitsRemaining : log.unitsPacked;
                  const dispatched = log.unitsDispatched || 0;
                  const pctRemaining = log.unitsPacked > 0 ? Math.round((remaining / log.unitsPacked) * 100) : 0;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {log.productName}
                        </div>
                        <div className="text-[10px] font-mono text-purple-700 dark:text-purple-300">
                          {log.batchCode || 'LOT-STANDARD'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.grade === 'Grade A'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {log.grade}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                          {log.packageSizeGrams} grams
                        </span>
                        <span className="block text-[10px] text-slate-400">per pouch/unit</span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold font-mono text-slate-900 dark:text-white">
                          {log.unitsPacked} units
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          Total: {log.totalKg || (log.totalGrams / 1000)} kg ({log.totalGrams}g)
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span className={`font-mono font-bold ${remaining > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                            {remaining} left
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({dispatched} shipped)
                          </span>
                        </div>
                        <div className="w-24 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full ${remaining > 0 ? 'bg-emerald-500' : 'bg-slate-400'}`}
                            style={{ width: `${pctRemaining}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1 text-slate-700 dark:text-slate-300 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{log.storageLocation}</span>
                        </div>
                        {log.notes && (
                          <span className="text-[10px] text-slate-400 block truncate max-w-xs" title={log.notes}>
                            {log.notes}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-500">
                        <div>
                          {typeof log.createdAt === 'string'
                            ? new Date(log.createdAt).toLocaleDateString()
                            : (log.createdAt as any)?.toDate?.()
                            ? (log.createdAt as any).toDate().toLocaleDateString()
                            : 'Recent'}
                        </div>
                        <span className="text-[10px] text-slate-400 block">
                          by {log.packedByName || 'Staff'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        {canControlPackaging ? (
                          remaining > 0 ? (
                            <button
                              onClick={() => {
                                if (onSelectForDispatch) {
                                  onSelectForDispatch(log);
                                }
                                if (onNavigateTab) {
                                  onNavigateTab('dispatch');
                                }
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition inline-flex items-center space-x-1 shadow-sm"
                            >
                              <Truck className="w-3 h-3" />
                              <span>Dispatch</span>
                            </button>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 font-semibold">
                              All Dispatched
                            </span>
                          )
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                            {remaining > 0 ? `${remaining} In Rack` : 'Dispatched'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pack & Store Modal Form */}
      {showPackModal && (
        <div
          id="pack-and-store-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col my-auto">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-purple-50/70 dark:bg-purple-950/40">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                    Pack &amp; Store Finished Goods
                  </h3>
                  <p className="text-[11px] text-purple-800 dark:text-purple-300 font-medium mt-0.5">
                    Enter package size in grams, units packed, and warehouse storage location.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPackModal(false)}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreatePackagingRecord} className="p-5 space-y-4">
              {/* Product Selection */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Select Product Item <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const prod = products.find((p) => p.id === e.target.value);
                    const prefix = prod ? prod.name.slice(0, 3).toUpperCase() : 'LOT';
                    setBatchCode(`LOT-${prefix}-${new Date().getFullYear()}-${String(packagingLogs.length + 1).padStart(2, '0')}`);
                  }}
                  required
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-semibold"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Process: {p.processingType || 'Drying'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Grade Selection */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Select Quality Grade <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGrade('Grade A')}
                    className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                      selectedGrade === 'Grade A'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold block flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>Grade A</span>
                      </span>
                      <span className="text-[10px] text-slate-500">Premium Export Quality</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-600">
                      {selectedProductId ? driedStockByProduct[selectedProductId]?.gradeAAvailableKg || 0 : 0} kg avail
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedGrade('Grade B')}
                    className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                      selectedGrade === 'Grade B'
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold block flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span>Grade B</span>
                      </span>
                      <span className="text-[10px] text-slate-500">Standard / Secondary</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-600">
                      {selectedProductId ? driedStockByProduct[selectedProductId]?.gradeBAvailableKg || 0 : 0} kg avail
                    </span>
                  </button>
                </div>
              </div>

              {/* Package Size in Grams (Presets + Custom) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Package Size in Grams (Weight per Pack) <span className="text-rose-500">*</span></span>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                    Current: {modalSizeGrams}g
                  </span>
                </label>

                {/* Preset Pills */}
                <div className="flex flex-wrap gap-1.5">
                  {[50, 100, 200, 250, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setPackageSizeGrams(preset);
                        setCustomGrams(String(preset));
                      }}
                      className={`px-3 py-1 text-xs rounded-lg font-semibold transition ${
                        packageSizeGrams === preset
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset >= 1000 ? `${preset / 1000}kg (${preset}g)` : `${preset}g`}
                    </button>
                  ))}
                </div>

                {/* Custom Grams Input */}
                <div className="relative pt-1">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="Enter custom grams (e.g. 150)"
                    value={customGrams}
                    onChange={(e) => {
                      setCustomGrams(e.target.value);
                      const parsed = parseFloat(e.target.value);
                      setPackageSizeGrams(parsed > 0 ? parsed : 0);
                    }}
                    className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                  <span className="absolute right-3.5 top-3.5 text-xs text-slate-400">
                    grams / packet
                  </span>
                </div>
              </div>

              {/* Number of Units Packed */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Number of Units Packed &amp; Stored <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1"
                    min="1"
                    required
                    placeholder="e.g. 50"
                    value={unitsPackedStr}
                    onChange={(e) => setUnitsPackedStr(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono font-bold"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-400">
                    packets
                  </span>
                </div>
              </div>

              {/* Calculation Summary Preview */}
              <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-semibold text-purple-900 dark:text-purple-200">
                  <span className="flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Total Net Weight to Store:</span>
                  </span>
                  <span className="font-mono font-bold text-sm text-purple-700 dark:text-purple-300">
                    {modalTotalKg} kg ({modalTotalGrams.toLocaleString()} grams)
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-purple-200 dark:border-purple-800/60">
                  <span>Available {selectedGrade} Dried Leaf:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {currentAvailableKg} kg
                  </span>
                </div>

                {modalTotalKg > currentAvailableKg && currentAvailableKg > 0 && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center space-x-1 pt-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Notice: Packed weight ({modalTotalKg}kg) exceeds current unallocated ready stock ({currentAvailableKg}kg).
                    </span>
                  </div>
                )}
              </div>

              {/* Warehouse Storage Location & Batch Lot Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Storage Warehouse Location <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rack A1 - Room 2"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Lot / Batch Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. LOT-MOR-2026-01"
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Packaging Notes & Seals */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Packaging Notes &amp; Specifications (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nitrogen flushed stand-up kraft zip pouch, seal checked"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowPackModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || modalTotalGrams <= 0}
                  className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl shadow-sm flex items-center space-x-1.5 transition"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Stock to Inventory...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Store Finished Stock</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
