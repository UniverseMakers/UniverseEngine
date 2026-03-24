/**
 * Simulation class definitions loaded from YAML.
 *
 * The YAML source keeps parameter ranges and simulation metadata in one editable
 * place so future data drops can adjust the UI and scoring without touching code.
 */

import { parse } from 'yaml';
import simConfigRaw from './simulations.yaml?raw';
import { withBaseUrl } from '../shared/urls.ts';

export interface SimParameter {
  /** Stable id used as a key in value maps and YAML. */
  id: string;
  /** Human-readable label shown in UI. */
  label: string;
  /** Display unit suffix (may be empty). */
  unit: string;
  /** Minimum selectable value. */
  min: number;
  /** Maximum selectable value. */
  max: number;
  /** Step size used for slider precision and formatting. */
  step: number;
  /** Default value used to seed the editor and fill missing values. */
  defaultValue: number;
}

export interface SimulationMetadata {
  /** Approximate count of distinct simulations in the backing dataset. */
  distinctSimulations: number;
  /** Per-parameter "correct" values used by placeholder scoring. */
  correctValues: Record<string, number>;
  /** Summary overlay rows (ordered). */
  summaryStats: StatDisplayConfig[];
  /** Telemetry panel rows (ordered). */
  liveStats: StatDisplayConfig[];
}

export interface StatDisplayConfig {
  /** Id for the metric. Parameter ids are valid ids too. */
  id: StatDisplayId;
  /** Optional label override for display. */
  label?: string;
  /** Optional placeholder value. */
  value?: string;
  /** Optional unit suffix appended during rendering. */
  unit?: string;
  /** Whether this stat is expected to receive live updates. */
  live?: boolean;
  /** Optional CSV column key to use instead of `id`. */
  liveKey?: string;
  /** When true, pull the final value from the active video's sidecar metadata. */
  fromVideo?: boolean;
  /** Optional metadata key to use instead of `id` when pulling from video. */
  videoKey?: string;
  /** When true and `live`, scale metadata values linearly by video time. */
  scaleWithTime?: boolean;
  /** When true, force numeric values to render as whole numbers. */
  integer?: boolean;
}

export type SummaryStatId =
  | 'scale'
  | 'distinctSimulations'
  | 'parameters'
  | 'runtime'
  | 'similarityScore'
  | 'bestFitDelta'
  | 'carbonBurnt'
  | 'computeUsed'
  | 'memoryUsed'
  | 'particlesUpdated'
  | 'audioTrack'
  | 'terminalLines';

export type StatDisplayId = SummaryStatId | string;

export interface SimulationClass {
  /** Stable id used in URLs, keys, and asset lookup. */
  id: string;
  /** Human label for UI. */
  label: string;
  /** Emoji/icon placeholder (future: SVG). */
  icon: string;
  /** Placeholder preview image shown in config/entry overlays. */
  placeholderImage: string;
  /** Additional metadata used by HUD and scoring. */
  metadata: SimulationMetadata;
  /** Parameter schemas shown in the parameter editor. */
  parameters: SimParameter[];
}

interface RawParameterConfig {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

interface RawSimulationConfig {
  label: string;
  icon: string;
  placeholderImage: string;
  metadata: Omit<SimulationMetadata, 'summaryStats' | 'liveStats'> & {
    summaryStats: RawStatDisplayConfig[];
    liveStats: RawStatDisplayConfig[];
  };
  parameters: Record<string, RawParameterConfig>;
}

interface RawStatDisplayConfig {
  id: StatDisplayId;
  label?: string;
  value?: string;
  unit?: string;
  live?: boolean;
  live_key?: string;
  from_video?: boolean;
  video_key?: string;
  scale_with_time?: boolean;
  integer?: boolean;
}

// Parse the YAML catalog into a raw object keyed by simulation family id.
const rawConfig = parse(simConfigRaw) as Record<string, RawSimulationConfig>;

export const SIMULATION_CLASSES: SimulationClass[] = Object.entries(rawConfig).map(
  ([id, config]) => ({
    id,
    label: config.label,
    icon: config.icon,
    placeholderImage: withBaseUrl(config.placeholderImage),
    metadata: {
      distinctSimulations: config.metadata.distinctSimulations,
      correctValues: config.metadata.correctValues,
      summaryStats: config.metadata.summaryStats.map(normalizeStatConfig),
      liveStats: config.metadata.liveStats.map(normalizeStatConfig),
    },
    parameters: Object.entries(config.parameters).map(([parameterId, parameter]) => ({
      id: parameterId,
      label: parameter.label,
      unit: parameter.unit ?? '',
      min: parameter.min,
      max: parameter.max,
      step: parameter.step,
      defaultValue: parameter.default,
    })),
  }),
);

/**
 * Normalize one stat-display entry from YAML into camelCase JS shape.
 *
 * @param config - Raw YAML stat config.
 * @returns Normalized stat config.
 */
function normalizeStatConfig(config: RawStatDisplayConfig): StatDisplayConfig {
  return {
    id: config.id,
    label: config.label,
    value: config.value,
    unit: config.unit,
    live: config.live ?? false,
    liveKey: config.live_key,
    fromVideo: config.from_video ?? false,
    videoKey: config.video_key,
    scaleWithTime: config.scale_with_time ?? false,
    integer: config.integer ?? false,
  };
}
