/**
 * End-of-run summary overlay.
 *
 * Renders the centered summary overlay shown after playback ends:
 *   - a hero score (Callum's outcome-based closeness for planetary; the app's
 *     similarityScore for any family that has no scientific bars)
 *   - the resource stats as compact cards (top-right)
 *   - the scientific results as bars (Callum's design, full-width below)
 *   - tap a bar for a detail pop-up
 * The Replay / New buttons are unchanged.
 */

import type {
  SimulationClass,
  StatDisplayConfig,
} from '../selection/simulation-catalog.ts';
import { buildSummaryMetricMap } from './summary-metrics.ts';
import type { VideoRunMetadata } from '../selection/video-run-metadata.ts';
import { SUMMARY_OVERLAY } from '../shared/constants.ts';
import { formatCompactNumber, formatNumericString, withUnit } from '../shared/format.ts';
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
  unit?: string;
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

function situation(v: number): string {
  const d = Math.abs(v - 1);
  const high = v >= 1;

  if (d <= GREEN_BAND) return high ? 'greenHigh' : 'greenLow';
  if (d <= AMBER_BAND) return high ? 'amberHigh' : 'amberLow';

  return high ? 'redHigh' : 'redLow';
}

function pos(v: number): number {
  return (Math.min(Math.max(v, 0), MAX) / MAX) * 100;
}

function reaction(p: number): { word: string; colour: string } {
  if (p >= 85) return { word: 'Almost perfect', colour: GREEN };
  if (p >= 65) return { word: 'Really close', colour: GREEN };
  if (p >= 45) return { word: 'Getting there', colour: AMBER };
  if (p >= 25) return { word: 'Not quite', colour: AMBER };

  return { word: 'Way off - try again', colour: RED };
}

function detailFor(name: string, v: number): string {
  const s = situation(v);

  return TARGET_MESSAGES[name]?.[s] ?? '';
}

function detailForTarget(id: string, label: string, value: number): string {
  const s = situation(value);
  const message = TARGET_MESSAGES[id]?.[s];

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

function buildScientificBars(
  simClass: SimulationClass,
  values: Record<string, number>,
  runMetadata: VideoRunMetadata | null | undefined,
): ScientificBarDatum[] {
  return Object.entries(simClass.metadata.correctValues)
    .map(([id, correctValue]) => {
      const resolved = resolveScientificValue(id, simClass, values, runMetadata);

      if (resolved === null) {
        return null;
      }

      const normalizedValue = resolved / Math.max(correctValue, 1e-9);
      const label = resolveScientificLabel(id, simClass, runMetadata);
      const unit = resolveScientificUnit(id, simClass);
      const detail =
        detailFor(label, normalizedValue) ||
        detailForTarget(id, label, normalizedValue);

      return {
        id,
        label,
        value: normalizedValue,
        rawValue: resolved,
        unit,
        detail,
      };
    })
    .filter((bar) => bar !== null) as ScientificBarDatum[];
}

function resolveScientificValue(
  id: string,
  simClass: SimulationClass,
  values: Record<string, number>,
  runMetadata: VideoRunMetadata | null | undefined,
): number | null {
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
    simClass.metadata.summaryStats.find((stat) => stat.id === id)?.value,
  );

  return configuredFallback;
}

function resolveScientificLabel(
  id: string,
  simClass: SimulationClass,
  runMetadata: VideoRunMetadata | null | undefined,
): string {
  return (
    simClass.parameters.find((parameter) => parameter.id === id)?.label ??
    simClass.metadata.summaryStats.find((stat) => stat.id === id)?.label ??
    runMetadata?.summaryMetrics[id]?.label ??
    id
  );
}

function resolveScientificUnit(
  id: string,
  simClass: SimulationClass,
): string | undefined {
  return (
    simClass.parameters.find((parameter) => parameter.id === id)?.unit ??
    simClass.metadata.summaryStats.find((stat) => stat.id === id)?.unit
  );
}

