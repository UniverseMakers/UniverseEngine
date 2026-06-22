/**
 * End-of-run summary overlay.
 *
 * Renders the centered summary overlay shown after playback ends:
 *   - a hero score (Callum's outcome-based closeness for planetary; the app's
 *     similarityScore fallback for any family that has no result bars)
 *   - the resource stats as compact cards (top-right)
 *   - the result-comparison bars (Callum's design, full-width below)
 *   - tap a bar for a detail pop-up
 *   - the user's chosen input parameters beside those bars for context
 *
 * This file intentionally owns both the data-to-view mapping and the DOM
 * construction for the overlay. That keeps the feature self-contained, but it
 * also means a few helpers exist purely to explain the summary's scoring and
 * fallback rules.
 */

import type {
  ResultDisplayConfig,
  SimulationClass,
  StatDisplayConfig,
} from '../selection/simulation-catalog.ts';
import { buildSummaryMetricMap } from './summary-metrics.ts';
import type { VideoRunMetadata } from '../selection/video-run-metadata.ts';
import { SUMMARY_OVERLAY } from '../shared/constants.ts';
import {
  formatCompactNumber,
  formatNumericString,
  formatParameterValue,
  withUnit,
} from '../shared/format.ts';
import { parse } from 'yaml';
import targetMessagesRaw from './summary-target-messages.yaml?raw';

export interface SummaryOverlayController {
  show: () => void;
  hide: () => void;
  setHomeVisible: (visible: boolean) => void;
  update: (
    simClass: SimulationClass,
    values: Record<string, number>,
    videoDurationSeconds: number,
    runMetadata?: VideoRunMetadata | null,
    thumbnail?: string | null,
  ) => void;
}

interface SummaryOverlayOptions {
  onReplay: () => void;
  onParameters: () => void;
  onHome: () => void;
  showHome: boolean;
}

interface ScientificBarDatum {
  id: string;
  label: string;
  value: number;
  rawValue: number;
  formattedValue: string;
  detail: string;
}

interface SummarySectionConfig {
  title: string;
  className: string;
  stats: StatDisplayConfig[];
  maxColumns: number;
  maxWidthRem: number;
  singleRow?: boolean;
}

const TARGET_MESSAGES: Record<string, Record<string, string>> = (() => {
  const raw = parse(targetMessagesRaw) as Record<
    string,
    Record<string, Record<string, string>>
  >;
  const flat: Record<string, Record<string, string>> = {};

  for (const family of Object.values(raw)) {
    for (const [key, messages] of Object.entries(family)) {
      flat[key] = messages;
    }
  }

  return flat;
})();

const GREEN = '#4CD98A';
const AMBER = '#E8951C';
const RED = '#D7372A';
const GREEN_BAND = 0.2;
const AMBER_BAND = 0.5;
const MAX = 2.0;

function verdict(v: number): { word: string; colour: string } {
  const d = Math.abs(v - 1);

  if (d <= GREEN_BAND) return { word: 'On target', colour: GREEN };
  if (d <= AMBER_BAND) return { word: v > 1 ? 'Too high' : 'Too low', colour: AMBER };

  return { word: v > 1 ? 'Way too high' : 'Way too low', colour: RED };
}

/**
 * Map a normalized result ratio onto one of the authored message buckets.
 */
function situation(v: number): string {
  const d = Math.abs(v - 1);
  const high = v >= 1;

  if (d <= GREEN_BAND) return high ? 'greenHigh' : 'greenLow';
  if (d <= AMBER_BAND) return high ? 'amberHigh' : 'amberLow';

  return high ? 'redHigh' : 'redLow';
}

/**
 * Clamp a normalized ratio into the horizontal bar track.
 */
function pos(v: number): number {
  return (Math.min(Math.max(v, 0), MAX) / MAX) * 100;
}

/**
 * Turn a 0-100 score into the hero headline shown above the gauge.
 */
