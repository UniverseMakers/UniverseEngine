/**
 * Nearest-run asset resolution with placeholder fallbacks.
 *
 * Tries a generated run manifest (mapping parameter-space points to asset
 * bundles), then falls back to flat placeholder assets per simulation family.
 */

import type { SimParameter } from './simulation-catalog.ts';
import {
  findBestEntry,
  getEntryDistance,
} from './ngp_parameter_search.ts';
import { withBaseUrl, withQueryParam } from '../shared/urls.ts';
import {
  ONLINE_MANIFEST_BACKUP_URL,
  ONLINE_MANIFEST_URL,
} from '../shared/constants.ts';
import { getVideoMetadataUrl } from './video-run-metadata.ts';
import type { ManifestSource } from '../shared/advanced-settings.ts';
import { logInfo, logWarn } from '../shared/logger.ts';
import {
  clearOnlineAssetHosts,
  configureOnlineAssetHosts,
  resolveOnlineAssetUrl,
  setPreferredOnlineAssetHostMode,
} from '../shared/online-assets.ts';

export interface VideoMatch {
  url: string;
  liveDataUrl: string;
  summaryUrl: string;
  views?: Record<string, string>;
  viewId?: string;
  runId?: string;
}

interface RunManifest {
  version: number;
  primaryBase?: string;
  backupBase?: string;
  runs: RunManifestEntry[];
}

interface RunManifestEntry {
  simulationId: string;
  runId: string;
  parameters?: Record<string, number>;
  liveDataPath: string;
  summaryPath: string;
  defaultView?: string;
  views: Record<string, string>;
}

export interface ManifestController {
  getSource: () => ManifestSource;
  setSource: (source: ManifestSource) => void;
  preloadActiveManifest: () => Promise<void>;
  findNearestVideo: (
    simClassId: string,
    params: SimParameter[],
    values: Record<string, number>,
  ) => Promise<VideoMatch>;
}

const MANIFEST_PATHS: Record<ManifestSource, string> = {
  local: 'assets/local-manifest.json',
  online: ONLINE_MANIFEST_URL,
};

