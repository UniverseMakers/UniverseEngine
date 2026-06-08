/**
 * YAML-driven initialization text loader.
 *
 * Each simulation class owns a YAML file containing N entries, where each entry
 * offers multiple candidate lines. At runtime we pick one random line from each
 * entry.
 */

import { parse } from 'yaml';
import type { SimulationClass } from '../data/simulations.ts';

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
 * This helper picks exactly one option per entry — randomly — so every boot
 * sequence feels slightly different while staying within a curated set of
 * scientifically plausible initialization messages.
 *
 * @param simClass - Active simulation family.
 * @returns Array of lines to print in order (one per YAML entry).
 */
export function getInitializationLines(
  simClass: SimulationClass,
): InitializationLine[] {
  // Parse the YAML for this simulation family. Each entry yields exactly one line.
  const parsed = parse(RAW_BY_CLASS[simClass.id]) as InitializationOptionFileEntry[];

  return parsed.flatMap((entry, index) => {
    if (!entry.options?.length) {
      throw new Error(
        `Initialization YAML entry ${index} for ${simClass.id} has no options.`,
      );
    }

    // Randomly select one of the candidate lines for this entry slot.
    const option = entry.options[randomInteger(0, entry.options.length - 1)];

    return [
      {
        text: option.text,
      },
    ];
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
