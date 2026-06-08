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
  /** Optional numeric multiplier applied only for UI display. */
  valueScale?: number;
  /** Optional display unit override for UI-only formatting. */
  displayUnit?: string;
  /** Optional UI-only formatting mode. */
  displayFormat?: 'fixed' | 'scientific';
  /** Optional significant figures for scientific display. */
  displaySignificantFigures?: number;
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

export interface SimulationViewOption {
  /** Stable id that should match a manifest view key. */
  id: string;
  /** Text label shown in the switcher. */
  label?: string;
  /** Optional icon or glyph shown instead of text. */
  icon?: string;
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
  /** Optional numeric multiplier applied before display. */
  valueScale?: number;
  /** Optional display formatting mode. */
  displayFormat?: 'integer' | 'float' | 'scientific' | 'percentage';
  /** Optional decimal places or significant figures. */
  precision?: number;
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
  /** Optional displayable views for switching between run videos. */
  views: SimulationViewOption[];
}

interface RawParameterConfig {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  default: number;
  value_scale?: number;
  display_unit?: string;
  display_format?: 'fixed' | 'scientific';
  display_significant_figures?: number;
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
  views?: RawSimulationViewOption[];
}

interface RawSimulationViewOption {
  id: string;
  label?: string;
  icon?: string;
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
  value_scale?: number;
  display_format?: 'integer' | 'float' | 'scientific' | 'percentage';
  precision?: number;
}

/**
 * Parsed simulation catalog exported for the rest of the app.
 *
 * We transform the YAML's snake_case keys into camelCase JS interfaces and
 * resolve placeholder image paths through the base URL helper so they work
 * regardless of the deployment path (GitHub Pages, Cloudflare, etc.).
 */
const rawConfig = parse(simConfigRaw) as Record<string, RawSimulationConfig>;

export const SIMULATION_CLASSES: SimulationClass[] = Object.entries(rawConfig).map(
  ([id, config]) => ({
    // Core identity — used everywhere as the primary simulation key.
    id,
    label: config.label,
    icon: config.icon,
    // Make the placeholder image path deployment-aware.
    placeholderImage: withBaseUrl(config.placeholderImage),
    // Metadata: stat display configs get normalized from snake_case.
    metadata: {
      distinctSimulations: config.metadata.distinctSimulations,
      correctValues: config.metadata.correctValues,
      summaryStats: config.metadata.summaryStats.map(normalizeStatConfig),
      liveStats: config.metadata.liveStats.map(normalizeStatConfig),
    },
    // Parameters: each YAML key becomes the param id; snake_case fields map
    // to camelCase properties with fallbacks for optional values.
    parameters: Object.entries(config.parameters).map(([parameterId, parameter]) => ({
      id: parameterId,
      label: parameter.label,
      unit: parameter.unit ?? '',
      min: parameter.min,
      max: parameter.max,
      step: parameter.step,
      defaultValue: parameter.default,
      valueScale: parameter.value_scale,
      displayUnit: parameter.display_unit,
      displayFormat: parameter.display_format,
      displaySignificantFigures: parameter.display_significant_figures,
    })),
    // Optional view definitions for multi-view runs.
    views: (config.views ?? []).map((view) => ({
      id: view.id,
      label: view.label,
      icon: view.icon,
    })),
  }),
);

/**
 * Normalize one stat-display entry from YAML into camelCase JS shape.
 *
 * The YAML uses snake_case fields (`live_key`, `from_video`) because that's
 * standard for YAML config files. This bridge converts them to the camelCase
 * TypeScript interfaces the rest of the app expects.
 *
 * @param config - Raw YAML stat config (snake_case keys).
 * @returns Normalized stat config (camelCase keys).
 */
function normalizeStatConfig(config: RawStatDisplayConfig): StatDisplayConfig {
  return {
    id: config.id,
    label: config.label,
    value: config.value,
    unit: config.unit,
    // Boolean fields default to false unless explicitly set in YAML.
    live: config.live ?? false,
    liveKey: config.live_key,
    fromVideo: config.from_video ?? false,
    videoKey: config.video_key,
    scaleWithTime: config.scale_with_time ?? false,
    integer: config.integer ?? false,
    valueScale: config.value_scale,
    displayFormat: config.display_format,
    precision: config.precision,
  };
}
