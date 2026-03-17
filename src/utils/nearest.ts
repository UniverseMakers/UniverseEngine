/**
 * Nearest-video matching stub.
 *
 * When Cloudflare R2 integration is added, this module will:
 *  1. Accept the current parameter values for the active simulation class.
 *  2. Query an index of available videos in the parameter hypercube.
 *  3. Find the video whose parameter vector is closest (Euclidean distance
 *     in normalised parameter space) to the user's selection.
 *  4. Return the video URL for streaming.
 *
 * For now it simply returns the placeholder image path.
 */

import type { SimParameter } from '../data/simulations.ts';

export interface VideoMatch {
  /** URL to the matched video (or placeholder image for now) */
  url: string;
  /** Euclidean distance in normalised parameter space (0 = exact match) */
  distance: number;
}

/**
 * Find the nearest video in the parameter hypercube.
 * STUB — always returns the placeholder image with distance 0.
 */
export function findNearestVideo(
  _params: SimParameter[],
  _values: Record<string, number>,
  placeholderUrl: string,
): VideoMatch {
  // TODO: implement real nearest-neighbour search against R2 index
  return {
    url: placeholderUrl,
    distance: 0,
  };
}
