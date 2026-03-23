/**
 * Credits loaded from YAML.
 *
 * Credits are displayed from the display-mode burger menu. Keeping this list in
 * YAML makes it easy to update attribution text without touching code.
 */

import { parse } from 'yaml';
import creditsRaw from './credits.yaml?raw';

export interface CreditEntry {
  /** Exact text that must appear in the credits. */
  text: string;
}

/**
 * Credits list shown in the Credits view.
 *
 * @returns Array of credit entries.
 */
export function getCredits(): CreditEntry[] {
  const parsed = parse(creditsRaw) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  const credits: CreditEntry[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const text = (entry as { text?: unknown }).text;
    if (typeof text !== 'string' || text.trim().length === 0) {
      continue;
    }

    credits.push({ text });
  }

  return credits;
}
