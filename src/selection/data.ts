/**
 * Simulation class definitions loaded from YAML.
 *
 * The YAML source keeps parameter ranges and simulation metadata in one editable
 * place so future data drops can adjust the UI and scoring without touching code.
 */

import { parse } from 'yaml';
import simConfigRaw from './data.yaml?raw';
import { withBaseUrl } from '../shared/urls.ts';

export interface SimParameter {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
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
  displayFormat?: 'integer' | 'float' | 'scientific' | 'percentage';
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
  icon: string;
  placeholderImage: string;
  metadata: SimulationMetadata;
  parameters: SimParameter[];
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
      valueScale: parameter.value_scale,
      displayUnit: parameter.display_unit,
      displayFormat: parameter.display_format,
      displaySignificantFigures: parameter.display_significant_figures,
    })),
    views: (config.views ?? []).map((view) => ({
      id: view.id,
      label: view.label,
      icon: view.icon,
    })),
  }),
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
