import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  ProductCatalogItem,
  HarvestLog,
  ProductionBatch,
  FarmMember,
} from '../types';
import { BatchChatModal } from './BatchChatModal';
import ReactMarkdown from 'react-markdown';
import {
  History,
  Filter,
  Search,
  Calendar,
  Boxes,
  ClipboardList,
  CheckCircle2,
  Clock,
  Truck,
  Activity,
  Bot,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface HistorySectionProps {
  farmId: string;
  user: User;
  member: FarmMember;
  products: ProductCatalogItem[];
  harvestLogs: HarvestLog[];
  batches: ProductionBatch[];
}

export const HistorySection: React.FC<HistorySectionProps> = ({
  farmId,
  user,
  member,
  products,
  harvestLogs,
  batches,
}) => {
  const [activeTab, setActiveTab] = useState<'batches' | 'intakes'>('batches');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [activeChatBatch, setActiveChatBatch] = useState<ProductionBatch | null>(null);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  // Filtered Batches
  const filteredBatches = batches.filter((b) => {
    const matchesProduct = selectedProductId === 'all' || b.productId === selectedProductId;
    const matchesStatus = selectedStatus === 'all' || b.status === selectedStatus;
    const matchesSearch =
      b.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.processingType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesProduct && matchesStatus && matchesSearch;
  });

  // Filtered Intakes
  const filteredIntakes = harvestLogs.filter((l) => {
    const matchesProduct = selectedProductId === 'all' || l.productId === selectedProductId;
    const matchesSearch =
      l.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.notes && l.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.loggedByName && l.loggedByName.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesProduct && matchesSearch;
  });

  // Calculate summary metrics
  const totalIntakeWeight = harvestLogs.reduce((acc, l) => acc + (l.quantity || 0), 0);
  const readyBatchesCount = batches.filter((b) => b.status === 'ready' || b.status === 'packaged').length;

  return (
    <div className="space-y-6">
      {/* Header & High-Level Metrics */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <History className="w-5 h-5 text-emerald-500" />
              <span>Operational History &amp; Traceability</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit trail of small-batch raw material intakes, process conditions, and readiness
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('batches')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                activeTab === 'batches'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Batches ({batches.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('intakes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 ${
                activeTab === 'intakes'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              <span>Intakes ({harvestLogs.length})</span>
            </button>
          </div>
        </div>

        {/* Metric tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 text-[11px] block">Total Batches</span>
            <span className="text-base font-bold text-slate-900 dark:text-white">{batches.length}</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 text-[11px] block">Ready / Packaged</span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{readyBatchesCount}</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 text-[11px] block">Intake Entries</span>
            <span className="text-base font-bold text-slate-900 dark:text-white">{harvestLogs.length}</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 text-[11px] block">Cumulative Intake</span>
            <span className="text-base font-bold text-sky-600 dark:text-sky-400">{totalIntakeWeight.toLocaleString()} units</span>
          </div>
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />

          {/* Product Filter */}
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Products ({products.length})</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Status Filter (for batches) */}
          {activeTab === 'batches' && (
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Statuses</option>
              <option value="harvested">Harvested</option>
              <option value="processing">In Processing</option>
              <option value="ready">Ready</option>
              <option value="packaged">Packaged</option>
            </select>
          )}

          {/* Search box */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <span className="text-[11px] text-slate-500 dark:text-slate-400 self-end sm:self-center">
          Showing {activeTab === 'batches' ? filteredBatches.length : filteredIntakes.length} records
        </span>
      </div>

      {/* Main Table / Cards */}
      {activeTab === 'batches' ? (
        filteredBatches.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl p-8">
            <Boxes className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              No batches match the filter
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBatches.map((batch) => {
              const isExpanded = expandedBatchId === batch.id;
              return (
                <div
                  key={batch.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm"
                >
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {batch.productName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            batch.status === 'ready'
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                              : batch.status === 'packaged'
                              ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                              : 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
                          }`}
                        >
                          {batch.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center space-x-2">
                        <span>Batch #{batch.id.slice(-6)}</span>
                        <span>•</span>
                        <span>{batch.totalQuantity} {batch.unit}</span>
                        <span>•</span>
                        <span className="capitalize">{batch.processingType}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setActiveChatBatch(batch)}
                        className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs font-semibold flex items-center space-x-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Chat Thread</span>
                      </button>
                      <button
                        onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950/50 space-y-3 text-xs">
                      <div>
                        <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                          Environmental Parameters
                        </h4>
                        <p className="text-slate-600 dark:text-slate-400">
                          Temp: {batch.conditions.temperature || 'Ambient'} | RH: {batch.conditions.humidity || 'Normal'} | Method: {batch.conditions.method || 'Standard'} | Target: {batch.conditions.duration || 'Standard'}
                        </p>
                      </div>

                      {batch.schedule && (
                        <div>
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                            Generated Schedule
                          </h4>
                          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] prose prose-xs dark:prose-invert max-h-40 overflow-y-auto">
                            <ReactMarkdown>{batch.schedule}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Intakes Table */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Logged By</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredIntakes.map((log) => {
                  const date = log.harvestedAt?.toDate
                    ? log.harvestedAt.toDate()
                    : new Date(log.harvestedAt || Date.now());
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-semibold text-slate-900 dark:text-white">
                        {log.productName}
                      </td>
                      <td className="p-3 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                        {log.quantity} {log.unit}
                      </td>
                      <td className="p-3">
                        {log.loggedByName} ({log.loggedByRole})
                      </td>
                      <td className="p-3 text-slate-500">
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 text-slate-500 max-w-sm truncate">
                        {log.notes || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
    </div>
  );
};
