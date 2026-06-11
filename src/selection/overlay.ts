/**
 * Selection overlay (parameter configuration + settings).
 *
 * This is the primary control surface for choosing simulation parameters.
 * It combines:
 * - parameter editing sliders
 * - theme settings
 * - the run trigger that moves the app into loading/display mode
 */

import type { SimulationClass } from './simulation-catalog.ts';
import { getCredits } from '../data/credits.ts';
import { createParameterEditor } from './parameter-editor.ts';
import {
  createThemePicker,
  type ThemeId,
  type ThemePickerController,
} from './theme.ts';

export interface SelectionOverlayController {
  /** Reveal the overlay. */
  show: () => void;

  /** Hide the overlay. */
  hide: () => void;

  /** Replace the active simulation family and parameter values. */
  setSimulation: (simClass: SimulationClass, values: Record<string, number>) => void;

  /** Update the selected theme button state. */
  setTheme: (theme: ThemeId) => void;

  /** Switch the visible section within the overlay. */
  setView: (view: SelectionOverlayView) => void;
}

export type SelectionOverlayView = 'parameters' | 'settings' | 'credits' | 'terminal';

interface SelectionOverlayOptions {
  simClass: SimulationClass;
  values: Record<string, number>;
  theme: ThemeId;
  onValuesChange: (values: Record<string, number>) => void;
  onThemeChange: (theme: ThemeId) => void;
  onRun: () => void;
  onApplySettings: () => void;
  onClose: () => void;
  initialView?: SelectionOverlayView;
}

/**
 * Create and mount the selection/configuration overlay.
 *
 * @param container - Overlay layer host element.
 * @param options - Initial state and callback hooks.
 * @returns Controller for showing/hiding and syncing state.
 */
