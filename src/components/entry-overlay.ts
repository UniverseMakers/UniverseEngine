/**
 * Entry overlay (first-load simulation family chooser).
 *
 * This overlay is the first UI a visitor sees. It has one job:
 * - let the user choose a simulation family (planetary/galaxy/cosmos)
 *
 * Once a family is chosen, the app shell transitions into config mode.
 */

import { SIMULATION_CLASSES, type SimulationClass } from '../data/simulations.ts';
import { withBaseUrl } from '../shared/urls.ts';

export interface EntryOverlayController {
  /** Reveal the overlay. */
  show: () => void;
  /** Hide the overlay without destroying DOM. */
  hide: () => void;
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
  onSelect: (simClass: SimulationClass) => void,
): EntryOverlayController {
  // Static banner asset shown at the top of the first-load overlay.
  const bannerSrc = withBaseUrl('assets/banner.jpg');

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
      <img class="entry-overlay__banner" src="${bannerSrc}" alt="" loading="eager" decoding="async" />
    </div>
    <p class="entry-overlay__eyebrow">Universe Engine</p>
    <h1 class="entry-overlay__title">Choose a cosmic scale</h1>
  `;

  // Button stack for each available simulation family.
  const actions = document.createElement('div');
  actions.className = 'entry-overlay__actions';

  for (const simClass of SIMULATION_CLASSES) {
    // Each button is a single "choose this family" call-to-action.
    const button = document.createElement('button');
    button.className = 'entry-overlay__button';
    button.type = 'button';

    button.innerHTML = `
      <span class="entry-overlay__button-label">${simClass.label}</span>
    `;
    // Delegate back to the shell so it can update global state and switch modes.
    button.addEventListener('click', () => onSelect(simClass));
    actions.appendChild(button);
  }

  panel.appendChild(actions);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  return {
    show() {
      // Reveal without rebuilding.
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
    },
    hide() {
      // Hide without destroying DOM.
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
    },
  };
}
