/**
 * Parameter editor — slider-based controls for the selection overlay.
 *
 * Renders one range input per parameter and reports value updates back up.
 */

import type { SimulationClass, SimParameter } from './data.ts';
import { formatParameterValue, withUnit } from '../shared/format.ts';

export interface ParameterEditorController {
  setSimClass: (simClass: SimulationClass, nextValues?: Record<string, number>) => void;
  setValues: (nextValues: Record<string, number>) => void;
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

  function createParamControl(param: SimParameter): HTMLElement {
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
    controls.appendChild(slider);
    wrapper.appendChild(labelRow);
    wrapper.appendChild(controls);

    return wrapper;
  }

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

function createDefaultValues(simClass: SimulationClass): Record<string, number> {
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
