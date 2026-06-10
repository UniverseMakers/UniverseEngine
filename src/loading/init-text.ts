/**
 * YAML-driven initialization text loader.
 *
 * Each simulation class owns a YAML file containing N entries, where each entry
 * offers multiple candidate lines. At runtime we pick a random number (2-4) of
 * lines from each entry to keep the boot sequence varied.
 */

import { parse } from 'yaml';
import type { SimulationClass } from '../selection/simulation-catalog.ts';

import planetaryRaw from './planetary.yaml?raw';
import galaxyRaw from './galaxy.yaml?raw';
import cosmosRaw from './cosmos.yaml?raw';

export interface InitializationLine {
  text: string;
}

interface InitializationOptionFileEntry {
  options: Array<{
    text: string;
  }>;
}

const RAW_BY_CLASS: Record<SimulationClass['id'], string> = {
  planetary: planetaryRaw,
  galaxy: galaxyRaw,
  cosmos: cosmosRaw,
};

/**
 * Build the initializing-terminal line sequence for a simulation family.
 *
 * The YAML file is structured as a list of "entries" (think of them as line
 * slots in the boot sequence). Each entry contains N candidate line options.
 * This helper picks 2-4 options per entry — randomly — so every boot
 * sequence feels slightly different while staying within a curated set of
 * scientifically plausible initialization messages.
 *
 * @param simClass - Active simulation family.
 * @returns Array of lines to print in order (one per YAML entry).
 */
export function getInitializationLines(
  simClass: SimulationClass,
): InitializationLine[] {
  const parsed = parse(RAW_BY_CLASS[simClass.id]) as InitializationOptionFileEntry[];

  return parsed.flatMap((entry, index) => {
    if (!entry.options?.length) {
      throw new Error(
        `Initialization YAML entry ${index} for ${simClass.id} has no options.`,
      );
    }

    const count = randomInteger(2, Math.min(4, entry.options.length));

    return pickRandom(entry.options, count).map((option) => ({
      text: option.text,
    }));
  });
}

/**
 * Return a random integer in the inclusive range `[min, max]`.
 *
 * @param min - Minimum value (inclusive).
 * @param max - Maximum value (inclusive).
 * @returns Random integer.
 */
function randomInteger(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(items: T[], count: number): T[] {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, count);
}
