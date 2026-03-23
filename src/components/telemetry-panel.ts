/**
 * Telemetry panel (display-mode HUD).
 *
 * The telemetry panel shows a small list of metrics in the top-right corner of
 * display mode. Metrics can come from three sources:
 * - the active simulation parameters (static values from the config overlay)
 * - "summary" metadata fields (e.g. scale, parameter count)
 * - live-stream values (sampled from a CSV stream at the current playback time)
 */
import type {
  SimulationClass,
  StatDisplayConfig,
  SummaryStatId,
} from '../data/simulations.ts';
import { formatValueByStep, withUnit } from '../shared/format.ts';

export interface TelemetryPanelController {
  /** Render metric rows for the active simulation and its current values. */
  update: (
    simClass: SimulationClass,
    values: Record<string, number>,
    liveValues?: Record<string, string>,
  ) => void;
}

/**
 * Create and mount the telemetry panel.
 *
 * @param container - Host element to mount into.
 * @returns Controller for updating visible metrics.
 */
export function createTelemetryPanel(container: HTMLElement): TelemetryPanelController {
  // Outer card element shown in the top-right of display mode.
  const panel = document.createElement('aside');
  panel.className = 'data-panel';

  // Metric rows are rebuilt whenever the active class or values change.
  const metricList = document.createElement('div');
  metricList.className = 'data-panel__metrics';

  panel.appendChild(metricList);
  container.appendChild(panel);

  return {
    update(
      simClass: SimulationClass,
      values: Record<string, number>,
      liveValues: Record<string, string> = {},
    ) {
      // Rebuild the list from scratch. This is simple and perfectly fine for the
      // very small amount of data shown in this panel.
      metricList.innerHTML = '';

      const availableMetrics = buildAvailableMetrics(simClass, values, liveValues);

      for (const stat of simClass.metadata.liveStats) {
        const metric = selectMetric(stat, availableMetrics);
        const row = document.createElement('div');
        row.className = 'data-panel__metric';
        row.innerHTML = `
          <span class="data-panel__metric-label">${metric.label}</span>
          <span class="data-panel__metric-value">${metric.value}</span>
        `;
        metricList.appendChild(row);
      }
    },
  };
}

/**
 * Build a dictionary of candidate metrics keyed by id.
 *
 * @param simClass - Active simulation family.
 * @param values - Active parameter values.
 * @param liveValues - Sampled live values keyed by CSV column.
 * @returns Metric map keyed by metric id.
 */
function buildAvailableMetrics(
  simClass: SimulationClass,
  values: Record<string, number>,
  liveValues: Record<string, string>,
): Record<string, { label: string; value: string }> {
  // Parameter metrics are always available because they are part of the class definition.
  const parameterMetrics = Object.fromEntries(
    simClass.parameters.map((parameter) => [
      parameter.id,
      {
        label: parameter.label,
        value: formatValueByStep(
          values[parameter.id] ?? parameter.defaultValue,
          parameter.step,
        ),
      },
    ]),
  ) as Record<string, { label: string; value: string }>;

  // "Named" metrics are app-defined summary fields that are not parameters.
  const namedMetrics: Partial<Record<SummaryStatId, { label: string; value: string }>> =
    {
      scale: { label: 'Scale', value: simClass.label },
      distinctSimulations: {
        label: 'Distinct Sims',
        value: String(simClass.metadata.distinctSimulations),
      },
      parameters: { label: 'Parameters', value: String(simClass.parameters.length) },
    };

  return {
    ...parameterMetrics,
    ...namedMetrics,
    ...Object.fromEntries(
      Object.entries(liveValues).map(([key, value]) => [
        key,
        { label: key, value: formatMaybeNumber(value) },
      ]),
    ),
  };
}

/**
 * Format a CSV-provided value for display.
 *
 * Most live stat values are numeric strings. For layout stability we cap the
 * visible precision to two decimal places and strip trailing zeros.
 *
 * @param raw - Raw CSV cell value.
 * @returns Display-ready value.
 */
function formatMaybeNumber(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return raw;
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return raw;
  }

  return numeric
    .toFixed(2)
    .replace(/\.0+$|(?<=\..*?)0+$/g, '')
    .replace(/\.$/, '');
}

/**
 * Resolve one display row from YAML config + available metric map.
 *
 * @param stat - YAML-driven display config.
 * @param availableMetrics - Candidate metrics keyed by id.
 * @returns Resolved label/value row.
 */
function selectMetric(
  stat: StatDisplayConfig,
  availableMetrics: Record<string, { label: string; value: string }>,
): { label: string; value: string } {
  // Start from the static config id.
  const metric = availableMetrics[stat.id] ?? { label: stat.id, value: '--' };

  // Optionally point at a different live-stream key.
  const liveKey = stat.liveKey ?? stat.id;
  const liveMetric = availableMetrics[liveKey];

  // Prefer sampled live values when present, then fall back to static/placeholder values.
  const resolvedValue = liveMetric?.value ?? metric.value ?? stat.value ?? '--';
  return {
    label: stat.label ?? liveMetric?.label ?? metric.label,
    value: withUnit(resolvedValue, stat.unit),
  };
}