function reaction(p: number): { word: string; colour: string } {
  if (p >= 85) return { word: 'Almost perfect', colour: GREEN };
  if (p >= 65) return { word: 'Really close', colour: GREEN };
  if (p >= 45) return { word: 'Getting there', colour: AMBER };
  if (p >= 25) return { word: 'Not quite', colour: AMBER };

  return { word: 'Way off - try again', colour: RED };
}

/**
 * Resolve the explanatory sentence shown when a user opens a result bar.
 *
 * We first prefer a YAML-authored message keyed by result id (or label as a
 * fallback for older content). If no tailored copy exists we still produce a
 * sensible generic message from the score bucket.
 */
function detailForTarget(id: string, label: string, value: number): string {
  const s = situation(value);
  const message = TARGET_MESSAGES[id]?.[s] ?? TARGET_MESSAGES[label]?.[s];

  if (message) {
    return message;
  }

  const vd = verdict(value);

  if (vd.colour === GREEN) {
    return `${label} is very close to the target value for this simulation.`;
  }

  if (value < 1) {
    return `${label} is below the target value for this simulation.`;
  }

  return `${label} is above the target value for this simulation.`;
}

/**
 * Build the per-result bar data shown in the lower comparison section.
 *
 * Each bar compares a resolved value against a configured target and stores
 * both the raw resolved number and a formatted display string. The normalized
 * `value` field is the only one used for scoring and pointer placement.
 */
function buildScientificBars(
  simClass: SimulationClass,
  values: Record<string, number>,
  runMetadata: VideoRunMetadata | null | undefined,
): ScientificBarDatum[] {
  return simClass.metadata.results
    .map((result) => {
      const resolved = resolveScientificValue(result, simClass, values, runMetadata);

        if (resolved === null) {
          return null;
        }

        // Normalize against the configured target so every bar can share the
        // same visual scale: 1.0 means exactly on target, 0.5 means half the
        // target value, 2.0 means double, and anything higher is clamped later.
        const normalizedValue = resolved / Math.max(result.target, 1e-9);
      const label = resolveScientificLabel(result, simClass, runMetadata);
      const detail = detailForTarget(result.id, label, normalizedValue);
      const formattedValue = withUnit(formatSummaryValue(String(resolved), result), result.unit);

      return {
        id: result.id,
        label,
        value: normalizedValue,
        rawValue: resolved,
        formattedValue,
        detail,
      };
    })
    .filter((bar) => bar !== null) as ScientificBarDatum[];
}

/**
 * Resolve the number to compare against a result target.
 *
 * Resolution order matters:
 * 1. User-selected parameter value when the result refers to a slider.
 * 2. Parameter values saved with the chosen run sidecar.
 * 3. Arbitrary numeric summary metrics from the sidecar.
 * 4. YAML-authored fallback value.
 */
function resolveScientificValue(
  result: ResultDisplayConfig,
  simClass: SimulationClass,
  values: Record<string, number>,
  runMetadata: VideoRunMetadata | null | undefined,
): number | null {
  const id = result.id;
  const selectedParameter = simClass.parameters.find(
    (parameter) => parameter.id === id,
  );

  if (selectedParameter) {
    // Intentional: the scientific bars score the user's chosen slider values,
    // not the nearest precomputed run's exact parameters. The manifest match is
    // only used to choose which video to play back.
    return values[id] ?? selectedParameter.fallbackValue;
  }

  const parameterValue = runMetadata?.parameterValues[id];

  if (typeof parameterValue === 'number' && Number.isFinite(parameterValue)) {
    return parameterValue;
  }

  const summaryValue = parseNumeric(runMetadata?.summaryMetrics[id]?.value);

  if (summaryValue !== null) {
    return summaryValue;
  }

  const configuredFallback = parseNumeric(
    result.value,
  );

  return configuredFallback;
}

/**
 * Resolve the label for a result bar from the most specific source available.
 */
