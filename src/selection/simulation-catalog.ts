/**
 * Simulation class definitions loaded from YAML.
 *
 * The config is split across YAML files so concerns stay separate:
 * - `simulation-catalog.yaml`   Family metadata (labels, scoring)
 * - `parameter-info.yaml`       Parameter ranges, defaults, and descriptions
 * - `../summaries/summary-stats-config.yaml`  Summary overlay stat config
 * - `../live-data/live-stats-config.yaml`     Live telemetry stat config
 */

import { parse } from 'yaml';
import catalogRaw from './simulation-catalog.yaml?raw';
import paramsRaw from './parameter-info.yaml?raw';
import summaryStatsRaw from '../summaries/summary-stats-config.yaml?raw';
import liveStatsRaw from '../live-data/live-stats-config.yaml?raw';
import { withBaseUrl } from '../shared/urls.ts';

export interface SimParameter {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  description?: string;
  valueScale?: number;
  displayUnit?: string;
  displayFormat?: 'fixed' | 'scientific';
  displaySignificantFigures?: number;
}

export interface SimulationMetadata {
  distinctSimulations: number;
  correctValues: Record<string, number>;
  summaryStats: StatDisplayConfig[];
  liveStats: StatDisplayConfig[];
}

export interface SimulationViewOption {
  id: string;
  label?: string;
  icon?: string;
}

export interface StatDisplayConfig {
  id: StatDisplayId;
  label?: string;
  value?: string;
  unit?: string;
  live?: boolean;
  liveKey?: string;
  fromVideo?: boolean;
  videoKey?: string;
  scaleWithTime?: boolean;
  integer?: boolean;
  valueScale?: number;
  displayFormat?: 'integer' | 'float' | 'scientific';
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
  id: string;
  label: string;
  placeholderImage: string;
  metadata: SimulationMetadata;
  parameters: SimParameter[];
  views: SimulationViewOption[];
}

// ── Raw YAML shapes ────────────────────────────────────────────────────────

interface RawCatalogEntry {
  label: string;
  placeholderImage: string;
  metadata: {
    distinctSimulations: number;
    correctValues: Record<string, number>;
  };
  views?: RawSimulationViewOption[];
}

interface RawParameterConfig {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  default: number;
  description?: string;
  value_scale?: number;
  display_unit?: string;
  display_format?: 'fixed' | 'scientific';
  display_significant_figures?: number;
}

interface RawStatsConfig {
  summaryStats: RawStatDisplayConfig[];
  liveStats: RawStatDisplayConfig[];
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
  display_format?: 'integer' | 'float' | 'scientific';
  precision?: number;
}

// ── Load and merge ─────────────────────────────────────────────────────────

type FamilyId = string;

const catalog = parse(catalogRaw) as Record<FamilyId, RawCatalogEntry>;
const paramsByFamily = parse(paramsRaw) as Record<FamilyId, Record<string, RawParameterConfig>>;
const summaryStatsByFamily = parse(summaryStatsRaw) as Record<FamilyId, RawStatsConfig>;
const liveStatsByFamily = parse(liveStatsRaw) as Record<FamilyId, RawStatsConfig>;

export const SIMULATION_CLASSES: SimulationClass[] = Object.entries(catalog).map(
  ([id, entry]) => {
    const summaryStats = summaryStatsByFamily[id]?.summaryStats ?? [];
    const liveStats = liveStatsByFamily[id]?.liveStats ?? [];
    const rawParams = paramsByFamily[id] ?? {};

    return {
      id,
      label: entry.label,
      placeholderImage: withBaseUrl(entry.placeholderImage),
      metadata: {
        distinctSimulations: entry.metadata.distinctSimulations,
        correctValues: entry.metadata.correctValues,
        summaryStats: summaryStats.map(normalizeStatConfig),
        liveStats: liveStats.map(normalizeStatConfig),
      },
      parameters: Object.entries(rawParams).map(([parameterId, parameter]) => ({
        id: parameterId,
        label: parameter.label,
        unit: parameter.unit ?? '',
        min: parameter.min,
        max: parameter.max,
        step: parameter.step,
        defaultValue: parameter.default,
        description: parameter.description,
        valueScale: parameter.value_scale,
        displayUnit: parameter.display_unit,
        displayFormat: parameter.display_format,
        displaySignificantFigures: parameter.display_significant_figures,
      })),
      views: (entry.views ?? []).map((view) => ({
        id: view.id,
        label: view.label,
        icon: view.icon,
      })),
    };
  },
);

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
    valueScale: config.value_scale,
    displayFormat: config.display_format,
    precision: config.precision,
  };
}
