/**
 * Entry overlay (first-load simulation family chooser).
 *
 * This overlay is the first UI a visitor sees. It has one job:
 * - let the user choose a simulation family (planetary/galaxy/cosmos)
 *
 * Once a family is chosen, the app shell transitions into config mode.
 */

import type { SimulationClass } from '../selection/simulation-catalog.ts';
import { withBaseUrl } from '../shared/urls.ts';
import { createEntryInfoOverlay } from './entry-info-overlay.ts';

const SCALE_DESCRIPTIONS: Record<string, string> = {
  planetary: 'Smash a planet into the early Earth. Can you make the Moon?',
  cosmos: 'Take control of the fundamental laws of the Universe',
  galaxy: 'Explore the boundless diversity of galaxies in the Universe',
};

export interface EntryOverlayController {
  /** Reveal the overlay. */
  show: () => void;
  /** Hide the overlay without destroying DOM. */
  hide: () => void;
  /** Replace the list of visible simulation classes. */
  setSimulationClasses: (simulationClasses: SimulationClass[]) => void;
}

/**
 * Create and mount the entry overlay.
 *
 * @param container - Overlay layer host element.
 * @param onSelect - Called when the user chooses a simulation family.
 * @returns Controller for show/hide operations.
 */
export function createEntryOverlay(
  container: HTMLElement,
  simulationClasses: SimulationClass[],
  onSelect: (simClass: SimulationClass) => void,
): EntryOverlayController {
  // Static banner asset shown at the top of the first-load overlay.
  const bannerSrc = withBaseUrl('assets/banner-1600.webp');
  const bannerSrcSet = [
    `${withBaseUrl('assets/banner-960.webp')} 960w`,
    `${withBaseUrl('assets/banner-1600.webp')} 1600w`,
  ].join(', ');

  // Full-screen overlay wrapper.
  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--entry';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // Center panel with copy + action list.
  const panel = document.createElement('div');

  panel.className = 'entry-overlay';
  panel.innerHTML = `
    <div class="entry-overlay__banner-frame" aria-hidden="true">
      <img class="entry-overlay__banner" src="${bannerSrc}" srcset="${bannerSrcSet}" sizes="(max-width: 640px) 100vw, 38rem" width="1600" height="381" alt="" loading="eager" fetchpriority="high" decoding="async" />
    </div>
    <p class="entry-overlay__eyebrow">Universe Engine</p>
    <h1 class="entry-overlay__title">Choose a cosmic scale</h1>
  `;

  // Button stack for each available simulation family.
  const actions = document.createElement('div');

  actions.className = 'entry-overlay__actions';

  function renderSimulationClasses(nextSimulationClasses: SimulationClass[]): void {
    actions.innerHTML = '';

    for (const simClass of nextSimulationClasses) {
      const button = document.createElement('button');

      button.className = 'entry-overlay__button';
      button.type = 'button';
      const description =
        SCALE_DESCRIPTIONS[simClass.id] ?? 'Explore this simulation scale.';

      button.innerHTML = `
        <span class="entry-overlay__button-label">${simClass.label}</span>
        <span class="entry-overlay__button-description">${description}</span>
      `;
      button.addEventListener('click', () => onSelect(simClass));
      actions.appendChild(button);
    }
  }

  renderSimulationClasses(simulationClasses);

  const { infoButton, infoModal, close: closeInfoOverlay } = createEntryInfoOverlay();

  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.appendChild(infoButton);
  overlay.appendChild(infoModal);
  container.appendChild(overlay);

  return {
    show() {
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
    },
    hide() {
      closeInfoOverlay();
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
    },
    setSimulationClasses(nextSimulationClasses) {
      renderSimulationClasses(nextSimulationClasses);
    },
  };
}
