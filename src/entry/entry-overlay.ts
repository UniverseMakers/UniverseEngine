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

const SCALE_DESCRIPTIONS: Record<string, string> = {
  planetary: 'Smash together proto-planets and try to form the Moon',
  cosmos: 'Take control of the fundamental laws of the Universe',
  galaxy: 'Explore the boundless diversity of galaxies in the Universe',
};

const ENTRY_INFO_BODY = `
  <div class="entry-info-modal__section">
    <h3 class="entry-info-modal__heading">What is it?</h3>
    <p class="entry-info-modal__copy">
      Universe Engine is an interactive simulation gallery. Each theme lets you
      step into a different scale of computational science and explore how changing
      a few core inputs reshapes the outcome.
    </p>
  </div>
  <div class="entry-info-modal__section">
    <h3 class="entry-info-modal__heading">What can you do?</h3>
    <p class="entry-info-modal__copy">
      Pick a theme, tune the parameters, run the simulation, and compare your
      choices against the real scientific targets and resource costs behind the scenes.
    </p>
  </div>
  <div class="entry-info-modal__section">
    <h3 class="entry-info-modal__heading">What should you take away?</h3>
    <div class="entry-info-modal__theme-list">
      <div class="entry-info-modal__theme">
        <p class="entry-info-modal__theme-title">Planetary</p>
        <p class="entry-info-modal__copy">
          Small changes in collision angle, speed, and mass can completely change
          how a Moon-forming impact unfolds.
        </p>
      </div>
      <div class="entry-info-modal__theme">
        <p class="entry-info-modal__theme-title">Galaxy</p>
        <p class="entry-info-modal__copy">
          Galaxies are shaped by long feedback loops between stars, gas, and black holes,
          not by any one ingredient in isolation.
        </p>
      </div>
      <div class="entry-info-modal__theme">
        <p class="entry-info-modal__theme-title">Cosmos</p>
        <p class="entry-info-modal__copy">
          Even the largest structures in the Universe depend sensitively on the
          underlying physical rules we often take for granted.
        </p>
      </div>
    </div>
  </div>
`;

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

  const infoModal = document.createElement('div');
  const infoButton = document.createElement('button');

  infoButton.className = 'view-switcher__info entry-overlay__info-button';
  infoButton.type = 'button';
  infoButton.setAttribute('aria-label', 'About this experience');
  infoButton.appendChild(createInfoIcon());
  infoModal.className = 'sci-modal is-hidden';
  infoModal.innerHTML = `
    <div class="sci-modal__card entry-info-modal">
      <button class="sci-modal__close" type="button" aria-label="Close">&#10005;</button>
      <div class="sci-modal__title">About This Experience</div>
      <div class="sci-modal__body">${ENTRY_INFO_BODY}</div>
    </div>
  `;

  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.appendChild(infoButton);
  overlay.appendChild(infoModal);
  container.appendChild(overlay);

  const infoModalClose = infoModal.querySelector('.sci-modal__close') as HTMLButtonElement;

  function openInfoModal(): void {
    infoModal.classList.remove('is-hidden');
  }

  function closeInfoModal(): void {
    infoModal.classList.add('is-hidden');
  }

  infoButton.addEventListener('click', openInfoModal);
  infoModalClose.addEventListener('click', closeInfoModal);
  infoModal.addEventListener('click', (event) => {
    if (event.target === infoModal) {
      closeInfoModal();
    }
  });

  return {
    show() {
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
    },
    hide() {
      closeInfoModal();
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
    },
    setSimulationClasses(nextSimulationClasses) {
      renderSimulationClasses(nextSimulationClasses);
    },
  };
}

function createSvg(content: string): SVGSVGElement {
  const template = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  template.setAttribute('viewBox', '0 0 24 24');
  template.setAttribute('fill', 'none');
  template.setAttribute('stroke', 'currentColor');
  template.setAttribute('stroke-width', '1.5');
  template.setAttribute('stroke-linecap', 'round');
  template.setAttribute('stroke-linejoin', 'round');
  template.innerHTML = content;

  return template;
}

function createInfoIcon(): SVGSVGElement {
  return createSvg(`
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M12 16.5v-6"></path>
    <circle cx="12" cy="8.5" r="1.1" fill="currentColor" stroke="none"></circle>
  `);
}
