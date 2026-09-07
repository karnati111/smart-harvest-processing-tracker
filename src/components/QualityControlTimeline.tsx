import React, { useState, useMemo } from 'react';
import { ProductionBatch, FarmMember, ProgressReading } from '../types';
import {
  Thermometer,
  Droplets,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  PlusCircle,
  FileCheck2,
  Calendar,
  Layers,
  Scale,
  PackageCheck,
  Truck,
  Sparkles,
  Info,
} from 'lucide-react';

interface QualityControlTimelineProps {
  batch: ProductionBatch;
  member: FarmMember;
  onAddReading: (reading: { metric: string; note: string }) => Promise<void>;
  isSubmitting?: boolean;
}

export const QualityControlTimeline: React.FC<QualityControlTimelineProps> = ({
  batch,
  member,
  onAddReading,
  isSubmitting = false,
}) => {
  // QC Quick logger state
  const [qcTemperature, setQcTemperature] = useState('');
  const [qcHumidity, setQcHumidity] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Extract target temperature from conditions
  const targetTemp = batch.conditions?.temperature || '45°C - 55°C';
  const targetHumidity = batch.conditions?.humidity || '< 25% RH';
  const targetDuration = batch.conditions?.duration || '12 - 16 hrs';

  // Find latest temperature reading
  const readings = batch.progressReadings || [];
  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

  // Extract temperature mentions from readings
  const tempReadings = useMemo(() => {
    return readings.filter(
      (r) =>
        r.metric?.toLowerCase().includes('temp') ||
        r.metric?.toLowerCase().includes('°c') ||
        r.note?.toLowerCase().includes('°c') ||
        r.note?.toLowerCase().includes('temp')
    );
  }, [readings]);

  const latestTempReading = tempReadings.length > 0 ? tempReadings[tempReadings.length - 1] : null;

  // Calculate elapsed time from creation
  const getElapsedTime = (timestampStr?: string | any): string => {
    if (!timestampStr) return '';
    const date = new Date(timestampStr);
    const start = new Date(batch.createdAt);
    const diffMs = date.getTime() - start.getTime();
    if (diffMs < 0) return 'At start';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours === 0) return `+${minutes}m`;
    return `+${hours}h ${minutes}m`;
  };

  const handleApplyPreset = (presetText: string) => {
    setActivePreset(presetText);
    setQcNotes(presetText);
  };

  const handleSubmitQcCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcNotes.trim() && !qcTemperature.trim()) return;

    let metricLabel = 'QC Check';
    if (qcTemperature.trim() && qcHumidity.trim()) {
      metricLabel = `Temp: ${qcTemperature.trim()}°C | RH: ${qcHumidity.trim()}%`;
    } else if (qcTemperature.trim()) {
      metricLabel = `Temperature: ${qcTemperature.trim()}°C`;
    } else if (qcHumidity.trim()) {
      metricLabel = `Humidity: ${qcHumidity.trim()}%`;
    }

    const fullNote = [
      qcNotes.trim(),
      qcTemperature ? `Maintained Temp: ${qcTemperature}°C` : null,
      qcHumidity ? `RH: ${qcHumidity}%` : null,
    ]
      .filter(Boolean)
      .join(' • ');

    await onAddReading({
      metric: metricLabel,
      note: fullNote || 'QC Checkpoint verified',
    });

    setQcTemperature('');
    setQcHumidity('');
    setQcNotes('');
    setActivePreset(null);
  };

  return (
    <div
      id={`qc-timeline-${batch.id}`}
      className="space-y-4 bg-slate-50 dark:bg-slate-950/40 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800"
    >
      {/* Header with QC Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              Quality Control &amp; Assurance
            </span>
            <span className="text-slate-400 text-xs">•</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Batch #{batch.id.slice(-6)} • {batch.productName}
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 flex items-center space-x-2">
            <Thermometer className="w-4 h-4 text-rose-500" />
            <span>Temperature Maintained &amp; QC Timeline Audit</span>
          </h4>
        </div>

        <div className="flex items-center space-x-2">
          {latestTempReading ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Temp Checked: {latestTempReading.metric}</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Target: {targetTemp}</span>
            </span>
          )}
        </div>
      </div>

      {/* Target vs. Maintained Temperature Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Target Parameters */}
        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center space-x-1">
            <Thermometer className="w-3.5 h-3.5 text-rose-500" />
            <span>Target Temperature</span>
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-white font-mono">
            {targetTemp}
          </div>
          <div className="text-[10px] text-slate-400">
            Prescribed by Gemini processing schedule
          </div>
        </div>

        {/* Latest Maintained Temp */}
        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center space-x-1">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span>Latest Recorded Reading</span>
          </div>
          <div className="text-base font-bold text-emerald-700 dark:text-emerald-300 font-mono">
            {latestTempReading ? latestTempReading.metric : (latestReading ? latestReading.metric : 'Awaiting Check')}
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {latestTempReading
              ? `${latestTempReading.loggedByName} (${latestTempReading.loggedByRole})`
              : 'Log initial reading below'}
          </div>
        </div>

        {/* Humidity & Duration Standards */}
        <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center space-x-1">
            <Droplets className="w-3.5 h-3.5 text-sky-500" />
            <span>Target RH &amp; Duration</span>
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">
            {targetHumidity} • {targetDuration}
          </div>
          <div className="text-[10px] text-slate-400">
            {readings.length} total checkpoint inspection{readings.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* QC Worker Quick Logger Form */}
      <form
        onSubmit={handleSubmitQcCheck}
        className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
            <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>Log Quality Control Temperature &amp; Condition Check</span>
          </span>
          <span className="text-[10px] text-slate-400">
            Signing as: <strong className="text-slate-700 dark:text-slate-300">{member.roleLabel || member.permissionTier}</strong>
          </span>
        </div>

        {/* Quick Presets for QC Worker */}
        <div className="flex flex-wrap gap-1.5">
          {[
            'Target temperature strictly maintained',
            'Trays rotated & inverted for uniform airflow',
            'Leaves crisping nicely, bright green color preserved',
            'Sensory inspection passed: aroma sweet & clean',
            'Safe dehydration threshold reached (<7% moisture)',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleApplyPreset(preset)}
              className={`text-[10px] px-2 py-1 rounded-md border transition ${
                activePreset === preset
                  ? 'bg-emerald-600 text-white border-emerald-600 font-semibold'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              + {preset}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {/* Temperature input */}
          <div className="relative">
            <input
              type="number"
              step="0.1"
              placeholder="Temp (e.g. 50.5)"
              value={qcTemperature}
              onChange={(e) => setQcTemperature(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <span className="absolute right-2.5 top-1.5 text-xs text-slate-400 font-mono">°C</span>
          </div>

          {/* Humidity input */}
          <div className="relative">
            <input
              type="number"
              step="0.5"
              placeholder="RH % (e.g. 18)"
              value={qcHumidity}
              onChange={(e) => setQcHumidity(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <span className="absolute right-2.5 top-1.5 text-xs text-slate-400 font-mono">%</span>
          </div>

          {/* Notes input */}
          <div className="sm:col-span-2 flex items-center space-x-2">
            <input
              type="text"
              placeholder="Inspection observation / notes..."
              value={qcNotes}
              onChange={(e) => setQcNotes(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={isSubmitting || (!qcNotes.trim() && !qcTemperature.trim())}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition shrink-0"
            >
              {isSubmitting ? 'Saving...' : 'Record Check'}
            </button>
          </div>
        </div>
      </form>

      {/* Visual Chronological Timeline Checking */}
      <div className="space-y-3 pt-2">
        <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Chronological Batch Timeline &amp; Checkpoints</span>
        </h5>

        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          {/* Milestone 1: Raw Material Intake Linked & Inception */}
          <div className="relative group">
            <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
            <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1 shadow-2xs">
              <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                <span className="flex items-center space-x-1">
                  <Scale className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Batch Inception &amp; Raw Material Allocation</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(batch.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                Initiated with <strong>{batch.totalQuantity} {batch.unit}</strong> allocated from raw material intake. Target chamber conditions: <strong>{targetTemp}</strong> at <strong>{targetHumidity}</strong>.
              </p>
            </div>
          </div>

          {/* Milestone 2: Intermediate QC Inspections & Temperature Readings */}
          {readings.map((reading, index) => {
            const isTemp =
              reading.metric?.toLowerCase().includes('temp') ||
              reading.metric?.toLowerCase().includes('°c') ||
              reading.note?.toLowerCase().includes('°c');

            return (
              <div key={reading.id || index} className="relative group">
                <div
                  className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                    isTemp ? 'bg-rose-500' : 'bg-blue-500'
                  }`}
                />
                <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1 shadow-2xs">
                  <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                    <span className="flex items-center space-x-1.5">
                      {isTemp ? (
                        <Thermometer className="w-3.5 h-3.5 text-rose-500" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-blue-500" />
                      )}
                      <span>{reading.metric || 'QC Inspection'}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {getElapsedTime(reading.timestamp)}
                      </span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(reading.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-[11px]">
                    {reading.note}
                  </p>
                  <div className="text-[10px] text-slate-400 flex items-center space-x-2 pt-0.5 border-t border-slate-100 dark:border-slate-850">
                    <span>Verified by: <strong>{reading.loggedByName}</strong></span>
                    <span>•</span>
                    <span className="capitalize">{reading.loggedByRole || 'QC Inspector'}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Milestone 3: Ready for Distribution (if reached) */}
          {batch.status === 'ready' && (
            <div className="relative group">
              <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-white dark:border-slate-900" />
              <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs space-y-1 shadow-2xs">
                <div className="flex items-center justify-between font-bold text-emerald-900 dark:text-emerald-200">
                  <span className="flex items-center space-x-1">
                    <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Batch Marked Ready • Added to Dried Stock</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-mono">
                    {batch.readyAt ? new Date(batch.readyAt).toLocaleString() : 'Ready'}
                  </span>
                </div>
                <div className="text-slate-700 dark:text-slate-300 text-[11px]">
                  Original Dried Leaf Weight: <strong>{batch.driedOutputQuantity !== undefined ? batch.driedOutputQuantity : batch.totalQuantity} {batch.driedOutputUnit || batch.unit}</strong>{' '}
                  {batch.yieldPercentage ? `(${batch.yieldPercentage}% Yield Recovery)` : ''}
                </div>
                {batch.statusNotes && (
                  <p className="text-[11px] text-slate-500 italic mt-0.5">
                    QA Note: {batch.statusNotes}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Milestone 4: Packaged & Dispatched */}
          {batch.status === 'packaged' && (
            <div className="relative group">
              <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-purple-600 border-2 border-white dark:border-slate-900" />
              <div className="p-3 rounded-lg bg-purple-50/70 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 text-xs space-y-1 shadow-2xs">
                <div className="flex items-center justify-between font-bold text-purple-900 dark:text-purple-200">
                  <span className="flex items-center space-x-1">
                    <Truck className="w-3.5 h-3.5 text-purple-600" />
                    <span>Packaged &amp; Dispatched to Logistics</span>
                  </span>
                  <span className="text-[10px] text-purple-700 dark:text-purple-300 font-mono">
                    Completed
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 text-[11px]">
                  Batch sealed and archived into facility completed lots.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
