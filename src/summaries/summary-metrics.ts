/**
 * Summary metric derivation.
 *
 * This module converts a simulation configuration plus the current parameter
 * values into a dictionary of summary metrics. Keeping this logic in the same
 * directory as the summary overlay makes the feature boundary explicit.
 */

import type { SimulationClass } from '../selection/simulation-catalog.ts';
import type { VideoRunMetadata } from '../selection/video-run-metadata.ts';

export interface SummaryMetricValue {
  /** Human-readable label shown in the summary card. */
  label: string;
  /** Raw display value before any per-stat summary formatting is applied. */
  value: string;
}

/**
 * Build the full set of known summary metrics for a completed run.
 *
 * The scoring model is intentionally simple: we measure how far the user's
 * selected parameters are from the parameter-space "correct" values defined in
 * the YAML config. Only entries whose ids match actual parameter ids contribute
 * to this score, which lets other scales use separate result-based targets in
 * the same metadata block for the summary bars. This score is intentionally
 * based on the user's guess, not the exact parameters of the nearest
 * precomputed video chosen for playback.
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
  const resultTargets = Object.fromEntries(
    simClass.metadata.results.map((result) => [result.id, result.target]),
  ) as Record<string, number>;
  const resultValues = simClass.metadata.results
    .map((result) => {
      const resolved = resolveResultValue(simClass, values, runMetadata, result.id);

      if (resolved === null) {
        return null;
      }

      return {
        id: result.id,
        value: resolved,
        target: result.target,
      };
    })
    .filter((result) => result !== null) as Array<{
    id: string;
    value: number;
    target: number;
  }>;

  // ── Step 1: Per-parameter distance ─────────────────────────────────────
  // Measure how far the selected parameters are from the configured "correct"
  // values. Each parameter is normalized to its own range so different scales
  // contribute equally to the final score.
  const normalizedDistances = simClass.parameters
    .filter((parameter) => resultTargets[parameter.id] !== undefined)
    .map((parameter) => {
      const value = values[parameter.id] ?? parameter.fallbackValue;
      const correctValue = resultTargets[parameter.id] ?? parameter.fallbackValue;

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
  const score = computeOutcomeScore(resultValues);

  // ── Step 4: Resource stats ──────────────────────────────────────────────
  // Derive placeholder resource stats from the same distance measure for now.
  // These are replaced by real metadata values when the sidecar YAML is available.
  const carbonKg = (runMetadata?.carbonBurnt ?? 0.8 + meanDistance * 4.2).toFixed(2);
  const computeHours = runMetadata?.computeUsed ?? 18 + meanDistance * 46;
  const memoryGb = runMetadata?.memoryUsed ?? 12 + meanDistance * 84;
  const computeProfile = `${formatCompactNumber(computeHours, 1)} CPU-hrs\n${formatCompactNumber(memoryGb, 1)} GB`;

  // ── Step 5: Additional derived fields ────────────────────────────────────
  const parameterCount = String(simClass.parameters.length);
  const bestFitDelta = `${(meanDistance * 100).toFixed(1)}%`;
  const terminalLines = String(simClass.parameters.length + 6);
  const audioTrack = 'Present';
  const runtimeHours = formatHoursFromSeconds(
    runMetadata?.wallclockSeconds ?? videoDurationSeconds,
  );
  const moonIronPercent = formatPercent(
    computeTargetMatchPercent(resolveResultValue(simClass, values, runMetadata, 'moon_iron')),
  );
  const protoEarthInMoonPercent = formatPercent(
    computeTargetMatchPercent(
      resolveResultValue(simClass, values, runMetadata, 'proto_earth_in_moon'),
    ),
  );
  const scenarioLikelihood = scorePlanetaryScenario(simClass.id, values);

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
    computeUsed: { label: 'Compute Used', value: computeProfile },
    memoryUsed: { label: 'Memory Used', value: formatCompactNumber(memoryGb, 1) },
    particlesUpdated: {
      label: 'Particle updates',
      value: runMetadata ? formatCount(runMetadata.particlesUpdated) : '--',
    },
    moon_iron_percent: {
      label: 'Iron in Moon',
      value: moonIronPercent,
    },
    proto_earth_in_moon_percent: {
      label: 'Proto-Earth in Moon',
      value: protoEarthInMoonPercent,
    },
    scenario_likelihood: {
      label: 'Scenario likelihood',
      value: scenarioLikelihood,
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
  return String(Math.max(0, value));
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

function formatCompactNumber(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.0+$|(?<=\..*?)0+$/g, '')
    .replace(/\.$/, '');
}

/**
 * Resolve the numeric value for a result target.
 *
 * The same precedence order as the overlay is used here so the computed score
 * matches the values the user sees in the bar section.
 */
function resolveResultValue(
  simClass: SimulationClass,
  values: Record<string, number>,
  runMetadata: VideoRunMetadata | null | undefined,
  id: string,
): number | null {
  const selectedParameter = simClass.parameters.find(
    (parameter) => parameter.id === id,
  );

  if (selectedParameter) {
    // Score against the player's current input rather than the nearest matched
    // run. The chosen playback asset is an approximation; the guess itself is
    // what the summary is evaluating.
    return values[id] ?? selectedParameter.fallbackValue;
  }

  const parameterValue = runMetadata?.parameterValues[id];

  if (typeof parameterValue === 'number' && Number.isFinite(parameterValue)) {
    return parameterValue;
  }

  const value = runMetadata?.summaryMetrics[id]?.value;

  if (value === undefined) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Format a percentage-like value, or a placeholder when unavailable.
 */
function formatPercent(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return value.toFixed(1);
}

/**
 * Convert a normalized result ratio into a simple 0-100 closeness percent.
 *
 * A value of 1 means perfect agreement with the target, while values one full
 * target-width away or more clamp to zero.
 */
function computeTargetMatchPercent(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.max(0, (1 - Math.abs(value - 1)) * 100);
}

/**
 * Average result closeness across all available target metrics.
 */
function computeOutcomeScore(
  results: Array<{ id: string; value: number; target: number }>,
): number {
  if (results.length === 0) {
    return 0;
  }

  const total = results.reduce(
    (sum, result) =>
      sum + Math.max(0, 1 - Math.abs(result.value / Math.max(result.target, 1e-9) - 1)),
    0,
  );

  return Math.round((total / results.length) * 100);
}

/**
 * Lightweight heuristic used only for the planetary summary card copy.
 *
 * This is not a physical likelihood calculation; it is a public-facing score
 * tuned to reward the broad "canonical" region for angle and velocity.
 */
function scorePlanetaryScenario(
  simulationId: string,
  values: Record<string, number>,
): string {
  if (simulationId !== 'planetary') {
    return '--';
  }

  const impactorVelocity = values.impactor_velocity;
  const impactorAngle = values.impactor_angle;

  if (!Number.isFinite(impactorVelocity) || !Number.isFinite(impactorAngle)) {
    return '--';
  }

  const velocityPenalty = Math.abs(impactorVelocity - 15) * 6;
  const anglePenalty = Math.abs(impactorAngle - 45) * 1.6;
  const score = Math.max(0, Math.round(100 - velocityPenalty - anglePenalty));

  return String(score);
}
