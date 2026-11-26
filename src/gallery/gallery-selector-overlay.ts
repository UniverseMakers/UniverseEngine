import type { SimulationClass } from '../selection/simulation-catalog.ts';

const SCALE_DESCRIPTIONS: Record<string, string> = {
  planetary: 'Explore giant impacts and the many possible collision outcomes.',
  galaxy: 'Explore galaxies across different masses and environments.',
  cosmos: 'Explore universes with different physical laws.',
};

export interface GallerySelectorOverlayController {
  show: () => void;
  hide: () => void;
  setSimulationClasses: (simulationClasses: SimulationClass[]) => void;
}

export function createGallerySelectorOverlay(
  container: HTMLElement,
  simulationClasses: SimulationClass[],
  onSelect: (simClass: SimulationClass) => void,
  onClose: () => void,
): GallerySelectorOverlayController {
  const overlay = document.createElement('section');
  const panel = document.createElement('div');
  const closeButton = document.createElement('button');
  const actions = document.createElement('div');

  overlay.className = 'overlay overlay--gallery-selector is-hidden';
  overlay.hidden = true;
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Choose a gallery');
  panel.className = 'entry-overlay gallery-selector-overlay';
  panel.innerHTML = `
    <p class="entry-overlay__eyebrow">Universe Engine</p>
    <h1 class="entry-overlay__title">Choose a gallery</h1>
  `;
  closeButton.className = 'gallery-overlay__close gallery-selector-overlay__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close gallery selection');
  closeButton.textContent = '×';
  actions.className = 'entry-overlay__actions';
  panel.append(actions, closeButton);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  function render(nextSimulationClasses: SimulationClass[]): void {
    actions.replaceChildren();

    for (const simClass of nextSimulationClasses) {
      const button = document.createElement('button');

      button.className = 'entry-overlay__button';
      button.type = 'button';
      button.innerHTML = `
        <span class="entry-overlay__button-label">${simClass.label}</span>
        <span class="entry-overlay__button-description">${SCALE_DESCRIPTIONS[simClass.id] ?? 'Explore this simulation gallery.'}</span>
      `;
      button.addEventListener('click', () => onSelect(simClass));
      actions.appendChild(button);
    }
  }

  render(simulationClasses);
  closeButton.addEventListener('click', onClose);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      onClose();
    }
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  });

  return {
    show() {
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
      overlay.focus();
    },
    hide() {
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
    },
    setSimulationClasses: render,
  };
}
