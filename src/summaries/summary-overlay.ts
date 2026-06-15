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
import { formatNumericString, withUnit } from '../shared/format.ts';

export interface SummaryOverlayController {
  show: () => void;
  hide: () => void;
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
}

interface ScientificBarDatum {
  id: string;
  label: string;
  value: number;
  detail: string;
}

const MESSAGES: Record<string, Record<string, string>> = {
  'Moon mass': {
    greenLow:
      'Spot on. Your Moon came out just a fraction lighter than the real one - well within range.',
    greenHigh:
      'Spot on. Your Moon came out just a fraction heavier than the real one - well within range.',
    amberLow:
      'A bit light. Slightly too little material made it into orbit, so this Moon is a touch small.',
    amberHigh:
      'A bit heavy. Slightly too much material made it into orbit, so this Moon is a touch large.',
    redLow:
      'Far too light. Barely any material reached orbit - this Moon would be much smaller than the real one.',
    redHigh:
      'Far too heavy. So much material was flung into orbit that this Moon would dwarf the real one.',
  },
  'Earth mass': {
    greenLow:
      "Spot on. The Earth ended up a fraction lighter than today's - well within range.",
    greenHigh:
      "Spot on. The Earth ended up a fraction heavier than today's - well within range.",
    amberLow:
      'A bit light. A little too much was lost in the collision, leaving Earth slightly underweight.',
    amberHigh:
      'A bit heavy. A little too much material was kept, leaving Earth slightly overweight.',
    redLow:
      'Far too light. This impact stripped away too much - the Earth would never end up this small.',
    redHigh:
      'Far too heavy. Almost nothing was lost, so the Earth ends up far more massive than it really is.',
  },
  'Spin of Earth-Moon system': {
    greenLow:
      'Spot on. The system spins just slightly slower than the real one - well within range.',
    greenHigh:
      'Spot on. The system spins just slightly faster than the real one - well within range.',
    amberLow:
      'A bit slow. The early day would have been a little longer than it should have been.',
    amberHigh:
      'A bit fast. The early day would have been a little shorter than it should have been.',
    redLow:
      'Far too slow. This impact gave the system hardly any spin - nothing like the fast-spinning early Earth-Moon.',
    redHigh:
      'Far too fast. This impact gave the system huge spin - the early day would have been extremely short.',
  },
  'Moon iron': {
    greenLow:
      "Spot on - just a hair below the real Moon's iron, which is famously tiny.",
    greenHigh:
      "Spot on - just a hair above the real Moon's iron, which is famously tiny.",
    amberLow:
      'A little under. Even less iron than the real Moon, which already has very little.',
    amberHigh:
      'A little over. Somewhat more iron than the real Moon, which is unusually iron-poor.',
    redLow:
      "Far too little - almost no iron at all, well below even the real Moon's tiny amount.",
    redHigh:
      'Far too much iron. The real Moon is strange because it has almost none - a high-iron Moon looks nothing like ours.',
  },
  'Proto-Earth in Moon': {
    greenLow:
      'Spot on - just below the expected share of original-Earth material in the Moon.',
    greenHigh:
      'Spot on - just above the expected share of original-Earth material in the Moon.',
    amberLow:
      'A bit low. Slightly less of this Moon comes from the original Earth than models expect.',
    amberHigh:
      'A bit high. Slightly more of this Moon comes from the original Earth than models expect.',
    redLow:
      'Far too low. Almost none of this Moon came from the original Earth - it is mostly impactor material.',
    redHigh:
      'Far too high. This Moon is made almost entirely of original-Earth material, more than models suggest.',
  },
};

