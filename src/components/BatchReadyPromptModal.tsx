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
    gradeAOutputQuantity: number;
    gradeBOutputQuantity: number;
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

  // Grade A and Grade B input states
  const [gradeAStr, setGradeAStr] = useState<string>(
    batch.gradeAOutputQuantity ? String(batch.gradeAOutputQuantity) : ''
  );
  const [gradeBStr, setGradeBStr] = useState<string>(
    batch.gradeBOutputQuantity ? String(batch.gradeBOutputQuantity) : ''
  );
  const [outputUnit, setOutputUnit] = useState<string>(batch.driedOutputUnit || rawUnit);
  const [notes, setNotes] = useState<string>(batch.statusNotes || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const gradeAQty = parseFloat(gradeAStr) || 0;
  const gradeBQty = parseFloat(gradeBStr) || 0;
  const totalDriedQty = Math.round((gradeAQty + gradeBQty) * 100) / 100;
  const isValid = totalDriedQty > 0;

  // Grade percentages of dried total
  const gradeAPct = totalDriedQty > 0 ? Math.round((gradeAQty / totalDriedQty) * 1000) / 10 : 0;
  const gradeBPct = totalDriedQty > 0 ? Math.round((gradeBQty / totalDriedQty) * 1000) / 10 : 0;

  // Recovery yield vs raw intake
  const yieldPct = rawQuantity > 0 && isValid
    ? Math.round((totalDriedQty / rawQuantity) * 1000) / 10
    : null;

  const lossPct = yieldPct !== null ? Math.max(0, Math.round((100 - yieldPct) * 10) / 10) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (totalDriedQty <= 0) {
      setValidationError('Please enter dried output for at least Grade A or Grade B (positive number).');
      return;
    }

    if (totalDriedQty > rawQuantity * 2) {
      const confirmExceed = window.confirm(
        `Warning: The entered total dried output (${totalDriedQty} ${outputUnit}) exceeds the raw input (${rawQuantity} ${rawUnit}). Is this intentional?`
      );
      if (!confirmExceed) return;
    }

    try {
      await onConfirm({
        driedOutputQuantity: totalDriedQty,
        driedOutputUnit: outputUnit.trim() || rawUnit,
        gradeAOutputQuantity: gradeAQty,
        gradeBOutputQuantity: gradeBQty,
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
                className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight flex items-center space-x-2"
              >
                <span>Input Dried Output by Grade</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Grade A / B Stock
                </span>
              </h3>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium mt-0.5">
                Batch #{batch.id.slice(-6)} • {batch.productName} • Records into Grade Inventory
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
              <span className="text-[11px] text-slate-400 block">Output Unit</span>
              <select
                value={outputUnit}
                onChange={(e) => setOutputUnit(e.target.value)}
                className="mt-1 px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none"
              >
                <option value={rawUnit}>{rawUnit}</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
              </select>
            </div>
          </div>

          {/* Grade A and Grade B Dried Weight Inputs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <Scale className="w-3.5 h-3.5 text-emerald-500" />
                <span>Dried Output by Grade ({outputUnit})</span>
              </span>
              <span className="text-[10px] text-slate-400">
                Grade A (Premium) &amp; Grade B (Secondary)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Grade A Input */}
              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="grade-a-input"
                    className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center space-x-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Grade A Dried Weight</span>
                  </label>
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Premium Quality
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="grade-a-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 5.2"
                    value={gradeAStr}
                    onChange={(e) => setGradeAStr(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono font-bold"
                    autoFocus
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                    {outputUnit}
                  </span>
                </div>
                {totalDriedQty > 0 && gradeAQty > 0 && (
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-400 text-right">
                    {gradeAPct}% of dried output
                  </p>
                )}
              </div>

              {/* Grade B Input */}
              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="grade-b-input"
                    className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center space-x-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Grade B Dried Weight</span>
                  </label>
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    Standard / Secondary
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="grade-b-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 1.3"
                    value={gradeBStr}
                    onChange={(e) => setGradeBStr(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono font-bold"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                    {outputUnit}
                  </span>
                </div>
                {totalDriedQty > 0 && gradeBQty > 0 && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 text-right">
                    {gradeBPct}% of dried output
                  </p>
                )}
              </div>
            </div>

            {/* Total Dried Output Summary Banner */}
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Total Dried Quantity Produced:
              </span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                {totalDriedQty} {outputUnit}
              </span>
            </div>
          </div>

          {/* Live Yield & Loss Analytics Preview */}
          {isValid && yieldPct !== null && (
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
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Dried Stock</span>
                  <strong className="text-emerald-700 dark:text-emerald-300 text-sm font-mono">
                    {totalDriedQty} {outputUnit}
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
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                  {gradeAQty > 0 && (
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{ width: `${Math.min(100, (gradeAQty / (rawQuantity || 1)) * 100)}%` }}
                      title={`Grade A: ${gradeAQty} ${outputUnit}`}
                    />
                  )}
                  {gradeBQty > 0 && (
                    <div
                      className="bg-amber-400 h-full transition-all"
                      style={{ width: `${Math.min(100, (gradeBQty / (rawQuantity || 1)) * 100)}%` }}
                      title={`Grade B: ${gradeBQty} ${outputUnit}`}
                    />
                  )}
                  <div
                    className="bg-slate-300 dark:bg-slate-700 h-full flex-1"
                    title={`Loss: ${lossPct}%`}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>Raw: {rawQuantity} {rawUnit}</span>
                  <span>
                    Grade A: {gradeAQty} | Grade B: {gradeBQty} {outputUnit}
                  </span>
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
              QA &amp; Grading Observations (Optional)
            </label>
            <input
              id="status-notes-input"
              type="text"
              placeholder="e.g. Grade A leaves sorted, vibrant deep green; Grade B contains small stems."
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
              disabled={isSubmitting || totalDriedQty <= 0}
              className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl shadow-sm flex items-center space-x-1.5 transition"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording Grade Inventory...</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Mark Ready &amp; Record Grades</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
