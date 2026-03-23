/**
 * Shared formatting helpers.
 *
 * This module centralizes tiny formatting utilities that were previously copied
 * across several UI files. Keeping them here makes the display rules easier to
 * explain, easier to test later, and easier to update consistently.
 */

/**
 * Format a numeric value using the decimal precision implied by a parameter step.
 *
 * Example:
 * - step `0.1`   -> 1 decimal place
 * - step `0.01`  -> 2 decimal places
 * - step `1`     -> 0 decimal places
 *
 * @param value - Numeric value to format.
 * @param step - Step size that implies display precision.
 * @returns Formatted string.
 */
export function formatValueByStep(value: number, step: number): string {
  const decimals = countDecimals(step);
  return value.toFixed(decimals);
}

/**
 * Append a unit to a value string when one exists.
 *
 * This keeps units as a separate concern from the numeric/string value itself,
 * which matters now that values can come from config, derived summaries, or
 * future live streams.
 * @param value - Value string.
 * @param unit - Optional unit suffix.
 * @returns Value with unit when provided.
 */
export function withUnit(value: string, unit?: string): string {
  return unit ? `${value} ${unit}` : value;
}

/**
 * Count how many decimal places appear in a numeric step value.
 *
 * The result is used to keep displayed values aligned with the configured
 * precision of each simulation parameter.
 * @param step - Step value.
 * @returns Decimal count.
 */
export function countDecimals(step: number): number {
  const asString = String(step);
  const dotIndex = asString.indexOf('.');
  return dotIndex === -1 ? 0 : asString.length - dotIndex - 1;
}
