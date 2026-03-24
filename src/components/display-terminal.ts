/**
 * Display-mode terminal viewer.
 *
 * This panel is the first structural step toward a real simulation log viewer
 * that can live alongside the viewport. For now it renders curated placeholder
 * lines derived from the active simulation and selected parameters.
 */

import type { SimulationClass } from '../data/simulations.ts';
import { formatValueByStep, withUnit } from '../shared/format.ts';

export interface DisplayTerminalController {
  /** Show the panel without rebuilding it. */
  show: () => void;
  /** Hide the panel. */
  hide: () => void;
  /** Toggle the panel open/closed and return the new state. */
  toggle: () => boolean;
  /** Replace the visible log payload for the active simulation. */
  update: (simClass: SimulationClass, values: Record<string, number>) => void;
}

interface DisplayTerminalOptions {
  onClose?: () => void;
}

/**
 * Create and mount the display-mode terminal viewer.
 *
 * @param container - Host element to mount into.
 * @param options - Optional callback hooks.
 * @returns Controller for show/hide/toggle/update.
 */
export function createDisplayTerminal(
  container: HTMLElement,
  options: DisplayTerminalOptions = {},
): DisplayTerminalController {
  // Build the outer panel container that will later be shown/hidden.
  const panel = document.createElement('aside');
  panel.className = 'display-terminal is-hidden';
  panel.hidden = true;

  // Build the terminal header so the viewer has a clear title and close action.
  const header = document.createElement('div');
  header.className = 'display-terminal__header';

  // Group the title and subtitle so they align as a single text block.
  const titleWrap = document.createElement('div');
  titleWrap.className = 'display-terminal__title-wrap';

  // Main title names the currently displayed log panel.
  const title = document.createElement('div');
  title.className = 'display-terminal__title';
  title.textContent = 'Simulation Logs';

  // Subtitle explains that this is still placeholder/demo content.
  const subtitle = document.createElement('div');
  subtitle.className = 'display-terminal__subtitle';
  subtitle.textContent = 'Operator-side stream preview';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  // The close button allows the shell to hide the viewer without leaving display mode.
  const closeButton = document.createElement('button');
  closeButton.className = 'display-terminal__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close terminal viewer');
  closeButton.textContent = '×';

  // Meta text is a compact status line under the title bar.
  const meta = document.createElement('div');
  meta.className = 'display-terminal__meta';
  meta.textContent = 'STREAM_MODE :: PLACEHOLDER';

  // The log area itself is rebuilt every time the simulation changes.
  const log = document.createElement('div');
  log.className = 'display-terminal__log';

  header.appendChild(titleWrap);
  header.appendChild(closeButton);
  panel.appendChild(header);
  panel.appendChild(meta);
  panel.appendChild(log);
  container.appendChild(panel);

  // Clicking close hides the panel and lets the app shell restore other overlays.
  closeButton.addEventListener('click', () => {
    hide();
    options.onClose?.();
  });

  return {
    show,
    hide,
    toggle() {
      // Toggle by checking the actual hidden state of the root panel.
      const nextVisible = panel.hidden;
      if (nextVisible) {
        show();
      } else {
        hide();
      }
      return nextVisible;
    },
    update(simClass: SimulationClass, values: Record<string, number>) {
      // Update the heading so the viewer clearly tracks the active family.
      title.textContent = `${simClass.label.toUpperCase()} Logs`;
      meta.textContent = `STREAM_MODE :: ${simClass.id.toUpperCase()}_PLACEHOLDER`;

      // Rebuild the visible lines from scratch because the data volume is tiny.
      log.innerHTML = '';

      for (const line of createLogLines(simClass, values)) {
        const row = document.createElement('div');
        row.className = 'display-terminal__line';
        row.textContent = line;
        log.appendChild(row);
      }
    },
  };

  /**
   * Reveal the panel without rebuilding its DOM.
   *
   * @returns void
   */
  function show(): void {
    panel.hidden = false;
    panel.classList.remove('is-hidden');
  }

  /**
   * Hide the panel while preserving the rendered content for later reuse.
   *
   * @returns void
   */
  function hide(): void {
    panel.hidden = true;
    panel.classList.add('is-hidden');
  }
}

/**
 * Build placeholder terminal lines for the active simulation.
 *
 * @param simClass - Active simulation family.
 * @param values - Active parameter value map.
 * @returns Array of terminal lines.
 */
function createLogLines(
  simClass: SimulationClass,
  values: Record<string, number>,
): string[] {
  // Convert the configured parameter values into terminal-friendly log rows.
  const formattedParams = simClass.parameters.map((parameter, index) => {
    const value = values[parameter.id] ?? parameter.defaultValue;
    const timestamp = `[00:${String(index).padStart(2, '0')}:0${index}]`;
    return `${timestamp} PARAM_${parameter.id.toUpperCase()} :: ${withUnit(formatValueByStep(value, parameter.step), parameter.unit)}`;
  });

  // Build the final placeholder stream shown to the user.
  return [
    '[00:00:00] LOG_VIEWER :: awaiting native simulation logs',
    `[00:00:01] PROFILE :: ${simClass.label.toUpperCase()} playback shell attached`,
    '[00:00:02] MODE :: using curated placeholder stream for layout validation',
    ...formattedParams,
    '[00:00:08] NOTE :: future integration will mirror real stdout / log files here',
    '[00:00:09] NOTE :: panel intended to stay visible beside the simulation viewport',
  ];
}
