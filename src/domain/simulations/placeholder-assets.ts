/**
 * Local placeholder asset resolution.
 *
 * Until the app is backed by real remote simulation media and stat streams, we
 * use one local MP4 and one local CSV per simulation family. This module keeps
 * those placeholder paths together so the app shell does not need to hardcode
 * asset filenames inline.
 */

import type { SimParameter } from '../../data/simulations.ts';

export interface VideoMatch {
  /** URL to the matched placeholder video. */
  url: string;
  /** Placeholder distance for the future nearest-neighbour API. */
  distance: number;
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
      return '/assets/planet_test.mp4';
    case 'galaxy':
      return '/assets/galaxy_test.mp4';
    case 'cosmos':
      return '/assets/cosmo_test.mp4';
    default:
      return '/assets/galaxy_test.mp4';
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
      return '/assets/planet_test_planetary_stats.csv';
    case 'galaxy':
      return '/assets/galaxy_test_galaxy_stats.csv';
    case 'cosmos':
      return '/assets/cosmo_test_cosmos_stats.csv';
    default:
      return '/assets/galaxy_test_galaxy_stats.csv';
  }
}

/**
 * Placeholder nearest-video matcher.
 *
 * This is deliberately simple today: it accepts the same arguments a future
 * nearest-neighbour lookup is expected to need, but it currently just returns
 * the local family-specific placeholder video.
 *
 * @param simClassId - Simulation family id.
 * @param _params - Parameter schemas (unused for placeholder lookup).
 * @param _values - Parameter values (unused for placeholder lookup).
 * @param _placeholderUrl - Placeholder image URL (unused for placeholder lookup).
 * @returns Matched video URL + placeholder distance.
 */
export function findNearestVideo(
  simClassId: string,
  _params: SimParameter[],
  _values: Record<string, number>,
  _placeholderUrl: string,
): VideoMatch {
  return {
    url: getLocalPlaceholderVideo(simClassId),
    distance: 0,
  };
}