function resolveScientificLabel(
  result: ResultDisplayConfig,
  simClass: SimulationClass,
  runMetadata: VideoRunMetadata | null | undefined,
): string {
  const id = result.id;

  return (
    result.label ??
    simClass.parameters.find((parameter) => parameter.id === id)?.label ??
    runMetadata?.summaryMetrics[id]?.label ??
    id
  );
}

/**
 * Parse a maybe-numeric string, returning null for absent or invalid input.
 */
function parseNumeric(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Convert the result bars into a single 0-100 outcome score.
 *
 * Each bar contributes linearly based on its distance from the ideal ratio of
 * 1.0, with values more than one target-width away bottoming out at zero.
 */
function outcomeScore(scientificBars: ScientificBarDatum[]): number {
  if (scientificBars.length === 0) {
    return 0;
  }

  const total = scientificBars.reduce(
    (sum, bar) => sum + Math.max(0, 1 - Math.abs(bar.value - 1)),
    0,
  );

  return Math.round((total / scientificBars.length) * 100);
}

export function createSummaryOverlay(
  container: HTMLElement,
  options: SummaryOverlayOptions,
): SummaryOverlayController {
  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--summary';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  let hideTimer: number | undefined;

  const panel = document.createElement('div');

  panel.className = 'summary-overlay';

  const header = document.createElement('div');
  const content = document.createElement('div');

  header.className = 'summary-overlay__header';
  content.className = 'summary-overlay__content';

  const title = document.createElement('p');

  title.className = 'summary-overlay__title';
  title.textContent = 'Run Summary';

  const panelHint = document.createElement('p');

  panelHint.className = 'summary-overlay__hint';
  panelHint.textContent = 'Select any card for more details';

  header.appendChild(title);
  header.appendChild(panelHint);

  const actions = document.createElement('div');

  actions.className = 'summary-overlay__actions';

  const replayButton = document.createElement('button');

  replayButton.className = 'summary-overlay__button summary-overlay__button--primary';
  replayButton.type = 'button';
  replayButton.textContent = 'Continue Exploring';

  const newButton = document.createElement('button');
  const homeButton = document.createElement('button');

  newButton.className = 'summary-overlay__button';
  newButton.type = 'button';
  newButton.textContent = 'New Parameters';

  homeButton.className = 'summary-overlay__button';
  homeButton.type = 'button';
  homeButton.textContent = 'Home';
  homeButton.hidden = !options.showHome;

  replayButton.addEventListener('click', options.onReplay);
  newButton.addEventListener('click', options.onParameters);
  homeButton.addEventListener('click', options.onHome);

  actions.appendChild(replayButton);
  actions.appendChild(newButton);
  actions.appendChild(homeButton);

  panel.appendChild(header);
  panel.appendChild(content);
  panel.appendChild(actions);
  overlay.appendChild(panel);

  const modal = document.createElement('div');

  modal.className = 'sci-modal is-hidden';
  modal.innerHTML = `
    <div class="sci-modal__card">
      <button class="sci-modal__close" type="button" aria-label="Close">&#10005;</button>
      <div class="sci-modal__title"></div>
      <div class="sci-modal__verdict"></div>
      <div class="sci-modal__body"></div>
    </div>
  `;
  overlay.appendChild(modal);
  container.appendChild(overlay);

  const modalTitle = modal.querySelector('.sci-modal__title') as HTMLElement;
  const modalVerdict = modal.querySelector('.sci-modal__verdict') as HTMLElement;
  const modalBody = modal.querySelector('.sci-modal__body') as HTMLElement;
  const modalClose = modal.querySelector('.sci-modal__close') as HTMLElement;

  // The same modal is reused for both result bars and info cards so we only
  // maintain one focus/close behavior and one piece of DOM.
  function openModal(bar: ScientificBarDatum): void {
    const vd = verdict(bar.value);

    modalTitle.textContent = bar.label;
    modalVerdict.textContent = vd.word;
    modalVerdict.style.color = vd.colour;
    modalVerdict.hidden = false;
    modalBody.textContent = bar.detail;
    modal.classList.remove('is-hidden');
  }

  function openCardModal(title: string, description: string): void {
    modalTitle.textContent = title;
    modalVerdict.hidden = true;
    modalBody.textContent = description;
    modal.classList.remove('is-hidden');
  }

  function closeModal(): void {
    modal.classList.add('is-hidden');
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  function buildMetricSection(
    config: SummarySectionConfig,
    availableMetrics: Record<string, { label: string; value: string }>,
  ): HTMLElement {
    const section = document.createElement('div');

    section.className = `${config.className} panel`;
    section.innerHTML = `<p class="sci-section__title">${config.title}</p>`;

    const grid = document.createElement('div');
    const columnCount = config.singleRow
      ? Math.max(1, config.stats.length)
      : Math.max(1, Math.min(config.stats.length, config.maxColumns));

    grid.className = 'metric-grid';
    if (config.singleRow) {
      grid.classList.add('metric-grid--single-row');
    }

    // The section config controls both how many cards may appear per row and
    // the max width of the whole section so YAML can tune layout without the
    // rendering code needing family-specific branches.
    grid.style.setProperty('--summary-grid-columns', String(columnCount));
    grid.style.setProperty('--summary-grid-max-width', `${config.maxWidthRem}rem`);

    for (const stat of config.stats) {
      const metric = selectMetric(stat, availableMetrics);
      const card = document.createElement('div');
      const label = document.createElement('span');
      const value = document.createElement('span');

      card.className = 'res-card';
      label.className = 'res-card__label';
      label.textContent = metric.label;
      value.className = 'res-card__value';
      value.textContent = metric.value;
      card.appendChild(label);
      card.appendChild(value);

      if (stat.description) {
        card.classList.add('res-card--has-info');
        card.addEventListener('click', () => {
          openCardModal(metric.label, stat.description!);
        });
      }

      grid.appendChild(card);
    }

    section.appendChild(grid);

    return section;
  }

  return {
    show() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = undefined;
      }

      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
      overlay.classList.remove('is-visible');

      // Force a layout pass so re-adding `is-visible` reliably retriggers the
      // CSS transition even when the overlay is shown repeatedly in one session.
      void overlay.offsetWidth;

      requestAnimationFrame(() => {
        overlay.classList.add('is-visible');
      });
    },

    hide() {
      overlay.classList.remove('is-visible');

      hideTimer = window.setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.add('is-hidden');
        hideTimer = undefined;
      }, SUMMARY_OVERLAY.HIDE_AFTER_MS);
    },

    setHomeVisible(visible) {
      homeButton.hidden = !visible;
    },

    update(
      simClass: SimulationClass,
      values: Record<string, number>,
      videoDurationSeconds: number,
      runMetadata?: VideoRunMetadata | null,
      thumbnail?: string | null,
    ) {
      content.innerHTML = '';
      closeModal();

      // Rebuild the summary from scratch on every update. The overlay is shown
      // only at coarse checkpoints, so a full rerender is simpler and safer
      // than diffing several conditional sections by hand.
      const available = buildSummaryMetricMap(
        simClass,
        values,
        videoDurationSeconds,
        runMetadata,
      );
      const stats = simClass.metadata.summaryStats;
      const scientificBars = buildScientificBars(simClass, values, runMetadata);
      const resultIds = new Set(scientificBars.map((bar) => bar.id));

      let score: number;

      if (scientificBars.length > 0) {
        // Prefer the richer result-bar score when targets exist for this family.
        score = outcomeScore(scientificBars);
      } else {
        // Otherwise fall back to the generic similarity metric generated by the
        // summary-metrics module.
        const scoreStr = available.similarityScore?.value ?? '0/100';

        score = parseInt(scoreStr, 10) || 0;
      }

      const react = reaction(score);
      const topRow = document.createElement('div');
      const mainColumn = document.createElement('div');
      const rightColumn = document.createElement('div');

      topRow.className = 'sci-top';
      mainColumn.className = 'summary-main-column';
      rightColumn.className = 'summary-side-column';

      const hero = document.createElement('div');

      hero.className = 'sci-hero panel';

      if (thumbnail) {
        // Some experiences want the finished frame to be the visual hero rather
        // than the numeric score block.
        hero.classList.add('sci-hero--thumbnail');
        hero.innerHTML = `<img class="sci-hero__thumbnail" src="${thumbnail}" alt="Final frame of simulation" />`;
      } else {
        hero.innerHTML = `
          <div class="sci-hero__score">
            <span class="sci-hero__num">${score}</span><span class="sci-hero__outof">/100</span>
          </div>
          <div class="sci-hero__reaction" style="color:${react.colour}">${react.word}</div>
          <div class="sci-hero__gauge">
            <div class="sci-hero__gauge-fill" style="width:${score}%; background:${react.colour}; box-shadow:0 0 12px ${react.colour}"></div>
          </div>
        `;
      }

      mainColumn.appendChild(hero);

      const resStats = stats.filter(
        (stat) =>
          (stat.section ?? 'resources') === 'resources' &&
          !scientificBars.some((bar) => bar.id === String(stat.id)) &&
          stat.id !== 'similarityScore',
      );
      const simulationStats = stats.filter(
        (stat) =>
          stat.section === 'simulationStats' &&
          !resultIds.has(String(stat.id)),
      );

      // Any stat whose id is already visualized as a result bar is suppressed
      // here to avoid duplicate information appearing as both a card and a bar.

      if (resStats.length > 0) {
        rightColumn.appendChild(
          buildMetricSection(
            {
              title: 'Resources Used',
              className: 'res-section',
              stats: resStats,
              maxColumns: 3,
              maxWidthRem: 48,
            },
            available,
          ),
        );
      }

      if (simulationStats.length > 0) {
        rightColumn.appendChild(
          buildMetricSection(
            {
              title: 'Simulation Stats',
              className: 'res-section',
              stats: simulationStats,
              maxColumns: simulationStats.length,
              maxWidthRem: 48,
              singleRow: true,
            },
            available,
          ),
        );
      }

      topRow.appendChild(mainColumn);

      if (rightColumn.childElementCount > 0) {
        topRow.appendChild(rightColumn);
      }

      content.appendChild(topRow);

      if (scientificBars.length > 0) {
        const bottomRow = document.createElement('div');

        bottomRow.className = 'sci-bottom-row';

        const paramSection = document.createElement('div');

        paramSection.className = 'sci-section panel param-section';
        paramSection.innerHTML =
          '<p class="sci-section__title">Input Parameters</p>';

        const paramCards = document.createElement('div');

        paramCards.className = 'param-cards';

        for (const param of simClass.parameters) {
          const rawValue = values[param.id] ?? param.fallbackValue;
          const displayUnit = param.displayUnit ?? param.unit;

          const card = document.createElement('div');
          const label = document.createElement('span');
          const value = document.createElement('span');

          card.className = 'res-card';
          if (param.description) {
            card.classList.add('res-card--has-info');
            card.addEventListener('click', () =>
              openCardModal(param.label, param.description!),
            );
          }

          label.className = 'res-card__label';
          label.textContent = param.label;
          value.className = 'res-card__value';
          const formatted = formatParameterValue(rawValue, param.step, {
            scale: param.valueScale,
            format: param.displayFormat,
            significantFigures: param.displaySignificantFigures,
          });

          // Parameters always show the player's chosen values, not the matched
          // run's nearest-neighbor values. That keeps the summary faithful to
          // the user's input even when playback came from a nearby precomputed run.
          value.textContent = withUnit(formatted, displayUnit);
          card.appendChild(label);
          card.appendChild(value);
          paramCards.appendChild(card);
        }

        paramSection.appendChild(paramCards);

        const sciSection = document.createElement('div');
        const sciHeader = document.createElement('div');
        const sciTitle = document.createElement('p');
        const sciHint = document.createElement('p');

        sciSection.className = 'sci-section panel';
        sciHeader.className = 'sci-section__header';
        sciTitle.className = 'sci-section__title';
        sciTitle.textContent = 'Similarity Results';
        sciHint.className = 'sci-section__hint';
        sciHint.textContent = 'Select any bar for details';
        sciHeader.appendChild(sciTitle);
        sciHeader.appendChild(sciHint);

        const list = document.createElement('div');

        list.className = 'sci-bars';

        for (const bar of scientificBars) {
          const row = document.createElement('div');

          // The pointer's horizontal position uses the normalized ratio rather
          // than an absolute quantity, letting masses, counts, and temperatures
          // share the same visual treatment.
          row.className = 'sci-bar';
          row.innerHTML = `
            <div class="sci-bar__name">${bar.label}</div>
            <div class="sci-track">
              <div class="sci-pointer" style="left:${pos(bar.value)}%">
                <div class="sci-pointer__needle"></div>
                <div class="sci-pointer__node"></div>
              </div>
            </div>
            <div class="sci-bar__value">${bar.formattedValue}</div>
          `;
          row.addEventListener('click', () => openModal(bar));
          list.appendChild(row);
        }

        sciSection.appendChild(sciHeader);
        sciSection.appendChild(list);
        bottomRow.appendChild(paramSection);
        bottomRow.appendChild(sciSection);
        content.appendChild(bottomRow);
      }
    },
  };
}

