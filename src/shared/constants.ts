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
  TYPING_MS_PER_CHAR: 8.5,
  /** Final pause after the last line has finished typing. */
  FINAL_PAUSE_MS: 1000,
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
