/**
 * Parameter editor — slider-based controls for the selection overlay.
 *
 * Renders one range input per parameter and reports value updates back up.
 */

import type { SimulationClass, SimParameter } from './simulation-catalog.ts';
import { formatParameterValue, withUnit } from '../shared/format.ts';

export interface ParameterEditorController {
  /** Swap to a different simulation family and optionally seed its values. */
  setSimClass: (simClass: SimulationClass, nextValues?: Record<string, number>) => void;

  /** Replace the current value map for the active simulation family. */
  setValues: (nextValues: Record<string, number>) => void;

  /** Read a defensive copy of the current values. */
  getValues: () => Record<string, number>;
}

/**
 * Create the parameter editor inside the provided host element.
 *
 * @param container - Host element to mount into.
 * @param initialSimClass - Initial simulation family.
 * @param initialValues - Initial values keyed by parameter id.
 * @param onChange - Callback fired whenever values change.
 * @returns Controller for updating the editor state.
 */
export function createParameterEditor(
  container: HTMLElement,
  initialSimClass: SimulationClass,
  initialValues: Record<string, number>,
  onChange: (values: Record<string, number>) => void,
): ParameterEditorController {
  // Single root node so the whole editor can be rebuilt whenever the active
  // simulation family changes. The parameter count is small, so full re-render
  // is simpler than diffing individual slider rows.
  const root = document.createElement('div');

  root.className = 'parameter-editor';
  container.appendChild(root);

  let currentClass = initialSimClass;
  let values = { ...initialValues };

  function render(
    simClass: SimulationClass,
    nextValues?: Record<string, number>,
  ): void {
    // Swap the active class and either keep caller-provided values or fall back
    // to that class's defaults when no explicit value map was supplied.
    currentClass = simClass;
    values = nextValues ? { ...nextValues } : createDefaultValues(simClass);
    root.innerHTML = '';

    // The heading gives the slider bank some context whenever the user switches
    // between planetary / galaxy / cosmos presets.
    const heading = document.createElement('div');

    heading.className = 'parameter-editor__heading';
    heading.innerHTML = `
      <p class="parameter-editor__eyebrow">Parameter matrix</p>
      <h2 class="parameter-editor__title">${simClass.label} Controls</h2>
    `;
    root.appendChild(heading);

    // Every parameter becomes one self-contained slider row.
    const list = document.createElement('div');

    list.className = 'parameter-editor__list';

    for (const parameter of simClass.parameters) {
      list.appendChild(createParamControl(parameter));
    }

    root.appendChild(list);
    emitChange();
  }

  function createParamControl(param: SimParameter): HTMLElement {
    // Each parameter row owns its label, range readout, current value, and the
    // slider itself so the structure stays easy to scan in the DOM.
    const wrapper = document.createElement('section');

    wrapper.className = 'param';

    const labelRow = document.createElement('div');

    labelRow.className = 'param__label';
    const displayUnit = param.displayUnit ?? param.unit;

    const name = document.createElement('div');

    name.innerHTML = `
      <span class="param__name">${param.label}</span>
      <span class="param__range">${withUnit(formatParameterValue(param.min, param.step, { scale: param.valueScale, format: param.displayFormat, significantFigures: param.displaySignificantFigures }), displayUnit)} - ${withUnit(formatParameterValue(param.max, param.step, { scale: param.valueScale, format: param.displayFormat, significantFigures: param.displaySignificantFigures }), displayUnit)}</span>
    `;

    const readout = document.createElement('div');

    readout.className = 'param__readout';

    const controls = document.createElement('div');

    controls.className = 'param__controls';

    const slider = document.createElement('input');

    slider.className = 'param__slider';
    slider.type = 'range';
    slider.min = String(param.min);
    slider.max = String(param.max);
    slider.step = String(param.step);
    slider.value = String(values[param.id] ?? param.defaultValue);
    slider.setAttribute('aria-label', param.label);

    function sync(value: number): void {
      // One helper keeps the slider thumb, CSS fill, readout text, and outward
      // change notification moving together from the same source of truth.
      values[param.id] = value;
      slider.value = String(value);
      slider.style.setProperty(
        '--fill',
        `${calculateFill(value, param.min, param.max)}%`,
      );
      readout.textContent = withUnit(
        formatParameterValue(value, param.step, {
          scale: param.valueScale,
          format: param.displayFormat,
          significantFigures: param.displaySignificantFigures,
        }),
        displayUnit,
      );
      emitChange();
    }

    slider.addEventListener('input', () => {
      sync(parseFloat(slider.value));
    });

    // Prime the slider fill/readout before the row is attached so there is no
    // visible snap from default browser state to our styled state.
    slider.style.setProperty(
      '--fill',
      `${calculateFill(values[param.id] ?? param.defaultValue, param.min, param.max)}%`,
    );
    readout.textContent = withUnit(
      formatParameterValue(values[param.id] ?? param.defaultValue, param.step, {
        scale: param.valueScale,
        format: param.displayFormat,
        significantFigures: param.displaySignificantFigures,
      }),
      displayUnit,
    );

    labelRow.appendChild(name);
    labelRow.appendChild(readout);

    if (param.description) {
      name.classList.add('param__name--has-info');
      name.setAttribute('title', param.description);

      const popover = document.createElement('div');

      popover.className = 'param__popover';
      popover.textContent = param.description;
      wrapper.appendChild(popover);

      name.addEventListener('click', () => {
        wrapper.classList.toggle('param--info-open');
      });

      document.addEventListener('click', (event) => {
        if (!wrapper.contains(event.target as Node)) {
          wrapper.classList.remove('param--info-open');
        }
      });
    }

    controls.appendChild(slider);
    wrapper.appendChild(labelRow);
    wrapper.appendChild(controls);

    return wrapper;
  }

  function emitChange(): void {
    // Emit a copy so consumers cannot accidentally mutate the editor's internal
    // state object behind its back.
    onChange({ ...values });
  }

  render(initialSimClass, initialValues);

  return {
    setSimClass(simClass: SimulationClass, nextValues?: Record<string, number>) {
      render(simClass, nextValues);
    },
    setValues(nextValues: Record<string, number>) {
      render(currentClass, nextValues);
    },
    getValues() {
      return { ...values };
    },
  };
}

function createDefaultValues(simClass: SimulationClass): Record<string, number> {
  // Defaults come directly from the simulation schema so adding a new parameter
  // in YAML automatically gives it a sane starting value in the editor.
  return Object.fromEntries(
    simClass.parameters.map((parameter) => [parameter.id, parameter.defaultValue]),
  );
}

function calculateFill(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}
