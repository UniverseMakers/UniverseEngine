/**
 * Shared runtime constants.
 *
 * This module centralizes timing and tuning constants so UX adjustments do not
 * require hunting through individual components.
 */

/** Initialization/boot-sequence tuning. */
export const INITIALIZATION = {
  /** Constant terminal typing speed (milliseconds per character). */
  TYPING_MS_PER_CHAR: 10,
  /** Final throbber time to give visitors a moment to read. */
  FINAL_THROBBER_MS: 500,
  /** Default spinner cadence (milliseconds per frame). */
  THROBBER_STEP_MS: 120,
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
