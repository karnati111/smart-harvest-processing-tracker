import React from 'react';
import { ProductionBatch, BatchStatus } from '../types';
import {
  CheckCircle2,
  PackageCheck,
  Bot,
  History,
  PlusCircle,
  X,
  BellRing,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  Truck,
} from 'lucide-react';

interface BatchReadyModalProps {
  batch: ProductionBatch;
  isOpen: boolean;
  slackNotified: boolean;
  onClose: () => void;
  onMarkPackaged: (batch: ProductionBatch) => void;
  onOpenAiConsultation: (batch: ProductionBatch) => void;
  onViewHistory?: () => void;
  onStartNextBatch?: () => void;
}

export const BatchReadyModal: React.FC<BatchReadyModalProps> = ({
  batch,
  isOpen,
  slackNotified,
  onClose,
  onMarkPackaged,
  onOpenAiConsultation,
  onViewHistory,
  onStartNextBatch,
}) => {
  if (!isOpen) return null;

  const formattedTime = batch.readyAt
    ? new Date(batch.readyAt?.seconds ? batch.readyAt.seconds * 1000 : batch.readyAt).toLocaleString(
        [],
        {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }
      )
    : new Date().toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  return (
    <div
      id="batch-ready-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ready-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col my-auto transition-all transform scale-100">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/30">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="ready-modal-title"
                className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight"
              >
                Batch Marked Ready for Distribution
              </h3>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium mt-0.5">
                Status updated in database &amp; QA criteria registered
              </p>
            </div>
          </div>
          <button
            id="ready-modal-close-icon-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Status Update Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Updated Status
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ready for Fulfillment</span>
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Product</span>
                <strong className="text-slate-900 dark:text-white text-sm">
                  {batch.productName}
                </strong>
                <span className="text-[10px] text-slate-500 block font-mono">
                  ID: {batch.id.slice(0, 10)}...
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Dried Leaf Weight Added to Stock</span>
                <strong className="text-emerald-700 dark:text-emerald-300 text-sm flex items-center space-x-1 font-mono">
                  <span>{batch.driedOutputQuantity !== undefined ? batch.driedOutputQuantity : batch.totalQuantity} {batch.driedOutputUnit || batch.unit}</span>
                </strong>
                <span className="text-[10px] text-slate-500 block">
                  Raw Intake: {batch.totalQuantity} {batch.unit} {batch.yieldPercentage ? `(${batch.yieldPercentage}% Yield)` : ''}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Timestamp: <strong>{formattedTime}</strong></span>
            </div>

            {/* Slack Notification Status */}
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-start space-x-2.5 text-xs">
              <BellRing
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  slackNotified
                    ? 'text-emerald-500'
                    : 'text-slate-400'
                }`}
              />
              <div className="text-[11px] leading-relaxed">
                {slackNotified ? (
                  <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                    External logistics alert dispatched to Slack with verified batch specifications.
                  </span>
                ) : (
                  <span className="text-slate-600 dark:text-slate-400">
                    Status change safely recorded in Firestore database. (Slack notification is optional or unconfigured).
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* What You Can Do Next Section */}
          <div className="space-y-3">
            <div className="flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                What you can do next
              </h4>
            </div>

            <div className="space-y-2.5">
              {/* Option 1: Mark as Packaged */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-800 bg-white dark:bg-slate-900 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-800">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      1. Final Packaging &amp; Dispatch
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Bag or seal into pouches, verify lot labels, and advance status to Packaged.
                    </p>
                  </div>
                </div>
                <button
                  id="mark-packaged-from-modal-btn"
                  type="button"
                  onClick={() => {
                    onMarkPackaged(batch);
                    onClose();
                  }}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-lg transition shrink-0 flex items-center justify-center space-x-1 shadow-sm"
                >
                  <PackageCheck className="w-3.5 h-3.5" />
                  <span>Mark Packaged</span>
                </button>
              </div>

              {/* Option 2: Ask Gemini AI for Packaging Guidance */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 bg-white dark:bg-slate-900 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      2. Consult Gemini AI on Storage &amp; Shelf Life
                    </h5>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Get AI recommendations on barrier pouch thickness, desiccants, and storage humidity.
                    </p>
                  </div>
                </div>
                <button
                  id="consult-ai-from-modal-btn"
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAiConsultation(batch);
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg transition shrink-0 flex items-center justify-center space-x-1 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Ask Gemini AI</span>
                </button>
              </div>

              {/* Option 3: Operational History / Audit */}
              {onViewHistory && (
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 transition flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                      <History className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                        3. Review in Operational History
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Audit logged readings, timelines, and raw material intake lineage.
                      </p>
                    </div>
                  </div>
                  <button
                    id="view-history-from-modal-btn"
                    type="button"
                    onClick={() => {
                      onClose();
                      onViewHistory();
                    }}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg transition shrink-0 flex items-center space-x-1 border border-slate-200 dark:border-slate-700"
                  >
                    <span>View Ledger</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Option 4: Launch Next Batch */}
              {onStartNextBatch && (
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 transition flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
                      <PlusCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                        4. Start Next Production Run
                      </h5>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Convert another raw material harvest intake into a tracked batch.
                      </p>
                    </div>
                  </div>
                  <button
                    id="start-next-batch-from-modal-btn"
                    type="button"
                    onClick={() => {
                      onClose();
                      onStartNextBatch();
                    }}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-lg transition shrink-0 flex items-center space-x-1 border border-slate-200 dark:border-slate-700"
                  >
                    <span>New Batch</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer / Close Action */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Admin authorization verified</span>
          </span>

          <button
            id="close-batch-ready-modal-btn"
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs rounded-xl shadow transition"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};
