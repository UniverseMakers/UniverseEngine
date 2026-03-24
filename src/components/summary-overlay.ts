/**
 * End-of-run summary overlay.
 *
 * This module renders the centered summary overlay shown after playback ends.
 * The actual metric derivation now lives in the simulation domain so this file
 * can stay focused on presentation and button wiring.
 */

import type {
  SimulationClass,
  StatDisplayConfig,
  SummaryStatId,
} from '../data/simulations.ts';
import { buildSummaryMetricMap } from '../domain/simulations/summary-metrics.ts';
import type { VideoRunMetadata } from '../domain/simulations/video-run-metadata.ts';
import { SUMMARY_OVERLAY } from '../shared/constants.ts';
import { withUnit } from '../shared/format.ts';

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
 * @returns Controller for show/hide/update.
 */
export function createSummaryOverlay(
  container: HTMLElement,
  options: SummaryOverlayOptions,
): SummaryOverlayController {
  const overlay = document.createElement('section');
  overlay.className = 'overlay overlay--summary';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // Hide/show uses a short fade transition, so we track the last scheduled hide
  // timer to avoid racing `hide()` and `show()` calls.
  let hideTimer: number | undefined;

  const panel = document.createElement('div');
  panel.className = 'summary-overlay';
  panel.innerHTML = `
    <p class="summary-overlay__eyebrow">Simulation Complete</p>
    <h2 class="summary-overlay__title">Run summary</h2>
  `;

  const metrics = document.createElement('div');
  metrics.className = 'summary-overlay__metrics';

  const actions = document.createElement('div');
  actions.className = 'summary-overlay__actions';

  const replayButton = document.createElement('button');
  replayButton.className = 'summary-overlay__button summary-overlay__button--primary';
  replayButton.type = 'button';
  replayButton.textContent = 'Replay';

  const newButton = document.createElement('button');
  newButton.className = 'summary-overlay__button';
  newButton.type = 'button';
  newButton.textContent = 'New';

  const terminalButton = document.createElement('button');
  terminalButton.className = 'summary-overlay__button';
  terminalButton.type = 'button';
  terminalButton.textContent = 'Terminal';

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
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = undefined;
      }

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
      metrics.innerHTML = '';

      for (const metric of buildSummaryMetrics(
        simClass,
        values,
        videoDurationSeconds,
        runMetadata,
      )) {
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
  const availableMetrics: Record<SummaryStatId, { label: string; value: string }> =
    buildSummaryMetricMap(simClass, values, videoDurationSeconds, runMetadata);

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
  const metric = availableMetrics[stat.id] ?? { label: stat.id, value: '--' };
  const resolvedValue = metric.value !== '--' ? metric.value : (stat.value ?? '--');

  return {
    label: stat.label ?? metric.label,
    value: withUnit(resolvedValue, stat.unit),
  };
}
