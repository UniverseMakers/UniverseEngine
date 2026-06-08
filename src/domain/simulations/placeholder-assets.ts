/**
 * Local placeholder asset resolution.
 *
 * The app now prefers a generated run manifest that maps parameter-space points
 * to local asset bundles. Until every simulation family has migrated to that
 * structure, this module still exposes the older flat placeholder fallbacks.
 */

import type { SimParameter } from '../../data/simulations.ts';
import { withBaseUrl } from '../../shared/urls.ts';
import { getVideoMetadataUrl } from './video-run-metadata.ts';

export interface VideoMatch {
  /** URL to the matched placeholder video. */
  url: string;
  /** URL to the live-data CSV for the matched run. */
  liveDataUrl: string;
  /** URL to the run-level summary YAML for the matched run. */
  summaryUrl: string;
  /** Stable run id when sourced from the manifest. */
  runId?: string;
  /** All available views for the matched run. */
  views?: Record<string, string>;
  /** Default or active view id. */
  viewId?: string;
  /** Placeholder distance for the future nearest-neighbour API. */
  distance: number;
}

interface RunManifest {
  version: number;
  runs: RunManifestEntry[];
}

interface RunManifestEntry {
  simulationId: string;
  runId: string;
  parameters?: Record<string, number>;
  parameterDefaults?: Record<string, number>;
  liveDataPath: string;
  summaryPath: string;
  defaultView?: string;
  views: Record<string, string>;
}

let manifestPromise: Promise<RunManifest> | null = null;

/**
 * Resolve the local placeholder video for a simulation family.
 *
 * @param simClassId - Simulation family id.
 * @returns Local asset URL.
 */
export function getLocalPlaceholderVideo(simClassId: string): string {
  switch (simClassId) {
    case 'planetary':
      return withBaseUrl('assets/planet_test.mp4');
    case 'galaxy':
      return withBaseUrl('assets/galaxy_test.mp4');
    case 'cosmos':
      return withBaseUrl('assets/cosmo_test.mp4');
    default:
      return withBaseUrl('assets/galaxy_test.mp4');
  }
}

/**
 * Resolve the local placeholder live-stat CSV for a simulation family.
 *
 * @param simClassId - Simulation family id.
 * @returns Local asset URL.
 */
export function getLocalPlaceholderStats(simClassId: string): string {
  switch (simClassId) {
    case 'planetary':
      return withBaseUrl('assets/planet_test_planetary_stats.csv');
    case 'galaxy':
      return withBaseUrl('assets/galaxy_test_galaxy_stats.csv');
    case 'cosmos':
      return withBaseUrl('assets/cosmo_test_cosmos_stats.csv');
    default:
      return withBaseUrl('assets/galaxy_test_galaxy_stats.csv');
  }
}

/**
 * Manifest-backed nearest-run matcher with placeholder fallbacks.
 *
 * The resolve order is:
 * 1. Try the generated manifest — find the nearest parameter-space neighbor.
 * 2. If the manifest has no entries for this class, fall back to the older
 *    flat placeholder assets (one MP4 + CSV per family).
 *
 * This lets us gradually migrate simulation families to the generated manifest
 * without breaking existing families.
 *
 * @param simClassId - Simulation family id.
 * @param params - Parameter schemas used for normalized nearest-run lookup.
 * @param values - Current parameter values.
 * @returns Matched video URL + placeholder distance.
 */
export async function findNearestVideo(
  simClassId: string,
  params: SimParameter[],
  values: Record<string, number>,
): Promise<VideoMatch> {
  // First, try to find a manifest-backed run for this simulation family.
  const manifestMatch = await findManifestBackedRun(simClassId, params, values);
  if (manifestMatch) {
    return manifestMatch;
  }

  // No manifest entries found — use the legacy flat placeholder assets.
  const fallbackUrl = getLocalPlaceholderVideo(simClassId);
  return {
    url: fallbackUrl,
    liveDataUrl: getLocalPlaceholderStats(simClassId),
    summaryUrl: getVideoMetadataUrl(fallbackUrl),
    distance: 0,
  };
}

/**
 * Load the generated run manifest once and cache it for the session.
 *
 * @returns Parsed manifest payload.
 */
async function loadRunManifest(): Promise<RunManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(withBaseUrl('assets/run-manifest.json'))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load run manifest');
        }
        return (await response.json()) as RunManifest;
      })
      .catch(() => ({ version: 1, runs: [] }));
  }

  return manifestPromise;
}

/**
 * Find the nearest run entry from the generated manifest.
 *
 * We do a simple brute-force nearest-neighbor search over all manifest entries
 * for this simulation family. Each parameter dimension is normalized to 0..1
 * so different scales (e.g. mass vs. redshift) contribute fairly to the distance.
 *
 * @param simClassId - Simulation family id.
 * @param params - Parameter definitions for normalization.
 * @param values - Active user-selected parameter values.
 * @returns Matched run bundle or `null` when unavailable/no video found.
 */
async function findManifestBackedRun(
  simClassId: string,
  params: SimParameter[],
  values: Record<string, number>,
): Promise<VideoMatch | null> {
  const manifest = await loadRunManifest();
  // Filter to only the runs belonging to this simulation family.
  const runs = manifest.runs.filter((entry) => entry.simulationId === simClassId);
  if (runs.length === 0) {
    return null;
  }

  // Brute-force: find the entry with the smallest mean normalized distance.
  let bestEntry = runs[0];
  let bestDistance = getEntryDistance(bestEntry, params, values);

  for (const entry of runs.slice(1)) {
    const distance = getEntryDistance(entry, params, values);
    if (distance < bestDistance) {
      bestEntry = entry;
      bestDistance = distance;
    }
  }

  // Resolve the default view for the best match.
  const viewId = bestEntry.defaultView ?? Object.keys(bestEntry.views)[0];
  const videoPath = bestEntry.views[viewId];

  if (!videoPath) {
    return null;
  }

  return {
    url: withBaseUrl(videoPath),
    liveDataUrl: withBaseUrl(bestEntry.liveDataPath),
    summaryUrl: withBaseUrl(bestEntry.summaryPath),
    runId: bestEntry.runId,
    viewId,
    views: Object.fromEntries(
      Object.entries(bestEntry.views).map(([key, path]) => [key, withBaseUrl(path)]),
    ),
    distance: bestDistance,
  };
}

/**
 * Compute the normalized distance between the active parameter values and one
 * manifest entry.
 *
 * Each parameter is normalized to its own range (0..1) before computing the
 * absolute difference. The final distance is the mean of all per-parameter
 * distances, so it stays in the 0..1 range and is comparable across entries.
 *
 * A distance of 0 is a perfect match; closer to 1 means very different params.
 *
 * @param entry - Manifest run entry.
 * @param params - Parameter definitions.
 * @param values - Current user values.
 * @returns Mean normalized distance (0 = perfect match, lower is better).
 */
function getEntryDistance(
  entry: RunManifestEntry,
  params: SimParameter[],
  values: Record<string, number>,
): number {
  if (params.length === 0) {
    return 0;
  }

  // Sum the normalized per-parameter distances.
  const total = params.reduce((sum, parameter) => {
    const selected = values[parameter.id] ?? parameter.defaultValue;
    const candidate =
      entry.parameters?.[parameter.id] ??
      entry.parameterDefaults?.[parameter.id] ??
      parameter.defaultValue;
    // Normalize by the parameter's range so all dimensions contribute fairly.
    const range = Math.max(parameter.max - parameter.min, 1e-9);
    return sum + Math.abs(selected - candidate) / range;
  }, 0);

  // Return the mean distance across all parameters.
  return total / params.length;
}
