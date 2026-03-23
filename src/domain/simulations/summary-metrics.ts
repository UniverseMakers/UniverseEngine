/**
 * Summary metric derivation.
 *
 * This module converts a simulation configuration plus the current parameter
 * values into a dictionary of summary metrics. Keeping this logic outside the UI
 * component makes the display layer easier to understand and gives the domain
 * rules a single home.
 */

import type { SimulationClass, SummaryStatId } from '../../data/simulations.ts';
import type { VideoRunMetadata } from './video-run-metadata.ts';

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
  runMetadata?: VideoRunMetadata | null,
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
  const carbonKg = (runMetadata?.carbonBurnt ?? 0.8 + meanDistance * 4.2).toFixed(2);
  const smartphoneUnits = (runMetadata?.computeUsed ?? 18 + meanDistance * 46).toFixed(
    1,
  );
  const memoryGb = (runMetadata?.memoryUsed ?? 12 + meanDistance * 84).toFixed(1);

  // Derive a few additional summary fields for the end overlay.
  const parameterCount = String(simClass.parameters.length);
  const bestFitDelta = `${(meanDistance * 100).toFixed(1)}%`;
  const terminalLines = String(simClass.parameters.length + 6);
  const audioTrack = 'Present';
  const runtimeHours = formatHoursFromSeconds(
    runMetadata?.wallclockSeconds ?? videoDurationSeconds,
  );

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
  };
}

/**
 * Format a potentially large count without decimals.
 *
 * @param value - Count value.
 * @returns Human-friendly integer-ish string.
 */
function formatCount(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return rounded.toLocaleString(undefined);
}

/**
 * Format a duration as hours with <= 2 decimals.
 *
 * @param totalSeconds - Duration in seconds.
 * @returns Hours string.
 */
function formatHoursFromSeconds(totalSeconds: number): string {
  const hours = Math.max(0, totalSeconds) / 3600;
  return hours
    .toFixed(2)
    .replace(/\.0+$|(?<=\..*?)0+$/g, '')
    .replace(/\.$/, '');
}
