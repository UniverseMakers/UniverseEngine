/**
 * Display-mode simulation view switcher.
 *
 * Renders a compact row of buttons that lets the user swap between multiple
 * video views for the currently selected run.
 */

import type { SimulationViewOption } from '../selection/data.ts';

export interface ViewSwitcherController {
  update: (options: SimulationViewOption[], selectedId?: string) => void;
  hide: () => void;
}

interface ViewSwitcherOptions {
  onSelect: (viewId: string) => void;
}

/**
 * Create the display-side view switcher.
 *
 * @param container - Host element to mount into.
 * @param options - Selection callback hooks.
 * @returns Controller for updating the switcher state.
 */
export function createViewSwitcher(
  container: HTMLElement,
  options: ViewSwitcherOptions,
): ViewSwitcherController {
  const root = document.createElement('div');

  root.className = 'view-switcher is-hidden';
  container.appendChild(root);

  return {
    update(viewOptions, selectedId) {
      root.innerHTML = '';

      if (viewOptions.length <= 1) {
        root.classList.add('is-hidden');

        return;
      }

      root.classList.remove('is-hidden');

      for (const view of viewOptions) {
        const button = document.createElement('button');

        button.className = 'view-switcher__button';
        button.type = 'button';
        button.dataset.viewId = view.id;
        button.classList.toggle('is-active', view.id === selectedId);
        button.setAttribute('aria-pressed', String(view.id === selectedId));
        button.setAttribute('aria-label', view.label ?? view.id);

        const icon = createViewIcon(view.icon);

        if (icon) {
          const iconWrap = document.createElement('span');

          iconWrap.className = 'view-switcher__icon';
          iconWrap.setAttribute('aria-hidden', 'true');
          iconWrap.appendChild(icon);
          button.appendChild(iconWrap);
        }

        const label = document.createElement('span');

        label.className = 'view-switcher__label';
        label.textContent = view.label ?? view.id;
        button.appendChild(label);
        button.addEventListener('click', () => options.onSelect(view.id));
        root.appendChild(button);
      }
    },
    hide() {
      root.innerHTML = '';
      root.classList.add('is-hidden');
    },
  };
}

function createViewIcon(iconId?: string): SVGSVGElement | null {
  switch (iconId) {
    case 'dark-matter':
      return createSvg(`
        <circle cx="12" cy="12" r="6.5"></circle>
        <ellipse cx="12" cy="12" rx="10" ry="4.2"></ellipse>
        <circle cx="6" cy="12" r="1.1" fill="currentColor" stroke="none"></circle>
        <circle cx="18" cy="12" r="1.1" fill="currentColor" stroke="none"></circle>
        <circle cx="12" cy="7.2" r="1.1" fill="currentColor" stroke="none"></circle>
      `);
    case 'gas-density':
      return createSvg(`
        <path d="M6 14c0-3.6 2.7-6.2 6-6.2 2.1 0 4 .9 5.1 2.5 2.5.2 4.4 2.1 4.4 4.6 0 2.7-2.1 4.7-4.9 4.7H10.2C7.7 19.6 6 17.4 6 14Z"></path>
        <path d="M9.2 13.6h5.6"></path>
        <path d="M8.5 16.2h7.8"></path>
      `);
    case 'gas-temperature':
      return createSvg(`
        <path d="M12 5.2a2.2 2.2 0 0 1 2.2 2.2v7.2a4 4 0 1 1-4.4 0V7.4A2.2 2.2 0 0 1 12 5.2Z"></path>
        <path d="M12 10v6.6"></path>
        <circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none"></circle>
      `);
    case 'metals-stars':
      return createSvg(`
        <rect x="4.8" y="4.8" width="14.4" height="14.4"></rect>
        <path d="m12 8.2 1.25 2.55 2.82.41-2.04 1.98.48 2.8L12 14.63 9.49 15.94l.48-2.8-2.04-1.98 2.82-.41L12 8.2Z"></path>
        <path d="M7.2 7.2h2.5"></path>
        <path d="M14.3 16.8h2.5"></path>
      `);
    default:
      return null;
  }
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
