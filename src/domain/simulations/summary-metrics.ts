/**
 * Summary metric derivation.
 *
 * This module converts a simulation configuration plus the current parameter
 * values into a dictionary of summary metrics. Keeping this logic outside the UI
 * component makes the display layer easier to understand and gives the domain
 * rules a single home.
 */

import type { SimulationClass, SummaryStatId } from '../../data/simulations.ts';

export interface SummaryMetricValue {
  label: string;
  value: string;
}

/**
 * Build the full set of known summary metrics for a completed run.
 *
 * The summary overlay later filters and orders these using the YAML config.
 */
export function buildSummaryMetricMap(
  simClass: SimulationClass,
  values: Record<string, number>,
  videoDurationSeconds: number,
): Record<SummaryStatId, SummaryMetricValue> {
  // Measure how far the selected parameters are from the configured "correct"
  // values. This powers the current lightweight scoring mechanic.
  const normalizedDistances = simClass.parameters.map((parameter) => {
    const value = values[parameter.id] ?? parameter.defaultValue;
    const correctValue =
      simClass.metadata.correctValues[parameter.id] ?? parameter.defaultValue;

    return (
      Math.abs(value - correctValue) / Math.max(parameter.max - parameter.min, 1e-9)
    );
  });

  // Collapse the per-parameter distances into one average score input.
  const meanDistance =
    normalizedDistances.reduce((sum, value) => sum + value, 0) /
    Math.max(normalizedDistances.length, 1);

  // Derive a simple 0-100 score where closer is better.
  const score = Math.max(0, Math.round((1 - meanDistance) * 100));

  // Derive placeholder resource stats from the same distance measure for now.
  const carbonKg = (0.8 + meanDistance * 4.2).toFixed(2);
  const smartphoneUnits = (18 + meanDistance * 46).toFixed(1);
  const memoryGb = (12 + meanDistance * 84).toFixed(1);

  // Derive a few additional summary fields for the end overlay.
  const parameterCount = String(simClass.parameters.length);
  const bestFitDelta = `${(meanDistance * 100).toFixed(1)}%`;
  const terminalLines = String(simClass.parameters.length + 6);
  const audioTrack = 'Present';
  const runtime = formatRuntime(videoDurationSeconds);

  return {
    scale: { label: 'Scale', value: simClass.label },
    distinctSimulations: {
      label: 'Distinct Sims',
      value: String(simClass.metadata.distinctSimulations),
    },
    parameters: { label: 'Parameters', value: parameterCount },
    runtime: { label: 'Total Runtime', value: runtime },
    similarityScore: { label: 'Similarity Score', value: `${score}/100` },
    bestFitDelta: { label: 'Best-Fit Delta', value: bestFitDelta },
    carbonBurnt: { label: 'Carbon Burnt', value: carbonKg },
    computeUsed: { label: 'Compute Used', value: smartphoneUnits },
    memoryUsed: { label: 'Memory Used', value: memoryGb },
    audioTrack: { label: 'Audio Track', value: audioTrack },
    terminalLines: { label: 'Terminal Lines', value: terminalLines },
  };
}

/**
 * Format a duration as `m:ss` for compact HUD-style presentation.
 *
 * @param totalSeconds - Duration in seconds.
 * @returns Duration string.
 */
function formatRuntime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
