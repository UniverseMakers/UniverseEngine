/**
 * Sidebar — dynamic parameter controls + Run button.
 *
 * Each parameter renders as a labeled slider + editable text input.
 * The sidebar re-renders when the simulation class changes.
 *
 * Has a minimize/expand toggle:
 *  - Expanded: shows all parameters + Run button
 *  - Minimized: collapses to a small bar with just an expand icon
 */

import type { SimulationClass, SimParameter } from '../data/simulations.ts';

export type RunCallback = (
  simClass: SimulationClass,
  values: Record<string, number>,
) => void;

export interface SidebarController {
  /** Switch to a new simulation class — re-renders parameter controls */
  setSimClass: (simClass: SimulationClass) => void;
  /** Get current parameter values */
  getValues: () => Record<string, number>;
}

export function createSidebar(
  container: HTMLElement,
  initialSimClass: SimulationClass,
  onRun: RunCallback,
): SidebarController {
  // Current state
  let currentClass = initialSimClass;
  let values: Record<string, number> = {};
  let minimized = false;

  // Build DOM
  const aside = document.createElement('aside');
  aside.className = 'sidebar';

  // Header with title + minimize button
  const header = document.createElement('div');
  header.className = 'sidebar__header';

  const headerRow = document.createElement('div');
  headerRow.className = 'sidebar__header-row';

  const title = document.createElement('h2');
  title.className = 'sidebar__title';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'sidebar__minimize-btn';
  minimizeBtn.type = 'button';
  minimizeBtn.setAttribute('aria-label', 'Minimize panel');
  minimizeBtn.innerHTML = '‹';

  headerRow.appendChild(title);
  headerRow.appendChild(minimizeBtn);
  header.appendChild(headerRow);
  aside.appendChild(header);

  // Parameters container
  const paramsContainer = document.createElement('div');
  paramsContainer.className = 'sidebar__params';
  aside.appendChild(paramsContainer);

  // Footer with Run button
  const footer = document.createElement('div');
  footer.className = 'sidebar__footer';
  const runBtn = document.createElement('button');
  runBtn.className = 'run-btn';
  runBtn.type = 'button';
  runBtn.textContent = '▶  RUN';
  runBtn.addEventListener('click', () => {
    onRun(currentClass, { ...values });
  });
  footer.appendChild(runBtn);
  aside.appendChild(footer);

  // Minimized bar — shown when collapsed
  const miniBar = document.createElement('div');
  miniBar.className = 'sidebar__mini-bar';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'sidebar__expand-btn';
  expandBtn.type = 'button';
  expandBtn.setAttribute('aria-label', 'Expand parameters panel');
  expandBtn.innerHTML = '›';

  miniBar.appendChild(expandBtn);

  container.appendChild(aside);
  container.appendChild(miniBar);

  // --- Minimize / Expand ---
  minimizeBtn.addEventListener('click', () => {
    minimized = true;
    container.classList.add('minimized');
  });

  expandBtn.addEventListener('click', () => {
    minimized = false;
    container.classList.remove('minimized');
  });

  // --- Render parameters ---
  function renderParams(simClass: SimulationClass) {
    currentClass = simClass;
    title.textContent = `${simClass.label} Parameters`;
    paramsContainer.innerHTML = '';
    values = {};

    for (const param of simClass.parameters) {
      values[param.id] = param.defaultValue;
      paramsContainer.appendChild(createParamControl(param));
    }
  }

  function createParamControl(param: SimParameter): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'param';

    // Label row
    const labelRow = document.createElement('div');
    labelRow.className = 'param__label';

    const name = document.createElement('span');
    name.className = 'param__name';
    name.textContent = param.label;

    const unit = document.createElement('span');
    unit.className = 'param__unit';
    unit.textContent = param.unit;

    labelRow.appendChild(name);
    labelRow.appendChild(unit);
    wrapper.appendChild(labelRow);

    // Controls row
    const controls = document.createElement('div');
    controls.className = 'param__controls';

    const slider = document.createElement('input');
    slider.className = 'param__slider';
    slider.type = 'range';
    slider.min = String(param.min);
    slider.max = String(param.max);
    slider.step = String(param.step);
    slider.value = String(param.defaultValue);
    slider.setAttribute('aria-label', param.label);

    const input = document.createElement('input');
    input.className = 'param__input';
    input.type = 'number';
    input.min = String(param.min);
    input.max = String(param.max);
    input.step = String(param.step);
    input.value = formatValue(param.defaultValue, param.step);

    // Sync slider → input
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      values[param.id] = v;
      input.value = formatValue(v, param.step);
    });

    // Sync input → slider
    input.addEventListener('change', () => {
      let v = parseFloat(input.value);
      if (isNaN(v)) v = param.defaultValue;
      v = Math.max(param.min, Math.min(param.max, v));
      values[param.id] = v;
      slider.value = String(v);
      input.value = formatValue(v, param.step);
    });

    controls.appendChild(slider);
    controls.appendChild(input);
    wrapper.appendChild(controls);

    return wrapper;
  }

  // Suppress unused variable warning — minimized is read for future use
  void minimized;

  // Initial render
  renderParams(initialSimClass);

  return {
    setSimClass: renderParams,
    getValues: () => ({ ...values }),
  };
}

/** Format a number to match the step precision */
function formatValue(value: number, step: number): string {
  const decimals = countDecimals(step);
  return value.toFixed(decimals);
}

function countDecimals(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}
