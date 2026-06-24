/**
 * Entry info overlay — the "About this experience" overlay shown when the
 * user clicks the ⓘ button on the entry landing page.
 */

import { withBaseUrl } from '../shared/urls.ts';

export interface EntryInfoOverlayController {
  /** The info button element to append to the overlay. */
  infoButton: HTMLButtonElement;
  /** The overlay element to append to the entry overlay. */
  infoModal: HTMLDivElement;
  /** Reveal the overlay. */
  open: () => void;
  /** Hide the overlay. */
  close: () => void;
}

/**
 * Build the "About this experience" overlay and its trigger button.
 *
 * The caller is responsible for appending the returned elements to the
 * overlay DOM.  The overlay starts hidden and is toggled via `open` / `close`.
 *
 * @returns Controller exposing the DOM elements and show/hide helpers.
 */
export function createEntryInfoOverlay(): EntryInfoOverlayController {
  const aboutImageSrc = withBaseUrl('assets/2-McAlpine.webp');

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
            src="${aboutImageSrc}"
            alt="Universe Engine preview"
            width="1920"
            height="1080"
            decoding="async"
          />
          <div class="entry-info-modal__media-copy">
            <p class="entry-info-modal__eyebrow">Universe Engine</p>
            <h2 class="entry-info-modal__headline">Explore Cosmic Simulations On Human Scales</h2>
          </div>
        </div>
        <div class="entry-info-modal__content">
          <button class="entry-info-modal__close" type="button" aria-label="Close">×</button>
          <div class="entry-info-modal__header">
            <p class="entry-info-modal__eyebrow">About</p>
            <h2 class="entry-info-modal__title">What Is The Universe Engine?</h2>
            <p class="entry-info-modal__subtitle">
              Universe Engine turns large scientific simulations into an interactive hands-on
              experience: 
            </p>
          </div>
          <div class="entry-info-modal__body">
            <section class="entry-info-modal__section">
              <p class="entry-info-modal__copy">
                Choose a cosmic scale, select your inputs, and see how those decisions reshape the cosmos.
                Run your own simulations of proto-planetary impacts, galaxy formation, and cosmic evolution.
                Compare your choices with real scientific targets and outputs, and see the computational cost
                of real computational astrophysical research.  
              </p>
            </section>
            <section class="entry-info-modal__section">
              <h3 class="entry-info-modal__section-title">From Worlds to Universes</h3>
              <div class="entry-info-modal__theme-list">
                <div class="entry-info-modal__theme">
                  <p class="entry-info-modal__theme-title">Planetary</p>
                  <p class="entry-info-modal__copy">
                    Even the smallest changes in angle, speed, or mass can completely transform how a giant
                    impact unfolds. See if you can find the right combination to form a Moon like ours, and uncover
                    the hidden interplay between the initial conditions that turns planetary chaos into an Earth–Moon system.
                  </p>
                </div>
                <div class="entry-info-modal__theme">
                  <p class="entry-info-modal__theme-title">Galaxy</p>
                  <p class="entry-info-modal__copy">
                    Galaxies emerge from darkness as gas collapses and cools on cosmic scales. Within them, stars
                    are born, live, and die, recycling matter into new generations of stars and planets.
                    These processes ultimately help create the conditions for life as we know it. But no two galaxies
                    are quite the same. Their shapes, colours, sizes, and histories are shaped by the complex
                    interplay of dark matter, gas, stars, and cosmic environment. Explore this diversity
                    and discover the many kinds of galaxies in our Universe — and what drives their differences.
                  </p>
                </div>
                <div class="entry-info-modal__theme">
                  <p class="entry-info-modal__theme-title">Cosmos</p>
                  <p class="entry-info-modal__copy">
                    The largest structures in the Universe began as tiny ripples in the early cosmos. Over billions
                    of years, gravity amplifies these subtle differences, drawing dark matter and eventually
                    gas into a vast cosmic web — the skeleton of the Universe. Along this skeleton, gas continues
                    to collapse, forming stars, galaxies, stars, planets, and eventually us. Explore how changing
                    the fundamental laws of the Universe shapes the filaments, clusters, and voids we see today.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  const infoModalClose = infoModal.querySelector(
    '.entry-info-modal__close',
  ) as HTMLButtonElement;

  function open(): void {
    infoModal.classList.remove('is-hidden');
  }

  function close(): void {
    infoModal.classList.add('is-hidden');
  }

  infoButton.addEventListener('click', open);
  infoModalClose.addEventListener('click', close);
  infoModal.addEventListener('click', (event) => {
    if (event.target === infoModal) {
      close();
    }
  });

  return { infoButton, infoModal, open, close };
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
