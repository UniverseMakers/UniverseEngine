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
    <div class="entry-info-modal">
      <div class="entry-info-modal__shell">
        <div class="entry-info-modal__media">
          <img
            class="entry-info-modal__image"
            src="${bannerSrc}"
            alt="Universe Engine preview"
            width="1600"
            height="381"
            decoding="async"
          />
          <div class="entry-info-modal__media-copy">
            <p class="entry-info-modal__eyebrow">Universe Engine</p>
            <h2 class="entry-info-modal__headline">Explore Simulation At Human Scale</h2>
          </div>
        </div>
        <div class="entry-info-modal__content">
          <button class="entry-info-modal__close" type="button" aria-label="Close">×</button>
          <div class="entry-info-modal__header">
            <p class="entry-info-modal__eyebrow">About</p>
            <h2 class="entry-info-modal__title">What Is This Experience?</h2>
            <p class="entry-info-modal__subtitle">
              Universe Engine turns large scientific simulations into an interactive public-facing
              experience: choose a scale, change the inputs, and see how those decisions reshape
              the final outcome.
            </p>
          </div>
          <div class="entry-info-modal__body">
            <section class="entry-info-modal__section">
              <h3 class="entry-info-modal__section-title">What can you do?</h3>
              <p class="entry-info-modal__copy">
                Pick a theme, tune a small set of meaningful parameters, run the simulation, and
                compare your choices with the scientific targets, outputs, and computational cost.
              </p>
            </section>
            <section class="entry-info-modal__section">
              <h3 class="entry-info-modal__section-title">What should you take away?</h3>
              <div class="entry-info-modal__theme-list">
                <div class="entry-info-modal__theme">
                  <p class="entry-info-modal__theme-title">Planetary</p>
                  <p class="entry-info-modal__copy">
                    Small shifts in angle, speed, and mass can completely change how a Moon-forming
                    impact unfolds.
                  </p>
                </div>
                <div class="entry-info-modal__theme">
                  <p class="entry-info-modal__theme-title">Galaxy</p>
                  <p class="entry-info-modal__copy">
                    Galaxies emerge from long feedback loops between stars, gas, and black holes,
                    not from any single parameter in isolation.
                  </p>
                </div>
                <div class="entry-info-modal__theme">
                  <p class="entry-info-modal__theme-title">Cosmos</p>
                  <p class="entry-info-modal__copy">
                    Even the largest structures in the Universe depend sensitively on the basic
                    physical laws underpinning everything from the Big Bang to the present day.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  panel.appendChild(actions);
  overlay.appendChild(panel);
  overlay.appendChild(infoButton);
  overlay.appendChild(infoModal);
  container.appendChild(overlay);

  const infoModalClose = infoModal.querySelector(
    '.entry-info-modal__close',
  ) as HTMLButtonElement;

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
