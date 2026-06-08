/**
 * Summary metric derivation.
 *
 * This module converts a simulation configuration plus the current parameter
 * values into a dictionary of summary metrics. Keeping this logic in the same
 * directory as the summary overlay makes the feature boundary explicit.
 */

import type { SimulationClass } from '../selection/data.ts';
import type { VideoRunMetadata } from '../selection/video-run-metadata.ts';

export interface SummaryMetricValue {
  label: string;
  value: string;
}

/**
 * Build the full set of known summary metrics for a completed run.
 *
 * The scoring model is intentionally simple: we measure how far the user's
 * selected parameters are from the "correct" values defined in the YAML config
 * (which represent the ground-truth simulation that produced the video). Closer
 * matches get higher similarity scores.
 *
 * For resource metrics (carbon, compute, memory), we use real values from the
 * run metadata when available, or derive plausible-looking placeholder values
 * from the same distance measure so the summary overlay always has data to show.
 *
 * The summary overlay later filters and orders these using the YAML config.
 */
export function buildSummaryMetricMap(
  simClass: SimulationClass,
  values: Record<string, number>,
  videoDurationSeconds: number,
  runMetadata?: VideoRunMetadata | null,
): Record<string, SummaryMetricValue> {
  // ── Step 1: Per-parameter distance ─────────────────────────────────────
  // Measure how far the selected parameters are from the configured "correct"
  // values. Each parameter is normalized to its own range so different scales
  // contribute equally to the final score.
  const normalizedDistances = simClass.parameters.map((parameter) => {
    const value = values[parameter.id] ?? parameter.defaultValue;
    const correctValue =
      simClass.metadata.correctValues[parameter.id] ?? parameter.defaultValue;

    return (
      Math.abs(value - correctValue) / Math.max(parameter.max - parameter.min, 1e-9)
    );
  });

  // ── Step 2: Mean distance across all parameters ─────────────────────────
  // Collapse the per-parameter distances into one average value (0 = perfect).
  const meanDistance =
    normalizedDistances.reduce((sum, value) => sum + value, 0) /
    Math.max(normalizedDistances.length, 1);

  // ── Step 3: Similarity score ────────────────────────────────────────────
  // Invert the distance into a 0-100 score where 100 = perfect match.
  // A mean distance of 0 → score 100; mean distance of 1 → score 0.
  const score = Math.max(0, Math.round((1 - meanDistance) * 100));

  // ── Step 4: Resource stats ──────────────────────────────────────────────
  // Derive placeholder resource stats from the same distance measure for now.
  // These are replaced by real metadata values when the sidecar YAML is available.
  const carbonKg = (runMetadata?.carbonBurnt ?? 0.8 + meanDistance * 4.2).toFixed(2);
  const smartphoneUnits = (runMetadata?.computeUsed ?? 18 + meanDistance * 46).toFixed(
    1,
  );
  const memoryGb = (runMetadata?.memoryUsed ?? 12 + meanDistance * 84).toFixed(1);

  // ── Step 5: Additional derived fields ────────────────────────────────────
  const parameterCount = String(simClass.parameters.length);
  const bestFitDelta = `${(meanDistance * 100).toFixed(1)}%`;
  const terminalLines = String(simClass.parameters.length + 6);
  const audioTrack = 'Present';
  const runtimeHours = formatHoursFromSeconds(
    runMetadata?.wallclockSeconds ?? videoDurationSeconds,
  );

  // ── Step 6: Assemble the final metric dictionary ─────────────────────────
  // The summary overlay will filter and order these using its own YAML config.
  // We also merge in any arbitrary summary metrics from the run metadata YAML
  // under their original keys, so the YAML can define custom metrics per run.
  return {
    scale: { label: 'Scale', value: simClass.label },
    distinctSimulations: {
      label: 'Distinct Sims',
      value: String(simClass.metadata.distinctSimulations),
    },
    parameters: { label: 'Parameters', value: parameterCount },
    runtime: { label: 'Total Runtime', value: runtimeHours },
    similarityScore: { label: 'Similarity Score', value: `${score}/100` },
    bestFitDelta: { label: 'Best-Fit Delta', value: bestFitDelta },
    carbonBurnt: { label: 'Carbon Burnt', value: carbonKg },
    computeUsed: { label: 'Compute Used', value: smartphoneUnits },
    memoryUsed: { label: 'Memory Used', value: memoryGb },
    particlesUpdated: {
      label: 'Particle updates',
      value: runMetadata ? formatCount(runMetadata.particlesUpdated) : '--',
    },
    audioTrack: { label: 'Audio Track', value: audioTrack },
    terminalLines: { label: 'Terminal Lines', value: terminalLines },
    // Merge in any custom metrics from the run metadata YAML (if present).
    // This allows per-run YAML files to define arbitrary additional summary rows.
    ...Object.fromEntries(
      Object.entries(runMetadata?.summaryMetrics ?? {}).map(([key, metric]) => [
        key,
        {
          label: metric.label,
          value: metric.value,
        },
      ]),
    ),
  };
}

/**
 * Format a potentially large count without decimals.
 *
 * Uses the user's locale for digit grouping (e.g. "1,234,567" in en-US).
 *
 * @param value - Count value (e.g. particle update count).
 * @returns Human-friendly integer-ish string.
 */
function formatCount(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return rounded.toLocaleString(undefined);
}

/**
 * Format a duration as hours with at most 2 decimal places.
 *
 * Strips trailing zeros so "8.50" → "8.5" and "12.00" → "12".
 *
 * @param totalSeconds - Duration in seconds.
 * @returns Hours string (e.g. "12.5" for 12.5 hours).
 */
function formatHoursFromSeconds(totalSeconds: number): string {
  const hours = Math.max(0, totalSeconds) / 3600;
  return hours
    .toFixed(2)
    .replace(/\.0+$|(?<=\..*?)0+$/g, '')
    .replace(/\.$/, '');
}
