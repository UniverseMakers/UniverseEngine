/**
 * Parameter editor used inside the config overlay.
 *
 * This module renders the slider-based parameter controls for the active
 * simulation family and reports value updates back to the app shell.
 */

import type { SimulationClass, SimParameter } from '../data/simulations.ts';
import { formatValueByStep, withUnit } from '../shared/format.ts';

export interface ParameterEditorController {
  /** Re-render the editor for a new simulation class. */
  setSimClass: (simClass: SimulationClass, nextValues?: Record<string, number>) => void;
  /** Replace the current value map while staying on the same class. */
  setValues: (nextValues: Record<string, number>) => void;
  /** Return a copy of the current edited values. */
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
  const root = document.createElement('div');
  root.className = 'parameter-editor';
  container.appendChild(root);

  let currentClass = initialSimClass;
  let values = { ...initialValues };

  /**
   * Render the full editor for a given simulation family.
   *
   * This function intentionally rebuilds the control list; the UI is small and
   * rebuilding keeps the logic straightforward.
   *
   * @param simClass - Simulation family whose parameters are being edited.
   * @param nextValues - Optional pre-existing values to seed the controls.
   * @returns void
   */
  function render(
    simClass: SimulationClass,
    nextValues?: Record<string, number>,
  ): void {
    currentClass = simClass;
    values = nextValues ? { ...nextValues } : createDefaultValues(simClass);
    root.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'parameter-editor__heading';
    heading.innerHTML = `
      <p class="parameter-editor__eyebrow">Parameter matrix</p>
      <h2 class="parameter-editor__title">${simClass.label} Controls</h2>
    `;
    root.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'parameter-editor__list';

    for (const parameter of simClass.parameters) {
      list.appendChild(createParamControl(parameter));
    }

    root.appendChild(list);
    emitChange();
  }

  /**
   * Build one parameter slider row.
   *
   * @param param - Parameter schema.
   * @returns Wrapper element for the parameter control.
   */
  function createParamControl(param: SimParameter): HTMLElement {
    const wrapper = document.createElement('section');
    wrapper.className = 'param';

    const labelRow = document.createElement('div');
    labelRow.className = 'param__label';

    const name = document.createElement('div');
    name.innerHTML = `
      <span class="param__name">${param.label}</span>
      <span class="param__range">${formatValueByStep(param.min, param.step)} - ${formatValueByStep(param.max, param.step)} ${param.unit}</span>
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

    /**
     * Sync UI + internal value map for this parameter.
     *
     * @param value - Next numeric value.
     * @returns void
     */
    function sync(value: number): void {
      values[param.id] = value;
      slider.value = String(value);
      slider.style.setProperty(
        '--fill',
        `${calculateFill(value, param.min, param.max)}%`,
      );
      readout.textContent = withUnit(formatValueByStep(value, param.step), param.unit);
      emitChange();
    }

    slider.addEventListener('input', () => {
      sync(parseFloat(slider.value));
    });

    slider.style.setProperty(
      '--fill',
      `${calculateFill(values[param.id] ?? param.defaultValue, param.min, param.max)}%`,
    );
    readout.textContent = withUnit(
      formatValueByStep(values[param.id] ?? param.defaultValue, param.step),
      param.unit,
    );

    labelRow.appendChild(name);
    labelRow.appendChild(readout);
    controls.appendChild(slider);
    wrapper.appendChild(labelRow);
    wrapper.appendChild(controls);
    return wrapper;
  }

  /**
   * Notify the parent with a defensive copy of the current values.
   *
   * @returns void
   */
  function emitChange(): void {
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

/**
 * Build the default parameter value map for a simulation family.
 *
 * @param simClass - Simulation family schema.
 * @returns Values keyed by parameter id.
 */
function createDefaultValues(simClass: SimulationClass): Record<string, number> {
  return Object.fromEntries(
    simClass.parameters.map((parameter) => [parameter.id, parameter.defaultValue]),
  );
}

/**
 * Compute a 0..100 fill percentage for styling a range input.
 *
 * @param value - Current value.
 * @param min - Minimum allowed value.
 * @param max - Maximum allowed value.
 * @returns Fill percentage in the range 0..100.
 */
function calculateFill(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}
