/**
 * Shared runtime constants.
 *
 * This module centralizes timing and tuning constants so UX adjustments do not
 * require hunting through individual components. If you need to tweak the boot
 * sequence speed or overlay fade timing, change it here — not in ten places.
 */

/** Initialization/boot-sequence tuning. */
export const INITIALIZATION = {
  /** Constant terminal typing speed (milliseconds per character). */
  TYPING_MS_PER_CHAR: 3.5,
  /** Minimum time the terminal stays visible before transitioning out. */
  MIN_TERMINAL_TIME_MS: 3000,
  /** Final pause after the last line has finished typing. */
  FINAL_PAUSE_MS: 500,
} as const;

/** End-of-run summary overlay transition tuning. */
export const SUMMARY_OVERLAY = {
  /**
   * How long to wait before setting `hidden` after starting fade-out.
   *
   * This should be at least the longest CSS transition used by `.overlay--summary`.
   */
  HIDE_AFTER_MS: 980,
} as const;

/** Bucket-hosted online manifest URL used by online mode. */
export const ONLINE_MANIFEST_URL =
  'https://pub-e00201311979473b8a30e279dcc56838.r2.dev/engine/run-manifest.json';

/**
 * API endpoint for run-selection tracking.
 *
 * Set to your deployed Worker URL.  Leave empty to disable tracking.
 * For local development, this will typically be:
 *   http://localhost:8787/api/track-run
 */
export const TRACKING_API_URL = 'https://universe-engine.universe-engine.workers.dev/api/track-run';