/**
 * Pick one displayable metric row given YAML display config.
 *
 * The metric dictionary is intentionally sparse: some values are generated in
 * code, some come from per-run sidecar YAML, and some are only defaults in the
 * summary config. This helper merges those sources into one displayable row.
 */
function selectMetric(
  stat: StatDisplayConfig,
  availableMetrics: Record<string, { label: string; value: string }>,
): { label: string; value: string } {
  const metric = availableMetrics[stat.id] ?? { label: stat.id, value: '--' };
  const resolvedValue = metric.value !== '--' ? metric.value : (stat.value ?? '--');
  const formattedCarbon = formatCarbonMetric(resolvedValue, stat);

  if (formattedCarbon) {
    return {
      label: stat.label ?? metric.label,
      value: formattedCarbon,
    };
  }

  const formattedValue = formatSummaryValue(resolvedValue, stat);

  return {
    label: stat.label ?? metric.label,
    value: withUnit(formattedValue, stat.unit),
  };
}

/**
 * Special-case carbon so sub-kilogram values switch to grams.
 */
function formatCarbonMetric(value: string, stat: StatDisplayConfig): string | null {
  if (stat.id !== 'carbonBurnt' || value === '--') {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return withUnit(value, stat.unit);
  }

  if (Math.abs(numeric) < 1) {
    return withUnit(
      formatNumericString(value, {
        scale: (stat.valueScale ?? 1) * 1000,
        mode: 'float',
        precision: 1,
      }),
      'g CO2',
    );
  }

  return withUnit(
    formatNumericString(value, {
      scale: stat.valueScale,
      mode: 'float',
      precision: stat.precision ?? 2,
    }),
    stat.unit,
  );
}

/**
 * Apply YAML-configured summary formatting to one resolved value.
 *
 * Formatting is intentionally permissive: if a value is not numeric we return
 * it unchanged so authored strings such as "100/100" or "Present" survive.
 */
function formatSummaryValue(value: string, stat: StatDisplayConfig): string {
  if (value === '--') {
    return value;
  }

  if (
    stat.displayFormat === 'scientific' ||
    stat.displayFormat === 'compact' ||
    stat.displayFormat === 'float'
  ) {
    return formatNumericString(value, {
      scale: stat.valueScale,
      mode: stat.displayFormat,
      precision: stat.precision,
    });
  }

  if (stat.displayFormat === 'integer') {
    return formatNumericString(value, {
      scale: stat.valueScale,
      mode: 'integer',
    });
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  const scale = stat.valueScale ?? 1;
  const scaled = numeric * scale;

  return formatCompactNumber(scaled);
}
