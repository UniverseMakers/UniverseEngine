/**
 * Nearest-run asset resolution with placeholder fallbacks.
 *
 * Tries a generated run manifest (mapping parameter-space points to asset
 * bundles), then falls back to flat placeholder assets per simulation family.
 */

import type { SimParameter } from './simulation-catalog.ts';
import { withBaseUrl } from '../shared/urls.ts';
import { getVideoMetadataUrl } from './video-run-metadata.ts';

export interface VideoMatch {
  url: string;
  liveDataUrl: string;
  summaryUrl: string;
  views?: Record<string, string>;
  viewId?: string;
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
 * Find the nearest video for the given parameter values.
 *
 * Resolve order: generated manifest → flat placeholder fallbacks.
 *
 * @param simClassId - Simulation family id.
 * @param params - Parameter schemas used for normalized nearest-run lookup.
 * @param values - Current parameter values.
 * @returns Matched video bundle.
 */
export async function findNearestVideo(
  simClassId: string,
  params: SimParameter[],
  values: Record<string, number>,
): Promise<VideoMatch> {
  const manifestMatch = await findManifestBackedRun(simClassId, params, values);

  if (manifestMatch) {
    return manifestMatch;
  }

  const fallbackUrl = getLocalPlaceholderVideo(simClassId);

  return {
    url: fallbackUrl,
    liveDataUrl: getLocalPlaceholderStats(simClassId),
    summaryUrl: getVideoMetadataUrl(fallbackUrl),
  };
}

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
 * Brute-force nearest-neighbor search over the generated manifest.
 *
 * @param simClassId - Simulation family id.
 * @param params - Parameter definitions for normalization.
 * @param values - Active user-selected parameter values.
 * @returns Matched run bundle or `null` when unavailable.
 */
async function findManifestBackedRun(
  simClassId: string,
  params: SimParameter[],
  values: Record<string, number>,
): Promise<VideoMatch | null> {
  const manifest = await loadRunManifest();
  const runs = manifest.runs.filter((entry) => entry.simulationId === simClassId);

  if (runs.length === 0) {
    return null;
  }

  let bestEntry = runs[0];
  let bestDistance = getEntryDistance(bestEntry, params, values);

  for (const entry of runs.slice(1)) {
    const distance = getEntryDistance(entry, params, values);

    if (distance < bestDistance) {
      bestEntry = entry;
      bestDistance = distance;
    }
  }

  const viewId = bestEntry.defaultView ?? Object.keys(bestEntry.views)[0];
  const videoPath = bestEntry.views[viewId];

  if (!videoPath) {
    return null;
  }

  return {
    url: withBaseUrl(videoPath),
    liveDataUrl: withBaseUrl(bestEntry.liveDataPath),
    summaryUrl: withBaseUrl(bestEntry.summaryPath),
    viewId,
    views: Object.fromEntries(
      Object.entries(bestEntry.views).map(([key, path]) => [key, withBaseUrl(path)]),
    ),
  };
}

/**
 * Normalized distance between active parameter values and one manifest entry.
 *
 * Each parameter is normalized to its own range (0..1). Final distance is
 * the mean across all parameters. 0 = perfect match.
 *
 * @param entry - Manifest run entry.
 * @param params - Parameter definitions.
 * @param values - Current user values.
 * @returns Mean normalized distance (lower is better).
 */
function getEntryDistance(
  entry: RunManifestEntry,
  params: SimParameter[],
  values: Record<string, number>,
): number {
  if (params.length === 0) {
    return 0;
  }

  const total = params.reduce((sum, parameter) => {
    const selected = values[parameter.id] ?? parameter.defaultValue;
    const candidate =
      entry.parameters?.[parameter.id] ??
      entry.parameterDefaults?.[parameter.id] ??
      parameter.defaultValue;
    const range = Math.max(parameter.max - parameter.min, 1e-9);

    return sum + Math.abs(selected - candidate) / range;
  }, 0);

  return total / params.length;
}
