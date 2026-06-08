/**
 * End-of-run summary overlay.
 *
 * This module renders the centered summary overlay shown after playback ends.
 * The actual metric derivation now lives alongside it in this directory so the
 * UI can stay focused on presentation and button wiring.
 */

import type { SimulationClass, StatDisplayConfig } from '../selection/data.ts';
import { buildSummaryMetricMap } from './summary-metrics.ts';
import type { VideoRunMetadata } from '../selection/video-run-metadata.ts';
import { SUMMARY_OVERLAY } from '../shared/constants.ts';
import { formatNumericString, withUnit } from '../shared/format.ts';

export interface SummaryOverlayController {
  /** Reveal the overlay. */
  show: () => void;

  /** Hide the overlay. */
  hide: () => void;

  /** Replace the visible metric payload for the completed run. */
  update: (
    simClass: SimulationClass,
    values: Record<string, number>,
    videoDurationSeconds: number,
    runMetadata?: VideoRunMetadata | null,
  ) => void;
}

interface SummaryOverlayOptions {
  onReplay: () => void;
  onNew: () => void;
  onTerminal: () => void;
}

/**
 * Create and mount the end-of-run summary overlay.
 *
 * @param container - Overlay layer host element.
 * @param options - Button callback hooks.
 *
 * @returns Controller for show/hide/update.
 */
export function createSummaryOverlay(
  container: HTMLElement,
  options: SummaryOverlayOptions,
): SummaryOverlayController {
  // Full-screen shell that fades in above the video once playback ends.
  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--summary';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // Hide/show uses a short fade transition, so we track the last scheduled hide
  // timer to avoid racing `hide()` and `show()` calls.
  let hideTimer: number | undefined;

  // The centered card only owns static chrome. The metric rows are rebuilt on
  // every completed run because the values depend on the selected parameters
  // and whichever metadata file was available for that run.
  const panel = document.createElement('div');

  panel.className = 'summary-overlay';
  panel.innerHTML = `
    <p class="summary-overlay__eyebrow">Simulation Complete</p>
    <h2 class="summary-overlay__title">Run summary</h2>
  `;

  // Metric rows are injected here by `update()` in the exact order declared by
  // the active simulation family's YAML config.
  const metrics = document.createElement('div');

  metrics.className = 'summary-overlay__metrics';

  // Action row stays fixed for every run: replay or start over
  const actions = document.createElement('div');

  actions.className = 'summary-overlay__actions';

  // Add button to replay the current video
  const replayButton = document.createElement('button');

  replayButton.className = 'summary-overlay__button summary-overlay__button--primary';
  replayButton.type = 'button';
  replayButton.textContent = 'Replay';

  // Add button to select new parameters and start a new run
  const newButton = document.createElement('button');

  newButton.className = 'summary-overlay__button';
  newButton.type = 'button';
  newButton.textContent = 'New';

  // Add button to open the terminal view after playback completes.
  const terminalButton = document.createElement('button');

  terminalButton.className = 'summary-overlay__button';
  terminalButton.type = 'button';
  terminalButton.textContent = 'Terminal';

  // The overlay never owns application state. It only forwards user intent back
  // to the app shell which decides what replay/new/terminal actually do.
  replayButton.addEventListener('click', options.onReplay);
  newButton.addEventListener('click', options.onNew);
  terminalButton.addEventListener('click', options.onTerminal);

  actions.appendChild(replayButton);
  actions.appendChild(newButton);
  actions.appendChild(terminalButton);

  panel.appendChild(metrics);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  return {
    show() {
      // If a hide transition was still pending, cancel it so the overlay can't
      // disappear halfway through a fresh reveal.
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = undefined;
      }

      // The over is visible now... but fully transparent and non-interactive
      // until we toggle `is-visible`
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
      overlay.classList.remove('is-visible');

      // Ensure the browser commits the initial (hidden) styles before we toggle
      // `is-visible`. Without this, the first-ever reveal can skip the
      // transition because the element goes from `display:none` -> visible
      // and `opacity:1` in the same style calculation.
      void overlay.offsetWidth;

      // Trigger the CSS transition by toggling `is-visible` on the next frame.
      requestAnimationFrame(() => {
        overlay.classList.add('is-visible');
      });
    },

    hide() {
      // Start the fade-out immediately.
      overlay.classList.remove('is-visible');

      // After the transition, fully remove from layout and interactions.
      hideTimer = window.setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.add('is-hidden');
        hideTimer = undefined;
      }, SUMMARY_OVERLAY.HIDE_AFTER_MS);
    },

    update(
      simClass: SimulationClass,
      values: Record<string, number>,
      videoDurationSeconds: number,
      runMetadata?: VideoRunMetadata | null,
    ) {
      // We rebuild the metric list from scratch each time rather than diffing.
      // The list is tiny, and this keeps the rendering path obvious.
      metrics.innerHTML = '';

      // Get the summary metrics from the shared builder function, which
      // encapsulates all the scoring and resource calculations
      const rows = buildSummaryMetrics(
        simClass,
        values,
        videoDurationSeconds,
        runMetadata,
      );

      // Construct metrics
      for (const metric of rows) {
        const row = document.createElement('div');

        row.className = 'summary-overlay__metric';
        row.innerHTML = `
          <span class="summary-overlay__metric-label">${metric.label}</span>
          <span class="summary-overlay__metric-value">${metric.value}</span>
        `;
        metrics.appendChild(row);
      }
    },
  };
}

