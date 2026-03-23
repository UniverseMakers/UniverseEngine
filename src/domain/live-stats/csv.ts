/**
 * Live-stat CSV loading and sampling.
 *
 * The app stores live telemetry in timestamped CSV files. This module is
 * responsible for loading those CSV files, parsing them into frames, and
 * sampling/interpolating values for the current playback time.
 */

export interface LiveStatsFrame {
  t: number;
  values: Record<string, string>;
}

/**
 * Fetch and parse a live-stat CSV file.
 *
 * @param url - URL to fetch.
 * @returns Parsed frame list.
 */
export async function loadLiveStatsCsv(url: string): Promise<LiveStatsFrame[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load live stats CSV: ${url}`);
  }

  const text = await response.text();
  return parseCsv(text);
}

/**
 * Sample the loaded frames at the requested playback time.
 *
 * @param frames - Parsed live-stat frames.
 * @param timeSeconds - Playback timestamp in seconds.
 * @returns Key/value map suitable for UI display.
 */
export function sampleLiveStats(
  frames: LiveStatsFrame[],
  timeSeconds: number,
): Record<string, string> {
  if (frames.length === 0) {
    return {};
  }

  if (timeSeconds <= frames[0].t) {
    return { ...frames[0].values };
  }

  const lastFrame = frames[frames.length - 1];
  if (timeSeconds >= lastFrame.t) {
    return { ...lastFrame.values };
  }

  for (let index = 0; index < frames.length - 1; index += 1) {
    const start = frames[index];
    const end = frames[index + 1];

    if (timeSeconds < start.t || timeSeconds > end.t) {
      continue;
    }

    const fraction = (timeSeconds - start.t) / Math.max(end.t - start.t, 1e-9);
    return interpolateFrameValues(start.values, end.values, fraction);
  }

  return { ...lastFrame.values };
}

/**
 * Convert raw CSV text into timestamped frames.
 *
 * @param text - Raw CSV payload.
 * @returns Parsed frame list.
 */
function parseCsv(text: string): LiveStatsFrame[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const values: Record<string, string> = {};

    for (let index = 1; index < headers.length; index += 1) {
      values[headers[index]] = cells[index] ?? '';
    }

    return {
      t: parseFloat(cells[0] ?? '0') || 0,
      values,
    };
  });
}

/**
 * Split one CSV line while respecting simple quoted cells.
 *
 * @param line - Raw CSV line.
 * @returns Array of cells.
 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells;
}

/**
 * Interpolate one frame of values between two neighboring keyframes.
 *
 * @param start - Values at the start keyframe.
 * @param end - Values at the end keyframe.
 * @param fraction - Normalized interpolation fraction 0..1.
 * @returns Interpolated value map.
 */
function interpolateFrameValues(
  start: Record<string, string>,
  end: Record<string, string>,
  fraction: number,
): Record<string, string> {
  const keys = new Set([...Object.keys(start), ...Object.keys(end)]);
  const output: Record<string, string> = {};

  for (const key of keys) {
    const startValue = start[key] ?? '';
    const endValue = end[key] ?? startValue;
    const startNumber = parseFloat(startValue);
    const endNumber = parseFloat(endValue);

    if (Number.isFinite(startNumber) && Number.isFinite(endNumber)) {
      const value = startNumber + (endNumber - startNumber) * fraction;
      output[key] = formatNumber(value);
      continue;
    }

    output[key] = fraction < 0.5 ? startValue : endValue;
  }

  return output;
}

/**
 * Format a sampled numeric value compactly for UI display.
 *
 * @param value - Numeric value.
 * @returns Compact string representation.
 */
function formatNumber(value: number): string {
  return value
    .toFixed(6)
    .replace(/\.0+$|(?<=\..*?)0+$/g, '')
    .replace(/\.$/, '');
}