function parseNumeric(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : null;
}

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

  const content = document.createElement('div');

  content.className = 'summary-overlay__content';

  const actions = document.createElement('div');

  actions.className = 'summary-overlay__actions';

  const replayButton = document.createElement('button');

  replayButton.className = 'summary-overlay__button summary-overlay__button--primary';
  replayButton.type = 'button';
  replayButton.textContent = 'Replay';

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

  function buildSimStatsFromBars(bars: ScientificBarDatum[]): HTMLElement {
    const section = document.createElement('div');

    section.className = 'res-section panel';
    section.innerHTML = '<p class="sci-section__title">Simulation Stats</p>';

    const grid = document.createElement('div');

    grid.className = 'metric-grid';
    grid.style.setProperty('--summary-grid-columns', String(Math.max(1, bars.length)));
    grid.style.setProperty('--summary-grid-max-width', '48rem');

    for (const bar of bars) {
      const card = document.createElement('div');
      const label = document.createElement('span');
      const value = document.createElement('span');

      card.className = 'res-card res-card--has-info';
      label.className = 'res-card__label';
      label.textContent = bar.label;
      value.className = 'res-card__value';
      value.textContent = Number.isFinite(bar.rawValue)
        ? withUnit(Number(bar.rawValue.toPrecision(4)).toString(), bar.unit)
        : '--';
      card.appendChild(label);
      card.appendChild(value);
      card.addEventListener('click', () => openCardModal(bar.label, bar.detail));
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

      const available = buildSummaryMetricMap(
        simClass,
        values,
        videoDurationSeconds,
        runMetadata,
      );
      const stats = simClass.metadata.summaryStats;
      const scientificBars = buildScientificBars(simClass, values, runMetadata);

      let score: number;

      if (scientificBars.length > 0) {
        score = outcomeScore(scientificBars);
      } else {
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
        (stat) => stat.section === 'simulationStats' && stat.id !== 'similarityScore',
      );

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
      } else if (scientificBars.length > 0) {
        rightColumn.appendChild(buildSimStatsFromBars(scientificBars));
      }

      topRow.appendChild(mainColumn);

      if (rightColumn.childElementCount > 0) {
        topRow.appendChild(rightColumn);
      }

      content.appendChild(topRow);

      if (scientificBars.length > 0) {
        const sciSection = document.createElement('div');

        sciSection.className = 'sci-section panel';
        sciSection.innerHTML = '<p class="sci-section__title">Similarity Results</p>';

        const list = document.createElement('div');

        list.className = 'sci-bars';

        for (const bar of scientificBars) {
          const vd = verdict(bar.value);

          const row = document.createElement('div');

          row.className = 'sci-bar';
          row.innerHTML = `
            <div class="sci-bar__name">${bar.label}</div>
            <div class="sci-track">
              <div class="sci-pointer" style="left:${pos(bar.value)}%">
                <div class="sci-pointer__needle"></div>
                <div class="sci-pointer__node"></div>
              </div>
            </div>
            <div class="sci-bar__verdict" style="color:${vd.colour}">${vd.word}</div>
          `;
          row.addEventListener('click', () => openModal(bar));
          list.appendChild(row);
        }

        sciSection.appendChild(list);
        content.appendChild(sciSection);
      }
    },
  };
}

/**
 * Pick one displayable metric row given YAML display config.
 */
function selectMetric(
  stat: StatDisplayConfig,
  availableMetrics: Record<string, { label: string; value: string }>,
): { label: string; value: string } {
  const metric = availableMetrics[stat.id] ?? { label: stat.id, value: '--' };
  const resolvedValue = metric.value !== '--' ? metric.value : (stat.value ?? '--');
  const formattedValue = formatSummaryValue(resolvedValue, stat);

  return {
    label: stat.label ?? metric.label,
    value: withUnit(formattedValue, stat.unit),
  };
}

/**
 * Apply YAML-configured summary formatting to one resolved value.
 */
function formatSummaryValue(value: string, stat: StatDisplayConfig): string {
  if (value === '--') {
    return value;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  if (stat.displayFormat === 'scientific') {
    return formatNumericString(value, {
      scale: stat.valueScale,
      mode: 'scientific',
      precision: stat.precision,
    });
  }

  const scale = stat.valueScale ?? 1;
  const scaled = numeric * scale;

  return formatCompactNumber(scaled);
}