/**
 * Build the ordered metric list shown by the summary overlay.
 *
 * @param simClass - Active simulation family.
 * @param values - Active parameter value map.
 * @param videoDurationSeconds - Playback duration.
 * @returns Array of label/value rows.
 */
function buildSummaryMetrics(
  simClass: SimulationClass,
  values: Record<string, number>,
  videoDurationSeconds: number,
  runMetadata?: VideoRunMetadata | null,
): Array<{ label: string; value: string }> {
  // First compute the full dictionary of possible summary metrics. This gives
  // us one place for scoring/resource derivation before the UI applies display
  // ordering and labels from the YAML config.
  const availableMetrics = buildSummaryMetricMap(
    simClass,
    values,
    videoDurationSeconds,
    runMetadata,
  );

  // Then walk the configured summary rows in order so the overlay matches the
  // product-facing YAML rather than the internal dictionary order.
  return simClass.metadata.summaryStats.map((stat) =>
    selectMetric(stat, availableMetrics),
  );
}

/**
 * Pick one displayable metric row given YAML display config.
 *
 * @param stat - Display configuration for one row.
 * @param availableMetrics - Precomputed metric dictionary.
 * @returns Label/value pair for rendering.
 */
function selectMetric(
  stat: StatDisplayConfig,
  availableMetrics: Record<string, { label: string; value: string }>,
): { label: string; value: string } {
  // Prefer the computed metric when available. If the YAML references a metric
  // we don't know about yet, fall back to a placeholder instead of crashing.
  const metric = availableMetrics[stat.id] ?? { label: stat.id, value: '--' };

  // Some YAML rows provide a literal fallback `value`. That gives content for
  // fixed informational rows even when no computed metric exists.
  const resolvedValue = metric.value !== '--' ? metric.value : (stat.value ?? '--');
  const formattedValue = formatSummaryValue(resolvedValue, stat);

  return {
    label: stat.label ?? metric.label,
    value: withUnit(formattedValue, stat.unit),
  };
}

/**
 * Apply YAML-configured summary formatting to one resolved value.
 *
 * @param value - Raw resolved value.
 * @param stat - Summary display config.
 * @returns Display-ready value.
 */
function formatSummaryValue(value: string, stat: StatDisplayConfig): string {
  if (value === '--') {
    return value;
  }

  // If YAML didn't request any numeric transformation, preserve the original
  // string exactly. This matters for values that are already presentation-ready
  // like `97/100` or custom run-metadata strings.
  if (!stat.displayFormat && stat.valueScale === undefined && !stat.integer) {
    return value;
  }

  // Otherwise hand off to the shared formatter so summary rows and live HUD
  // values obey the same precision/scale rules.
  return formatNumericString(value, {
    scale: stat.valueScale,
    mode: stat.displayFormat ?? (stat.integer ? 'integer' : 'float'),
    precision: stat.precision,
  });
}
