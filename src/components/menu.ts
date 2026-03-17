/**
 * Simulation class menu — top-right icon buttons.
 *
 * Uses Unicode icons as placeholders (will become SVGs later).
 * Clicking an icon switches the active simulation class.
 */

import { SIMULATION_CLASSES, type SimulationClass } from '../data/simulations.ts';

export type MenuChangeCallback = (simClass: SimulationClass) => void;

export function createMenu(
  container: HTMLElement,
  initialClassId: string,
  onChange: MenuChangeCallback,
): { setActive: (id: string) => void } {
  const nav = document.createElement('nav');
  nav.className = 'sim-menu';
  nav.setAttribute('aria-label', 'Simulation class');

  const buttons: HTMLButtonElement[] = [];

  for (const simClass of SIMULATION_CLASSES) {
    const btn = document.createElement('button');
    btn.className = 'sim-menu__btn';
    btn.type = 'button';
    btn.textContent = simClass.icon;
    btn.setAttribute('data-tooltip', simClass.label);
    btn.setAttribute('aria-label', simClass.label);

    if (simClass.id === initialClassId) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () => {
      onChange(simClass);
    });

    buttons.push(btn);
    nav.appendChild(btn);
  }

  container.appendChild(nav);

  function setActive(id: string) {
    buttons.forEach((btn, i) => {
      btn.classList.toggle('active', SIMULATION_CLASSES[i].id === id);
    });
  }

  return { setActive };
}