const TARGET_MESSAGES: Record<string, Record<string, string>> = {
  stellar_mass: {
    greenLow:
      'Very close. This galaxy ends up just a little less massive in stars than the Milky Way.',
    greenHigh:
      'Very close. This galaxy ends up just a little more massive in stars than the Milky Way.',
    amberLow:
      'A bit low. This galaxy built less stellar mass than the Milky Way, so it would look more like a smaller disc system.',
    amberHigh:
      'A bit high. This galaxy built more stellar mass than the Milky Way, so it would be a noticeably heavier stellar system.',
    redLow:
      'Far too low. This galaxy is much less stellar-massive than the Milky Way.',
    redHigh:
      'Far too high. This galaxy is much more stellar-massive than the Milky Way.',
  },
  black_hole_mass: {
    greenLow:
      'Very close. The central black hole is just a little lighter than Sagittarius A* in the Milky Way.',
    greenHigh:
      'Very close. The central black hole is just a little heavier than Sagittarius A* in the Milky Way.',
    amberLow:
      'A bit low. The central black hole is smaller than the Milky Way\'s Sagittarius A*.',
    amberHigh:
      'A bit high. The central black hole is larger than the Milky Way\'s Sagittarius A*.',
    redLow:
      'Far too low. The central black hole is much smaller than Sagittarius A* in the Milky Way.',
    redHigh:
      'Far too high. The central black hole is much larger than Sagittarius A* in the Milky Way.',
  },
  galaxy_age: {
    greenLow:
      'Very close. The galaxy\'s mass-weighted stellar age is just a little younger than the Milky Way\'s.',
    greenHigh:
      'Very close. The galaxy\'s mass-weighted stellar age is just a little older than the Milky Way\'s.',
    amberLow:
      'A bit low. The stars in this galaxy are younger on average than the Milky Way\'s stellar population.',
    amberHigh:
      'A bit high. The stars in this galaxy are older on average than the Milky Way\'s stellar population.',
    redLow:
      'Far too low. This galaxy\'s stellar population is much younger, on average, than the Milky Way\'s.',
    redHigh:
      'Far too high. This galaxy\'s stellar population is much older, on average, than the Milky Way\'s.',
  },
  baryon_fraction: {
    greenLow:
      'Very close. You chose a little less ordinary matter than the reference universe, so there is slightly less gas available to build stars and galaxies.',
    greenHigh:
      'Very close. You chose a little more ordinary matter than the reference universe, so there is slightly more gas available to build stars and galaxies.',
    amberLow:
      'A bit low. With less ordinary matter, the universe has less raw material for stars, galaxies, and the visible cosmic web.',
    amberHigh:
      'A bit high. With more ordinary matter, the universe has extra gas to feed stars and galaxies compared with the reference case.',
    redLow:
      'Far too low. There is much too little ordinary matter, so the visible universe would struggle to build the rich structures we expect.',
    redHigh:
      'Far too high. There is much more ordinary matter than in the reference universe, so cosmic structure would grow with a very different balance of gas and dark matter.',
  },
  black_hole_strength: {
    greenLow:
      'Very close. Black hole feedback is a touch gentler than the reference case, so galaxies would keep slightly more of their gas.',
    greenHigh:
      'Very close. Black hole feedback is a touch stronger than the reference case, so galaxies would lose slightly more gas and heat a little more strongly.',
    amberLow:
      'A bit low. Weak black hole feedback means galaxies keep too much gas, making it easier for them to continue forming stars.',
    amberHigh:
      'A bit high. Strong black hole feedback pushes out and heats too much gas, making it harder for galaxies to keep forming stars.',
    redLow:
      'Far too low. Black holes are not energetic enough here, so feedback would fail to regulate galaxy growth in the usual way.',
    redHigh:
      'Far too high. Black holes are blasting far too much energy into their surroundings, which would dramatically suppress galaxy growth.',
  },
  gravity_strength: {
    greenLow:
      'Very close. Gravity is just a little weaker than the reference universe, so structure would collapse slightly more slowly.',
    greenHigh:
      'Very close. Gravity is just a little stronger than the reference universe, so structure would collapse slightly more quickly.',
    amberLow:
      'A bit low. Weaker gravity slows the formation of halos, filaments, and galaxies across the cosmic web.',
    amberHigh:
      'A bit high. Stronger gravity speeds up collapse, making cosmic structure grow faster than in the reference case.',
    redLow:
      'Far too low. Gravity is too weak for the universe to assemble structure on the usual timetable, so the cosmic web would develop very differently.',
    redHigh:
      'Far too high. Gravity is too strong, so matter collapses too aggressively and the universe would form structure much faster than expected.',
  },
};

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

  return MESSAGES[name]?.[s] ?? '';
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
      const detail =
        detailFor(label, normalizedValue) || detailForTarget(id, label, normalizedValue);

      return {
        id,
        label,
        value: normalizedValue,
        detail,
      };
    })
    .filter((bar): bar is ScientificBarDatum => bar !== null);
}

