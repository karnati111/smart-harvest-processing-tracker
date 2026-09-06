import React, { useState } from 'react';
import { ProductionBatch } from '../types';
import { formatQuantityWithUnit } from '../lib/unitUtils';
import {
  PackageCheck,
  Scale,
  Sparkles,
  AlertCircle,
  X,
  Loader2,
  ArrowRight,
  TrendingDown,
  FileCheck2,
} from 'lucide-react';

interface BatchReadyPromptModalProps {
  batch: ProductionBatch;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (data: {
    driedOutputQuantity: number;
    driedOutputUnit: string;
    notes: string;
  }) => Promise<void>;
}

export const BatchReadyPromptModal: React.FC<BatchReadyPromptModalProps> = ({
  batch,
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const rawQuantity = Number(batch.totalQuantity) || 0;
  const rawUnit = batch.unit || 'kg';

  // Default suggested dried quantity: 15% for drying/dehydrating, or empty
  const [outputQuantityStr, setOutputQuantityStr] = useState<string>('');
  const [outputUnit, setOutputUnit] = useState<string>(rawUnit);
  const [notes, setNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const parsedOutputQty = parseFloat(outputQuantityStr);
  const isValidNumber = !isNaN(parsedOutputQty) && parsedOutputQty > 0;

  // Yield & Moisture Loss calculations
  const yieldPct = rawQuantity > 0 && isValidNumber
    ? Math.round((parsedOutputQty / rawQuantity) * 1000) / 10
    : null;

  const lossPct = yieldPct !== null ? Math.max(0, Math.round((100 - yieldPct) * 10) / 10) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!outputQuantityStr || isNaN(parsedOutputQty) || parsedOutputQty <= 0) {
      setValidationError('Please enter a valid positive number for the dried output weight.');
      return;
    }

    if (parsedOutputQty > rawQuantity * 2) {
      const confirmExceed = window.confirm(
        `Warning: The entered dried output (${parsedOutputQty} ${outputUnit}) exceeds the raw input (${rawQuantity} ${rawUnit}). Is this intentional?`
      );
      if (!confirmExceed) return;
    }

    try {
      await onConfirm({
        driedOutputQuantity: parsedOutputQty,
        driedOutputUnit: outputUnit.trim() || rawUnit,
        notes: notes.trim(),
      });
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to advance batch status.');
    }
  };

  return (
    <div
      id="batch-ready-prompt-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ready-prompt-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-emerald-50/70 dark:bg-emerald-950/40">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <PackageCheck className="w-4 h-4" />
            </div>
            <div>
              <h3
                id="ready-prompt-title"
                className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight"
              >
                Record Dried / Finished Output
              </h3>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium mt-0.5">
                Batch #{batch.id.slice(-6)} • {batch.productName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {validationError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Raw Intake Reference Banner */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">
                Raw Material Intake
              </span>
              <span className="text-slate-900 dark:text-white font-bold text-sm">
                {formatQuantityWithUnit(rawQuantity, rawUnit)}
              </span>
              <span className="text-[11px] text-slate-500 block capitalize mt-0.5">
                Process: {batch.processingType || 'Drying'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Intake Records</span>
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                {batch.linkedHarvestLogIds?.length || 1} intake batch{batch.linkedHarvestLogIds?.length !== 1 ? 'es' : ''}
              </span>
            </div>
          </div>

          {/* Dried Output Quantity Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="dried-output-input"
              className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between"
            >
              <span className="flex items-center space-x-1.5">
                <Scale className="w-3.5 h-3.5 text-emerald-500" />
                <span>Actual Dried / Finished Output Weight</span>
                <span className="text-rose-500">*</span>
              </span>
              <span className="text-[10px] font-normal text-slate-400">
                (Enter actual scale reading, not raw weight)
              </span>
            </label>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="dried-output-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="e.g. 6.5"
                  value={outputQuantityStr}
                  onChange={(e) => setOutputQuantityStr(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  autoFocus
                />
              </div>

              <div className="w-28 shrink-0">
                <select
                  value={outputUnit}
                  onChange={(e) => setOutputUnit(e.target.value)}
                  className="w-full px-3 py-2.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value={rawUnit}>{rawUnit}</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="pieces">pieces</option>
                  <option value="packets">packets</option>
                  <option value="l">l</option>
                </select>
              </div>
            </div>
          </div>

          {/* Live Yield & Loss Analytics Preview */}
          {isValidNumber && yieldPct !== null && (
            <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-800 dark:text-emerald-300 font-bold flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Output Yield Performance</span>
                </span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200">
                  {yieldPct}% Yield Recovery
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Dried Stock Created</span>
                  <strong className="text-emerald-700 dark:text-emerald-300 text-sm font-mono">
                    {parsedOutputQty} {outputUnit}
                  </strong>
                </div>
                <div className="bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block flex items-center space-x-1">
                    <TrendingDown className="w-3 h-3 text-amber-500" />
                    <span>Moisture / Weight Loss</span>
                  </span>
                  <strong className="text-slate-700 dark:text-slate-300 text-sm font-mono">
                    {lossPct}% shrinkage
                  </strong>
                </div>
              </div>

              {/* Visual yield ratio bar */}
              <div className="pt-1">
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full transition-all"
                    style={{ width: `${Math.min(100, yieldPct)}%` }}
                    title={`Dried output: ${yieldPct}%`}
                  />
                  <div
                    className="bg-amber-400/60 h-full transition-all"
                    style={{ width: `${Math.max(0, 100 - yieldPct)}%` }}
                    title={`Moisture/dehydration loss: ${lossPct}%`}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Raw: {rawQuantity} {rawUnit}</span>
                  <span>Dried: {parsedOutputQty} {outputUnit}</span>
                </div>
              </div>
            </div>
          )}

          {/* QA & Sensory Notes */}
          <div className="space-y-1.5">
            <label
              htmlFor="status-notes-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              QA &amp; Sensory Notes (Optional)
            </label>
            <input
              id="status-notes-input"
              type="text"
              placeholder="e.g. Crisp leaf texture, target moisture reached (~6.5%), aroma intact"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !outputQuantityStr || !isValidNumber}
              className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl shadow-sm flex items-center space-x-1.5 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording Dried Stock...</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Confirm &amp; Mark Ready</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