export function createManifestController(
  initialSource: ManifestSource = 'local',
): ManifestController {
  let source = initialSource;
  const manifestPromises = new Map<ManifestSource, Promise<RunManifest>>();
  const manifestCacheKeys = new Map<ManifestSource, string>();

  return {
    getSource() {
      return source;
    },
    setSource(nextSource) {
      manifestPromises.delete(nextSource);
      manifestCacheKeys.delete(nextSource);
      clearOnlineAssetHosts();

      source = nextSource;
      logInfo('Manifest source updated', { source: nextSource });
    },
    async preloadActiveManifest() {
      await loadRunManifest(source, manifestPromises, manifestCacheKeys);
    },
    async findNearestVideo(simClassId, params, values) {
      const manifestMatch = await findManifestBackedRun(
        source,
        manifestPromises,
        manifestCacheKeys,
        simClassId,
        params,
        values,
      );

      if (manifestMatch) {
        return manifestMatch;
      }

      const fallbackUrl = getLocalPlaceholderVideo(simClassId);

      logWarn('Falling back to placeholder assets', {
        simClassId,
        source,
        fallbackUrl,
      });

      return {
        url: fallbackUrl,
        liveDataUrl: getLocalPlaceholderStats(simClassId),
        summaryUrl: getVideoMetadataUrl(fallbackUrl),
      };
    },
  };
}

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
async function loadRunManifest(
  source: ManifestSource,
  manifestPromises: Map<ManifestSource, Promise<RunManifest>>,
  manifestCacheKeys: Map<ManifestSource, string>,
): Promise<RunManifest> {
  const cached = manifestPromises.get(source);

  if (cached) {
    return cached;
  }

  const manifestPath = MANIFEST_PATHS[source];
  const manifestPromise = (source === 'online'
    ? loadOnlineManifest(manifestPath)
    : fetch(withBaseUrl(manifestPath), { cache: 'no-store' }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load manifest: ${manifestPath}`);
        }

        logInfo('Loaded manifest', { source, manifestPath });

        return (await response.json()) as RunManifest;
      }))
    .then((manifest) => {
      manifestCacheKeys.set(source, createManifestCacheKey());

      return manifest;
    })
    .catch((error) => {
      manifestCacheKeys.delete(source);

      logWarn('Manifest unavailable', {
        source,
        manifestPath,
        error: error instanceof Error ? error.message : String(error),
      });

      return { version: 1, runs: [] };
    });

  manifestPromises.set(source, manifestPromise);

  return manifestPromise;
}

async function loadOnlineManifest(manifestPath: string): Promise<RunManifest> {
  const attempts = [manifestPath, ONLINE_MANIFEST_BACKUP_URL];

  for (const attemptUrl of attempts) {
    try {
      const response = await fetch(attemptUrl, { cache: 'no-store' });

      if (!response.ok) {
        continue;
      }

      const manifest = (await response.json()) as RunManifest;
      const primaryBase = manifest.primaryBase ?? getManifestBase(ONLINE_MANIFEST_URL);
      const backupBase = manifest.backupBase ?? getManifestBase(ONLINE_MANIFEST_BACKUP_URL);

      configureOnlineAssetHosts(primaryBase, backupBase);
      if (attemptUrl === ONLINE_MANIFEST_BACKUP_URL) {
        setPreferredOnlineAssetHostMode('backup');
      }

      logInfo('Loaded manifest', {
        source: 'online',
        manifestPath: attemptUrl,
        primaryBase,
        backupBase,
      });

      return manifest;
    } catch {
      continue;
    }
  }

  throw new Error(`Failed to load manifest: ${manifestPath}`);
}

/**
 * Brute-force nearest-neighbor search over the generated manifest.
 * This picks the closest precomputed run for playback only; scoring remains
 * based on the user's chosen slider values elsewhere in the app.
 *
 * @param simClassId - Simulation family id.
 * @param params - Parameter definitions for normalization.
 * @param values - Active user-selected parameter values.
 * @returns Matched run bundle or `null` when unavailable.
 */
async function findManifestBackedRun(
  source: ManifestSource,
  manifestPromises: Map<ManifestSource, Promise<RunManifest>>,
  manifestCacheKeys: Map<ManifestSource, string>,
  simClassId: string,
  params: SimParameter[],
  values: Record<string, number>,
): Promise<VideoMatch | null> {
  const manifest = await loadRunManifest(source, manifestPromises, manifestCacheKeys);
  const runs = manifest.runs.filter((entry) => entry.simulationId === simClassId);

  if (runs.length === 0) {
    logWarn('No manifest runs found for simulation', { simClassId, source });

    return null;
  }

  const best = findBestEntry(runs, params, values) as RunManifestEntry | null;

  if (!best) {
    return null;
  }

  const bestDistance = getEntryDistance(best, params, values);

  const viewId = best.defaultView ?? Object.keys(best.views)[0];
  const videoPath = best.views[viewId];

  if (!videoPath) {
    return null;
  }

  logInfo('Selected manifest-backed run', {
    simClassId,
    source,
    runId: best.runId,
    selectedValues: values,
    distance: bestDistance,
    viewId,
  });

  return {
    url: resolveManifestAssetUrl(source, videoPath, manifestCacheKeys),
    liveDataUrl: resolveManifestAssetUrl(source, best.liveDataPath, manifestCacheKeys),
    summaryUrl: resolveManifestAssetUrl(source, best.summaryPath, manifestCacheKeys),
    viewId,
    runId: best.runId,
    views: Object.fromEntries(
      Object.entries(best.views).map(([key, path]) => [
        key,
        resolveManifestAssetUrl(source, path, manifestCacheKeys),
      ]),
    ),
  };
}

function resolveManifestAssetUrl(
  source: ManifestSource,
  pathOrUrl: string,
  manifestCacheKeys: Map<ManifestSource, string>,
): string {
  const baseUrl = source === 'local' ? withBaseUrl(pathOrUrl) : resolveOnlineAssetUrl(pathOrUrl);
  const manifestCacheKey = manifestCacheKeys.get(source);

  if (!manifestCacheKey) {
    return baseUrl;
  }

  return withQueryParam(baseUrl, '_manifest', manifestCacheKey);
}

function createManifestCacheKey(): string {
  return `${Date.now()}`;
}

function getManifestBase(url: string): string {
  const parsed = new URL(url);

  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * Normalized distance between active parameter values and one manifest entry.
 *
 * Each parameter is normalized to its own range (0..1). Final distance is
 * the mean across all parameters. 0 = perfect match.
 *
 * This is a thin wrapper around the shared implementation in ngp_parameter_search.ts.
 *
 * @param entry - Manifest run entry.
 * @param params - Parameter definitions.
 * @param values - Current user values.
 * @returns Mean normalized distance (lower is better).
 */