export function createSelectionOverlay(
  container: HTMLElement,
  options: SelectionOverlayOptions,
): SelectionOverlayController {
  // Full-screen shell that sits above the viewport while the user is choosing
  // parameters, tweaking theme settings, or reading credits/terminal copy.
  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--config';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // The visual panel is split into two halves: left media/branding, right
  // controls. The shell element exists so CSS can switch layouts without this
  // module caring about breakpoints.
  const panel = document.createElement('div');

  panel.className = 'config-overlay';

  const shell = document.createElement('div');

  shell.className = 'config-overlay__shell';

  const media = document.createElement('div');

  media.className = 'config-overlay__media';
  const mediaImage = document.createElement('img');

  mediaImage.className = 'config-overlay__media-image';
  mediaImage.src = options.simClass.placeholderImage;
  mediaImage.alt = `${options.simClass.label} preview`;

  // The left-hand media block is largely atmospheric. The real interaction
  // lives on the control side where users set parameters and launch runs.
  media.innerHTML = `
    <div class="config-overlay__media-copy">
      <h1 class="config-overlay__headline">Universe \n Engine</h1>
    </div>
  `;
  media.prepend(mediaImage);

  const controls = document.createElement('div');

  controls.className = 'config-overlay__controls';
  controls.dataset.view = options.initialView ?? 'parameters';

  const header = document.createElement('div');

  header.className = 'config-overlay__header';

  const titleBlock = document.createElement('div');

  titleBlock.className = 'config-overlay__title-block';
  titleBlock.innerHTML = `
    <p class="config-overlay__eyebrow">Celestial observer</p>
    <h2 class="config-overlay__title">Simulation matrix</h2>
  `;

  const closeButton = document.createElement('button');

  closeButton.className = 'config-overlay__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close configuration overlay');
  closeButton.textContent = '×';

  const sectionLabel = document.createElement('div');

  sectionLabel.className = 'config-overlay__section-indicator';
  sectionLabel.textContent = 'Parameters';

  header.appendChild(sectionLabel);
  header.appendChild(titleBlock);
  header.appendChild(closeButton);

  // Parameters are mounted by the dedicated editor helper so this overlay does
  // not need to own slider rendering details directly.
  const parameterSection = document.createElement('section');

  parameterSection.className = 'config-overlay__section config-overlay__section--grow';
  parameterSection.dataset.section = 'parameters';
  const parametersHost = document.createElement('div');

  parameterSection.appendChild(parametersHost);

  const settingsSection = document.createElement('section');

  settingsSection.className = 'config-overlay__section config-overlay__section--grow';
  settingsSection.dataset.section = 'settings';
  settingsSection.innerHTML = `
    <p class="config-overlay__eyebrow">Theme settings</p>
    <p class="config-overlay__settings-copy">Theme only for this pass. Choose the interface era here instead of keeping extra buttons inside the overlay.</p>
  `;
  const themePickerHost = document.createElement('div');

  settingsSection.appendChild(themePickerHost);

  // Credits are static project data, so we render them once up front.
  const creditsSection = document.createElement('section');

  creditsSection.className = 'config-overlay__section config-overlay__section--grow';
  creditsSection.dataset.section = 'credits';
  creditsSection.innerHTML = `
    <div class="credits-list" data-credits></div>
  `;

  const creditsList = creditsSection.querySelector(
    '[data-credits]',
  ) as HTMLDivElement;

  const credits = getCredits();

  creditsList.innerHTML = '';

  if (credits.length === 0) {
    const entry = document.createElement('div');

    entry.className = 'credits-list__entry';
    entry.textContent = 'To be credited...';
    creditsList.appendChild(entry);
  } else {
    for (const credit of credits) {
      if (credit.header) {
        const heading = document.createElement('div');

        heading.className = 'credits-list__heading';
        heading.textContent = credit.text;
        creditsList.appendChild(heading);
      } else {
        const entry = document.createElement('div');

        entry.className = 'credits-list__entry';
        const textSpan = document.createElement('span');

        textSpan.className = 'credits-list__text';

        if (credit.url) {
          const link = document.createElement('a');

          link.className = 'credits-list__link';
          link.href = credit.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = credit.text;
          textSpan.appendChild(link);
        } else {
          textSpan.textContent = credit.text;
        }

        entry.appendChild(textSpan);

        creditsList.appendChild(entry);
      }
    }
  }

  // The terminal tab is intentionally placeholder content for now. Keeping the
  // tab in place now gives us a stable home for real logs later.
  const terminalSection = document.createElement('section');

  terminalSection.className = 'config-overlay__section config-overlay__section--grow';
  terminalSection.dataset.section = 'terminal';
  const terminalProfileLine = document.createElement('div');

  terminalProfileLine.className = 'config-overlay__console-line';
  terminalProfileLine.textContent = `> CURRENT_PROFILE :: ${options.simClass.label.toUpperCase()}`;
  terminalSection.innerHTML = `
    <p class="config-overlay__eyebrow">System console</p>
    <div class="config-overlay__console">
      <div class="config-overlay__console-line">&gt; OPERATOR_SESSION :: ACTIVE</div>
      <div class="config-overlay__console-line">&gt; NEXT_ACTION :: RUN_SIMULATION</div>
      <div class="config-overlay__console-line">&gt; FUTURE_MODE :: ATTACH_SIMULATION_LOGS_TO_VIDEO_PLAYBACK</div>
      <div class="config-overlay__console-line">&gt; NOTE :: this menu entry is reserved for the real simulation log viewer</div>
    </div>
  `;
  terminalSection
    .querySelector('.config-overlay__console')
    ?.prepend(terminalProfileLine);

  const footer = document.createElement('div');

  footer.className = 'config-overlay__footer';

  const runButton = document.createElement('button');

  runButton.className = 'run-button';
  runButton.type = 'button';
  runButton.textContent = 'Run';

  footer.appendChild(runButton);

  controls.appendChild(header);
  controls.appendChild(parameterSection);
  controls.appendChild(settingsSection);
  controls.appendChild(creditsSection);
  controls.appendChild(terminalSection);
  controls.appendChild(footer);

  shell.appendChild(media);
  shell.appendChild(controls);
  panel.appendChild(shell);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  // Mount the two sub-controllers after their host nodes exist.
  const parameterEditor = createParameterEditor(
    parametersHost,
    options.simClass,
    options.values,
    options.onValuesChange,
  );
  const themePicker: ThemePickerController = createThemePicker(
    themePickerHost,
    options.theme,
    options.onThemeChange,
  );

  closeButton.addEventListener('click', options.onClose);

  applyView(options.initialView ?? 'parameters');

  function applyView(view: SelectionOverlayView): void {
    // We store the active view as data so CSS can switch visible sections
    // declaratively instead of this module toggling many classes by hand.
    controls.dataset.view = view;
    sectionLabel.textContent =
      view === 'parameters'
        ? 'Parameters'
        : view === 'settings'
          ? 'Settings'
          : view === 'credits'
            ? 'Credits'
            : 'Terminal';

    // The footer button changes job based on the active section. Reusing one
    // button keeps the bottom chrome stable while the body content changes.
    if (view === 'settings') {
      runButton.textContent = 'Apply';
    } else if (view === 'terminal' || view === 'credits') {
      runButton.textContent = 'Close';
    } else {
      runButton.textContent = 'Run';
    }
  }

  runButton.addEventListener('click', () => {
    const activeView = controls.dataset.view as SelectionOverlayView;

    // Settings uses the footer button as an "apply and close" affordance.
    if (activeView === 'settings') {
      options.onApplySettings();

      return;
    }

    // Read-only tabs simply close the overlay when the footer button is pressed.
    if (activeView === 'terminal') {
      options.onClose();

      return;
    }

    if (activeView === 'credits') {
      options.onClose();

      return;
    }

    // Parameter mode is the only view that actually kicks off a simulation run.
    options.onRun();
  });

  return {
    show() {
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
    },
    hide() {
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
    },
    setSimulation(simClass: SimulationClass, values: Record<string, number>) {
      // Keep all subviews aligned when the active simulation family changes.
      parameterEditor.setSimClass(simClass, values);
      mediaImage.src = simClass.placeholderImage;
      mediaImage.alt = `${simClass.label} preview`;
      terminalProfileLine.textContent = `> CURRENT_PROFILE :: ${simClass.label.toUpperCase()}`;
    },
    setTheme(theme: ThemeId) {
      themePicker.setActive(theme);
    },
    setView(view: SelectionOverlayView) {
      applyView(view);
    },
  };
}
