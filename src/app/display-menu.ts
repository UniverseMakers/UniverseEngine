/**
 * Display-mode burger menu.
 *
 * This module isolates the menu DOM so `main.ts` does not need to own the full
 * markup, click handling, and open/close behavior itself. The menu remains a
 * simple DOM builder rather than a framework-style component.
 */

import type { SimulationClass } from '../data/simulations.ts';

export interface DisplayMenuController {
  /** Close the menu popover if it is open. */
  close: () => void;
}

interface DisplayMenuOptions {
  /** Called after the user picks a new simulation family from the menu. */
  onSimulationSelected: (simClass: SimulationClass) => void;
  /** Called after the user picks a non-simulation view entry. */
  onViewSelected: (view: 'settings' | 'terminal') => void;
}

/**
 * Build the burger-menu button and dropdown.
 *
 * The helper mounts everything into the supplied host element and wires all
 * event listeners needed for menu toggling and outside-click dismissal.
 *
 * @param host - DOM node that owns the menu button + popover.
 * @param simulationClasses - List of simulation families to render.
 * @param options - Callback hooks for selections.
 * @returns Controller for imperative close.
 */
export function createDisplayMenu(
  host: HTMLElement,
  simulationClasses: SimulationClass[],
  options: DisplayMenuOptions,
): DisplayMenuController {
  const trigger = document.createElement('button');
  trigger.className = 'display-button';
  trigger.type = 'button';
  trigger.innerHTML = '<span></span><span></span><span></span>';
  trigger.setAttribute('aria-label', 'Open configuration overlay');
  host.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'display-menu';

  const header = document.createElement('div');
  header.className = 'display-menu__header';
  header.textContent = 'Core Menu';
  menu.appendChild(header);

  for (const simClass of simulationClasses) {
    menu.appendChild(
      createMenuButton(simClass.label, () => {
        close();
        options.onSimulationSelected(simClass);
      }),
    );
  }

  menu.appendChild(
    createMenuButton('Settings', () => {
      close();
      options.onViewSelected('settings');
    }),
  );

  menu.appendChild(
    createMenuButton('Terminal', () => {
      close();
      options.onViewSelected('terminal');
    }),
  );

  host.appendChild(menu);

  trigger.addEventListener('click', () => {
    host.classList.toggle('open');
  });

  document.addEventListener('click', (event) => {
    if (!host.contains(event.target as Node)) {
      close();
    }
  });

  return {
    close,
  };

  /**
   * Build one menu row with the shared marker + label styling.
   *
   * @param label - Visible label text.
   * @param onClick - Called on button click.
   * @returns The created button element.
   */
  function createMenuButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'display-menu__item';
    button.type = 'button';
    button.innerHTML = `
      <span class="display-menu__item-mark"></span>
      <span class="display-menu__item-label">${label}</span>
    `;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Collapse the popover by removing the host's `open` class.
   *
   * @returns void
   */
  function close() {
    host.classList.remove('open');
  }
}