function resolveScientificValue(
  id: string,
  simClass: SimulationClass,
  values: Record<string, number>,
  runMetadata: VideoRunMetadata | null | undefined,
): number | null {
  const selectedParameter = simClass.parameters.find((parameter) => parameter.id === id);

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

  newButton.className = 'summary-overlay__button';
  newButton.type = 'button';
  newButton.textContent = 'New';

  replayButton.addEventListener('click', options.onReplay);
  newButton.addEventListener('click', options.onNew);

  actions.appendChild(replayButton);
  actions.appendChild(newButton);

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
    modalBody.textContent = bar.detail;
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

    update(
      simClass: SimulationClass,
      values: Record<string, number>,
      videoDurationSeconds: number,
      runMetadata?: VideoRunMetadata | null,
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

      topRow.className = 'sci-top';

      const hero = document.createElement('div');

      hero.className = 'sci-hero panel';
      hero.innerHTML = `
        <p class="sci-section__title">Simulation complete</p>
        <div class="sci-hero__score">
          <span class="sci-hero__num">${score}</span><span class="sci-hero__outof">/100</span>
        </div>
        <div class="sci-hero__reaction" style="color:${react.colour}">${react.word}</div>
        <div class="sci-hero__gauge">
          <div class="sci-hero__gauge-fill" style="width:${score}%; background:${react.colour}; box-shadow:0 0 12px ${react.colour}"></div>
        </div>
      `;
      topRow.appendChild(hero);

      const resStats = stats.filter(
        (stat) =>
          !scientificBars.some((bar) => bar.id === String(stat.id)) &&
          stat.id !== 'similarityScore',
      );

      if (resStats.length > 0) {
        const resSection = document.createElement('div');

        resSection.className = 'res-section panel';
        resSection.innerHTML = '<p class="sci-section__title">Resources used</p>';

        const grid = document.createElement('div');

        grid.className = 'res-grid';

        for (const stat of resStats) {
          const metric = selectMetric(stat, available);
          const card = document.createElement('div');

          card.className = 'res-card';
          card.innerHTML = `
            <span class="res-card__label">${metric.label}</span>
            <span class="res-card__value">${metric.value}</span>
          `;
          grid.appendChild(card);
        }

        resSection.appendChild(grid);
        topRow.appendChild(resSection);
      }

      content.appendChild(topRow);

      if (scientificBars.length > 0) {
        const sciSection = document.createElement('div');

        sciSection.className = 'sci-section panel';
        sciSection.innerHTML = '<p class="sci-section__title">Scientific results</p>';

        const list = document.createElement('div');

        list.className = 'sci-bars';

        for (const bar of scientificBars) {
          const vd = verdict(bar.value);

          const row = document.createElement('div');

          row.className = 'sci-bar';
          row.innerHTML = `
            <div class="sci-bar__name">${bar.label}</div>
            <div class="sci-track">
              <div class="sci-perfect"></div>
              <div class="sci-pointer" style="left:${pos(bar.value)}%">
                <div class="sci-pointer__head"></div>
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

        const scale = document.createElement('div');

        scale.className = 'sci-scale';
        scale.innerHTML =
          '<span>too low</span><span class="sci-scale__perfect">perfect</span><span>too high</span>';
        sciSection.appendChild(scale);

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

  if (!stat.displayFormat && stat.valueScale === undefined && !stat.integer) {
    return value;
  }

  return formatNumericString(value, {
    scale: stat.valueScale,
    mode: stat.displayFormat ?? (stat.integer ? 'integer' : 'float'),
    precision: stat.precision,
  });
}
