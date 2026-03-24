/**
 * Video-associated run metadata.
 *
 * For now, each video asset has a sidecar YAML file (same basename) that
 * provides the final "run" totals we want to display in the summary overlay.
 *
 * Later this can be replaced by streamed metadata delivered alongside the video.
 */

import { parse } from 'yaml';

export interface VideoRunMetadata {
  /** Total wallclock runtime of the simulation (seconds). */
  wallclockSeconds: number;
  /** Total compute used (smartphone-equivalent units). */
  computeUsed: number;
  /** Peak or total memory footprint (GB). */
  memoryUsed: number;
  /** Total carbon footprint (kgCO2e). */
  carbonBurnt: number;
  /** Total number of particles updated over the run. */
  particlesUpdated: number;
}

/**
 * Convert a video URL into its sidecar metadata URL.
 *
 * @param videoUrl - URL ending in `.mp4`.
 * @returns URL for the YAML sidecar (same basename).
 */
export function getVideoMetadataUrl(videoUrl: string): string {
  return videoUrl.replace(/\.mp4($|\?)/, '.yaml$1');
}

/**
 * Load and parse a video sidecar metadata file.
 *
 * @param url - Metadata URL (usually from `getVideoMetadataUrl`).
 * @returns Parsed metadata, or `null` when missing/invalid.
 */
export async function loadVideoRunMetadata(
  url: string,
): Promise<VideoRunMetadata | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const raw = parse(text) as Partial<Record<keyof VideoRunMetadata, unknown>>;

    const wallclockSeconds = toNumber(raw.wallclockSeconds);
    const computeUsed = toNumber(raw.computeUsed);
    const memoryUsed = toNumber(raw.memoryUsed);
    const carbonBurnt = toNumber(raw.carbonBurnt);
    const particlesUpdated = toNumber(raw.particlesUpdated);

    if (
      wallclockSeconds === null ||
      computeUsed === null ||
      memoryUsed === null ||
      carbonBurnt === null ||
      particlesUpdated === null
    ) {
      return null;
    }

    return {
      wallclockSeconds,
      computeUsed,
      memoryUsed,
      carbonBurnt,
      particlesUpdated,
    };
  } catch {
    return null;
  }
}

/**
 * Convert an unknown YAML value into a finite number.
 *
 * @param value - Raw YAML value.
 * @returns Number when valid, otherwise `null`.
 */
function toNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
