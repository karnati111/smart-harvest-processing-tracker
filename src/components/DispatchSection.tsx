import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  DispatchRecord,
  PackagingRecord,
  ProductCatalogItem,
  FarmMember,
  OrderSource,
  PaymentStatus,
} from '../types';
import {
  getDispatches,
  addDispatchRecord,
  updateDispatchRecord,
  getPackagingLogs,
} from '../lib/farmService';
import {
  Truck,
  Package,
  PlusCircle,
  Search,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Phone,
  Mail,
  Calendar,
  CreditCard,
  IndianRupee,
  ChevronDown,
  ChevronUp,
  X,
  FileCheck2,
  ExternalLink,
  Layers,
  ArrowRight,
  Loader2,
  Clock,
  Printer,
  ShoppingBag,
} from 'lucide-react';

interface DispatchSectionProps {
  farmId: string;
  user: User;
  member: FarmMember;
  products: ProductCatalogItem[];
  preselectedPackaging?: PackagingRecord | null;
  onClearPreselectedPackaging?: () => void;
  onNavigateTab?: (tab: 'dashboard' | 'batches' | 'intake' | 'catalog' | 'packaging' | 'dispatch' | 'team' | 'history') => void;
}

export const DispatchSection: React.FC<DispatchSectionProps> = ({
  farmId,
  user,
  member,
  products,
  preselectedPackaging,
  onClearPreselectedPackaging,
  onNavigateTab,
}) => {
  const [dispatches, setDispatches] = useState<DispatchRecord[]>([]);
  const [packagingInventory, setPackagingInventory] = useState<PackagingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewDispatchModal, setShowNewDispatchModal] = useState(false);
  const [viewingDispatchSlip, setViewingDispatchSlip] = useState<DispatchRecord | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Dispatch Form State
  const [orderNumber, setOrderNumber] = useState('');
  const [orderSource, setOrderSource] = useState<OrderSource>('WhatsApp Direct');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));

  // Customer Contact Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [destinationCity, setDestinationCity] = useState('');
  const [destinationState, setDestinationState] = useState('');
  const [pincode, setPincode] = useState('');

  // Courier & Logistics
  const [courierName, setCourierName] = useState('Delhivery Express');
  const [trackingNumber, setTrackingNumber] = useState('');

  // Dispatch Items Line-items
  const [dispatchItems, setDispatchItems] = useState<
    Array<{
      packagingId: string;
      units: number;
      unitPrice: number;
    }>
  >([{ packagingId: '', units: 10, unitPrice: 150 }]);

  // Payment Details
  const [paymentStatus, setPaymentStatus] = useState<DispatchRecord['paymentStatus']>('Prepaid');
  const [amountReceivedStr, setAmountReceivedStr] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState('UPI / Google Pay');
  const [paymentReference, setPaymentReference] = useState('');
  const [notes, setNotes] = useState('');

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dispList, pkgList] = await Promise.all([
        getDispatches(farmId),
        getPackagingLogs(farmId),
      ]);
      setDispatches(dispList || []);
      setPackagingInventory(pkgList || []);
    } catch (err: any) {
      console.error('Failed to load dispatch data:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to load dispatch records.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [farmId]);

  // Handle preselected item from Packaging tab
  useEffect(() => {
    if (preselectedPackaging) {
      setDispatchItems([
        {
          packagingId: preselectedPackaging.id,
          units: Math.min(10, preselectedPackaging.unitsRemaining || preselectedPackaging.unitsPacked),
          unitPrice: 150,
        },
      ]);
      setOrderNumber(`DSP-${new Date().getFullYear()}-${String(dispatches.length + 1).padStart(3, '0')}`);
      setShowNewDispatchModal(true);
      if (onClearPreselectedPackaging) {
        onClearPreselectedPackaging();
      }
    }
  }, [preselectedPackaging]);

  // Open modal with auto-generated order number
  const handleOpenNewModal = () => {
    setOrderNumber(`DSP-${new Date().getFullYear()}-${String(dispatches.length + 1).padStart(3, '0')}`);
    // Default item if packages exist
    if (packagingInventory.length > 0 && dispatchItems[0].packagingId === '') {
      setDispatchItems([{ packagingId: packagingInventory[0].id, units: 10, unitPrice: 150 }]);
    }
    setShowNewDispatchModal(true);
  };

  // Live item calculations for the form
  const computedItemsDetails = useMemo(() => {
    let totalUnits = 0;
    let totalGrams = 0;
    let totalAmount = 0;

    const items = dispatchItems.map((item) => {
      const pkg = packagingInventory.find((p) => p.id === item.packagingId);
      const pkgSize = pkg?.packageSizeGrams || 100;
      const subtotalGrams = pkgSize * (item.units || 0);
      const subtotalKg = Math.round((subtotalGrams / 1000) * 100) / 100;
      const subtotalPrice = (item.units || 0) * (item.unitPrice || 0);

      totalUnits += item.units || 0;
      totalGrams += subtotalGrams;
      totalAmount += subtotalPrice;

      return {
        ...item,
        pkg,
        subtotalGrams,
        subtotalKg,
        subtotalPrice,
      };
    });

    const totalWeightKg = Math.round((totalGrams / 1000) * 100) / 100;

    return {
      items,
      totalUnits,
      totalGrams,
      totalWeightKg,
      totalAmount,
    };
  }, [dispatchItems, packagingInventory]);

  // Handle line item changes
  const handleItemChange = (index: number, field: string, value: any) => {
    setDispatchItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddItem = () => {
    const firstPkgId = packagingInventory.length > 0 ? packagingInventory[0].id : '';
    setDispatchItems((prev) => [...prev, { packagingId: firstPkgId, units: 5, unitPrice: 150 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (dispatchItems.length <= 1) return;
    setDispatchItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit New Dispatch Record
  const handleSubmitDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!customerName.trim()) {
      setFeedback({ type: 'error', message: 'Please enter customer or business name.' });
      return;
    }

    if (!destinationCity.trim() || !deliveryAddress.trim()) {
      setFeedback({ type: 'error', message: 'Please enter destination city and delivery address.' });
      return;
    }

    // Build items payload
    const formattedItems = dispatchItems.map((item) => {
      const pkg = packagingInventory.find((p) => p.id === item.packagingId);
      const sizeGrams = pkg?.packageSizeGrams || 100;
      const grams = sizeGrams * item.units;
      return {
        packagingId: item.packagingId,
        productId: pkg?.productId || 'prod-standard',
        productName: pkg?.productName || 'Processed Goods',
        grade: pkg?.grade || 'Grade A',
        packageSizeGrams: sizeGrams,
        units: item.units,
        totalGrams: grams,
        totalKg: Math.round((grams / 1000) * 100) / 100,
        unitPrice: item.unitPrice,
        subtotal: item.units * item.unitPrice,
      };
    });

    const totalWeightKg = computedItemsDetails.totalWeightKg;
    const totalAmount = computedItemsDetails.totalAmount;
    const amountReceived = paymentStatus === 'Prepaid' || paymentStatus === 'Amount Received'
      ? (parseFloat(amountReceivedStr) || totalAmount)
      : (parseFloat(amountReceivedStr) || 0);

    setIsSubmitting(true);
    try {
      await addDispatchRecord(farmId, {
        orderNumber: orderNumber.trim() || `DSP-${Date.now().toString().slice(-4)}`,
        orderSource,
        orderDate,
        dispatchDate,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        deliveryAddress: deliveryAddress.trim(),
        destinationCity: destinationCity.trim(),
        destinationState: destinationState.trim() || undefined,
        pincode: pincode.trim() || undefined,
        courierName: courierName.trim() || 'Direct Dispatch',
        trackingNumber: trackingNumber.trim() || undefined,
        items: formattedItems,
        totalUnits: computedItemsDetails.totalUnits,
        totalWeightKg,
        totalAmount,
        amountReceived,
        paymentStatus,
        paymentMethod: paymentMethod || undefined,
        paymentReference: paymentReference.trim() || undefined,
        status: 'Dispatched',
        notes: notes.trim() || undefined,
        dispatchedByUid: user.uid,
        dispatchedByName: user.displayName || user.email || 'Dispatch Manager',
        dispatchedByRole: member.roleLabel || (member.permissionTier === 'admin' ? 'Admin' : 'Logistics Worker'),
      });

      setFeedback({
        type: 'success',
        message: `Order #${orderNumber} successfully recorded and dispatched to ${customerName}, ${destinationCity}!`,
      });

      setShowNewDispatchModal(false);
      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setDeliveryAddress('');
      setDestinationCity('');
      setTrackingNumber('');
      setNotes('');
      await loadData();
    } catch (err: any) {
      console.error('Error saving dispatch:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to record dispatch.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Status Update on a Dispatch
  const handleUpdateStatus = async (recordId: string, newStatus: DispatchRecord['status']) => {
    try {
      await updateDispatchRecord(farmId, recordId, { status: newStatus });
      setDispatches((prev) =>
        prev.map((d) => (d.id === recordId ? { ...d, status: newStatus } : d))
      );
      setFeedback({ type: 'success', message: `Dispatch status updated to ${newStatus}.` });
    } catch (err: any) {
      console.error('Failed to update status:', err);
      alert('Failed to update dispatch status: ' + err?.message);
    }
  };

  // Quick Payment Mark Received
  const handleMarkPaymentReceived = async (record: DispatchRecord) => {
    try {
      await updateDispatchRecord(farmId, record.id, {
        paymentStatus: 'Amount Received',
        amountReceived: record.totalAmount,
      });
      setDispatches((prev) =>
        prev.map((d) =>
          d.id === record.id
            ? { ...d, paymentStatus: 'Amount Received', amountReceived: record.totalAmount }
            : d
        )
      );
      setFeedback({
        type: 'success',
        message: `Payment of ₹${record.totalAmount.toLocaleString()} marked as received for Order #${record.orderNumber}!`,
      });
    } catch (err: any) {
      console.error('Failed to update payment:', err);
      alert('Failed to update payment status.');
    }
  };

  // Aggregated Financial & Dispatch Metrics
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalReceived = 0;
    let totalPending = 0;
    let totalUnitsDispatched = 0;
    let totalKgDispatched = 0;
    let prepaidCount = 0;
    let receivedCount = 0;
    let pendingCount = 0;

    dispatches.forEach((d) => {
      totalRevenue += d.totalAmount || 0;
      totalReceived += d.amountReceived || 0;
      totalUnitsDispatched += d.totalUnits || 0;
      totalKgDispatched += d.totalWeightKg || 0;

      if (d.paymentStatus === 'Prepaid') prepaidCount++;
      else if (d.paymentStatus === 'Amount Received') receivedCount++;
      else pendingCount++;
    });

    totalPending = Math.max(0, totalRevenue - totalReceived);

    return {
      totalOrders: dispatches.length,
      totalRevenue,
      totalReceived,
      totalPending,
      totalUnitsDispatched,
      totalKgDispatched: Math.round(totalKgDispatched * 100) / 100,
      prepaidCount,
      receivedCount,
      pendingCount,
    };
  }, [dispatches]);

  // Filtered dispatches
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      const matchSearch =
        d.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.destinationCity.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.customerPhone && d.customerPhone.includes(searchQuery)) ||
        (d.trackingNumber && d.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchPayment = paymentFilter === 'all' || d.paymentStatus === paymentFilter;
      const matchStatus = statusFilter === 'all' || d.status === statusFilter;
      const matchSource = sourceFilter === 'all' || d.orderSource === sourceFilter;

      return matchSearch && matchPayment && matchStatus && matchSource;
    });
  }, [dispatches, searchQuery, paymentFilter, statusFilter, sourceFilter]);

  return (
    <div id="dispatch-section" className="space-y-6">
      {/* Top Banner / Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-300">
                <Truck className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Dispatching &amp; Order Fulfillment
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Outbound Logistics
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Track quantity dispatched, destination location, customer contact details, order sources, and payment status (Prepaid vs Amount Received vs Pending).
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleOpenNewModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Record New Dispatch</span>
            </button>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('packaging')}
                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition flex items-center space-x-1.5"
              >
                <Package className="w-4 h-4 text-purple-500" />
                <span>View Packaging Stock</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
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

      {/* KPI Cards: Financials & Dispatch Performance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Billed Revenue */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-500" />
              <span>Total Dispatched Value</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {metrics.totalOrders} Orders
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              ₹{metrics.totalRevenue.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">gross value</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Shipped: <strong>{metrics.totalUnitsDispatched} units</strong></span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              {metrics.totalKgDispatched} kg
            </span>
          </div>
        </div>

        {/* Amount Received */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Amount Received</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
              Collected
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              ₹{metrics.totalReceived.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">in bank / cash</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Prepaid: {metrics.prepaidCount}</span>
            <span>Settled: {metrics.receivedCount}</span>
          </div>
        </div>

        {/* Pending / COD Amount */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Pending / COD Balance</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
              {metrics.pendingCount} Pending
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
              ₹{metrics.totalPending.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">to collect</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>COD / Due Orders</span>
            <span className="text-amber-700 dark:text-amber-300 font-semibold">
              {metrics.pendingCount > 0 ? 'Follow up required' : 'All Settled'}
            </span>
          </div>
        </div>

        {/* Order Sources Breakdown */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-800 dark:text-sky-300 flex items-center space-x-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-sky-500" />
              <span>Top Channels</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              Direct &amp; B2B
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-sky-700 dark:text-sky-300">
              WhatsApp &amp; B2B
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2">
            <span>Delhivery &amp; Blue Dart Logistics</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">100% On Time</span>
          </div>
        </div>
      </div>

      {/* Dispatches List & Management Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Controls Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/70 dark:bg-slate-850/50">
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
              <Truck className="w-4 h-4 text-emerald-500" />
              <span>Dispatch Orders Log ({filteredDispatches.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Destination cities, customer contacts, payment receipts, and delivery tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search city, customer, order #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 w-48"
              />
            </div>

            {/* Payment Filter */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">All Payments</option>
              <option value="Prepaid">Prepaid</option>
              <option value="Amount Received">Amount Received</option>
              <option value="Pending / COD">Pending / COD</option>
            </select>

            {/* Channel Source Filter */}
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">All Sources</option>
              <option value="WhatsApp Direct">WhatsApp Direct</option>
              <option value="B2B Distributor">B2B Distributor</option>
              <option value="Shopify">Shopify</option>
              <option value="Website">Website</option>
              <option value="Phone Order">Phone Order</option>
            </select>
          </div>
        </div>

        {/* Table View */}
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Loading dispatch logs...</span>
          </div>
        ) : filteredDispatches.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Truck className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
            <p className="text-xs text-slate-500 font-medium">No dispatch orders match your current filters.</p>
            <button
              onClick={handleOpenNewModal}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition"
            >
              + Create First Dispatch Order
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/75 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-4">Order # &amp; Source</th>
                  <th className="py-3 px-4">Destination &amp; Contact Details</th>
                  <th className="py-3 px-4">Items Dispatched</th>
                  <th className="py-3 px-4">Total Weight &amp; Units</th>
                  <th className="py-3 px-4">Amount &amp; Payment Status</th>
                  <th className="py-3 px-4">Courier &amp; Tracking</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDispatches.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition">
                    {/* Order # & Source */}
                    <td className="py-3 px-4">
                      <div className="font-bold font-mono text-slate-900 dark:text-white">
                        {d.orderNumber}
                      </div>
                      <div className="mt-0.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {d.orderSource}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {d.dispatchDate}
                      </div>
                    </td>

                    {/* Destination & Contact Details */}
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {d.customerName}
                      </div>
                      <div className="flex items-center space-x-1 text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                        <span className="font-semibold">{d.destinationCity}</span>
                        {d.destinationState && <span>, {d.destinationState}</span>}
                        {d.pincode && <span className="font-mono text-[10px] text-slate-400">({d.pincode})</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5" title={d.deliveryAddress}>
                        {d.deliveryAddress}
                      </div>
                      {d.customerPhone && (
                        <div className="flex items-center space-x-1 text-[10px] text-slate-500 font-mono mt-0.5">
                          <Phone className="w-2.5 h-2.5 text-emerald-500" />
                          <span>{d.customerPhone}</span>
                        </div>
                      )}
                    </td>

                    {/* Items Dispatched */}
                    <td className="py-3 px-4 max-w-xs">
                      <div className="space-y-1">
                        {d.items.map((item, idx) => (
                          <div key={idx} className="flex items-center space-x-1 text-[11px]">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.units}x
                            </span>
                            <span className="text-slate-600 dark:text-slate-300">
                              {item.productName}
                            </span>
                            <span className={`text-[10px] px-1 py-0.2 rounded font-bold ${item.grade === 'Grade A' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {item.grade}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              ({item.packageSizeGrams}g)
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Total Weight & Units */}
                    <td className="py-3 px-4">
                      <div className="font-bold font-mono text-slate-900 dark:text-white">
                        {d.totalUnits} units
                      </div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {d.totalWeightKg} kg total
                      </div>
                    </td>

                    {/* Amount & Payment Status */}
                    <td className="py-3 px-4">
                      <div className="font-bold font-mono text-slate-900 dark:text-white text-sm">
                        ₹{d.totalAmount.toLocaleString()}
                      </div>
                      <div className="mt-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.paymentStatus === 'Prepaid'
                              ? 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
                              : d.paymentStatus === 'Amount Received'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {d.paymentStatus}
                        </span>
                      </div>
                      {d.paymentMethod && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          via {d.paymentMethod}
                        </div>
                      )}
                    </td>

                    {/* Courier & Tracking */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {d.courierName}
                      </div>
                      {d.trackingNumber ? (
                        <div className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                          AWB: {d.trackingNumber}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">Direct Delivery</div>
                      )}
                    </td>

                    {/* Delivery Status */}
                    <td className="py-3 px-4">
                      <select
                        value={d.status}
                        onChange={(e) => handleUpdateStatus(d.id, e.target.value as any)}
                        className="px-2 py-1 text-[11px] font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Dispatched">Dispatched</option>
                        <option value="In Transit">In Transit</option>
                        <option value="Delivered">Delivered</option>
                      </select>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {d.paymentStatus === 'Pending / COD' && (
                          <button
                            onClick={() => handleMarkPaymentReceived(d)}
                            className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
                            title="Mark full amount received"
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          onClick={() => setViewingDispatchSlip(d)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg transition"
                          title="View Dispatch Challan Slip"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record New Dispatch Modal */}
      {showNewDispatchModal && (
        <div
          id="new-dispatch-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/40">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                    Record New Dispatch &amp; Order
                  </h3>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium mt-0.5">
                    Select packaged units from warehouse, enter destination location, contact details &amp; payment status.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowNewDispatchModal(false)}
                disabled={isSubmitting}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitDispatch} className="p-5 space-y-4 overflow-y-auto">
              {/* Row 1: Order Ref, Source, Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Order Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Where we got order (Source) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={orderSource}
                    onChange={(e) => setOrderSource(e.target.value as OrderSource)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="WhatsApp Direct">WhatsApp Direct</option>
                    <option value="B2B Distributor">B2B Distributor / Wholesale</option>
                    <option value="Shopify">Shopify Store</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Retail Store">Retail Store</option>
                    <option value="Website / Online">Website / Online</option>
                    <option value="Phone / Direct Call">Phone / Direct Call</option>
                    <option value="Exhibition / Farmers Market">Exhibition / Farmers Market</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Dispatch Date
                  </label>
                  <input
                    type="date"
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Destination Location & Contact Details */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40 space-y-3">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  <span>Destination Location &amp; Customer Contact Details</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1 sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Customer / Client Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Priya Sharma"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Contact Phone Number
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +91 98450 12345"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. client@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Delivery Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. #42 Green Glen Layout, Outer Ring Road"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Destination City <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bengaluru"
                      value={destinationCity}
                      onChange={(e) => setDestinationCity(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Postal Pincode
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 560103"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Items to Dispatch (from Stored Packages) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                    <Package className="w-3.5 h-3.5 text-purple-500" />
                    <span>Select Packaged Units from Storage <span className="text-rose-500">*</span></span>
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    + Add Another Item
                  </button>
                </div>

                {dispatchItems.map((item, idx) => {
                  const pkg = packagingInventory.find((p) => p.id === item.packagingId);
                  const availableUnits = pkg ? (pkg.unitsRemaining !== undefined ? pkg.unitsRemaining : pkg.unitsPacked) : 0;

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center gap-2 text-xs"
                    >
                      {/* Package Select */}
                      <div className="flex-1">
                        <select
                          value={item.packagingId}
                          onChange={(e) => handleItemChange(idx, 'packagingId', e.target.value)}
                          required
                          className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium"
                        >
                          <option value="" disabled>Select Stored Package Item</option>
                          {packagingInventory.map((p) => {
                            const remaining = p.unitsRemaining !== undefined ? p.unitsRemaining : p.unitsPacked;
                            return (
                              <option key={p.id} value={p.id} disabled={remaining <= 0}>
                                {p.productName} ({p.grade}) - {p.packageSizeGrams}g pouch [{remaining} in stock at {p.storageLocation}]
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Units */}
                      <div className="w-24 shrink-0">
                        <input
                          type="number"
                          min="1"
                          max={availableUnits > 0 ? availableUnits : 9999}
                          value={item.units}
                          onChange={(e) => handleItemChange(idx, 'units', parseInt(e.target.value, 10) || 1)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono font-bold text-right"
                          placeholder="Units"
                        />
                        <span className="text-[10px] text-slate-400 block text-right mt-0.5">
                          units ({pkg ? `${((pkg.packageSizeGrams * item.units) / 1000).toFixed(2)}kg` : ''})
                        </span>
                      </div>

                      {/* Unit Price */}
                      <div className="w-28 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.unitPrice}
                            onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full pl-6 pr-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-right"
                            placeholder="Price"
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 block text-right mt-0.5">
                          per unit
                        </span>
                      </div>

                      {/* Subtotal */}
                      <div className="w-24 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        ₹{(item.units * item.unitPrice).toLocaleString()}
                      </div>

                      {/* Delete */}
                      {dispatchItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/60 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Totals Preview Banner */}
                <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <span>Total Units: <strong className="font-mono">{computedItemsDetails.totalUnits}</strong></span>
                    <span>Total Weight: <strong className="font-mono">{computedItemsDetails.totalWeightKg} kg</strong></span>
                  </div>
                  <div className="font-mono font-bold text-emerald-700 dark:text-emerald-300 text-sm">
                    Order Total: ₹{computedItemsDetails.totalAmount.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Payment Status & Method */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/40 space-y-3">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-sky-500" />
                  <span>Payment Details &amp; Amount Received</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Payment Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={paymentStatus}
                      onChange={(e) => {
                        const status = e.target.value as DispatchRecord['paymentStatus'];
                        setPaymentStatus(status);
                        if (status === 'Prepaid' || status === 'Amount Received') {
                          setAmountReceivedStr(String(computedItemsDetails.totalAmount));
                        } else {
                          setAmountReceivedStr('0');
                        }
                      }}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold"
                    >
                      <option value="Prepaid">Prepaid (Paid before dispatch)</option>
                      <option value="Amount Received">Amount Received (Full Payment Received)</option>
                      <option value="Pending / COD">Pending / Cash on Delivery</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Amount Received (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={amountReceivedStr}
                      onChange={(e) => setAmountReceivedStr(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Payment Method
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    >
                      <option value="UPI / Google Pay">UPI / Google Pay / PhonePe</option>
                      <option value="Bank Transfer (NEFT)">Bank Transfer (NEFT / IMPS)</option>
                      <option value="Cash on Delivery">Cash on Delivery (COD)</option>
                      <option value="Credit / Debit Card">Credit / Debit Card</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Payment Reference / Transaction ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI-984210 or NEFT-HDFC-99321"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Courier & Tracking */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Courier / Delivery Partner
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Delhivery, Blue Dart, DTDC, In-house"
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Tracking / AWB Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DEL-9988231401"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              {/* Dispatch Notes */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Handling Notes / Customer Instructions (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handle with care, fragile packaging, repeat client"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewDispatchModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || computedItemsDetails.totalUnits <= 0}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl shadow-sm flex items-center space-x-1.5 transition"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Dispatch Order...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Record Dispatch</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Dispatch Delivery Slip Modal */}
      {viewingDispatchSlip && (
        <div
          id="dispatch-slip-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
        >
          <div className="bg-white text-slate-900 border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 my-auto">
            {/* Slip Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                  Official Outbound Dispatch Challan
                </span>
                <h3 className="font-bold text-lg text-slate-900 mt-0.5">
                  Order #{viewingDispatchSlip.orderNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Source: {viewingDispatchSlip.orderSource} • Date: {viewingDispatchSlip.dispatchDate}
                </p>
              </div>
              <button
                onClick={() => setViewingDispatchSlip(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Destination Info */}
            <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Consignee / Destination
              </span>
              <p className="font-bold text-slate-900 text-sm">{viewingDispatchSlip.customerName}</p>
              <p className="text-slate-600">{viewingDispatchSlip.deliveryAddress}</p>
              <p className="font-semibold text-slate-800">
                {viewingDispatchSlip.destinationCity}, {viewingDispatchSlip.destinationState || ''} {viewingDispatchSlip.pincode || ''}
              </p>
              {viewingDispatchSlip.customerPhone && (
                <p className="text-slate-500 font-mono">Contact: {viewingDispatchSlip.customerPhone}</p>
              )}
            </div>

            {/* Items Dispatched */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Dispatched Packages
              </span>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-semibold text-slate-600 border-b">
                  <tr>
                    <th className="py-1.5 px-2">Item</th>
                    <th className="py-1.5 px-2">Grade</th>
                    <th className="py-1.5 px-2 text-right">Pack Size</th>
                    <th className="py-1.5 px-2 text-right">Qty</th>
                    <th className="py-1.5 px-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingDispatchSlip.items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-2 px-2 font-medium">{item.productName}</td>
                      <td className="py-2 px-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${item.grade === 'Grade A' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {item.grade}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono">{item.packageSizeGrams}g</td>
                      <td className="py-2 px-2 text-right font-mono font-bold">{item.units}</td>
                      <td className="py-2 px-2 text-right font-mono">₹{item.subtotal.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-bold border-t border-slate-200">
                  <tr>
                    <td colSpan={3} className="py-2 px-2 text-right">Total:</td>
                    <td className="py-2 px-2 text-right font-mono">{viewingDispatchSlip.totalUnits} units</td>
                    <td className="py-2 px-2 text-right font-mono text-emerald-600">
                      ₹{viewingDispatchSlip.totalAmount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment & Courier Footnote */}
            <div className="border-t border-slate-200 pt-3 text-xs flex justify-between text-slate-600">
              <div>
                <span>Payment: </span>
                <strong className="text-emerald-700">{viewingDispatchSlip.paymentStatus}</strong>
                {viewingDispatchSlip.paymentMethod && <span> ({viewingDispatchSlip.paymentMethod})</span>}
              </div>
              <div>
                <span>Courier: </span>
                <strong className="text-slate-800">{viewingDispatchSlip.courierName}</strong>
                {viewingDispatchSlip.trackingNumber && <span> (AWB: {viewingDispatchSlip.trackingNumber})</span>}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition"
              >
                Print Slip
              </button>
              <button
                type="button"
                onClick={() => setViewingDispatchSlip(null)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
