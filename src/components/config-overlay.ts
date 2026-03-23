/**
 * Config overlay.
 *
 * This is the primary control surface for the application. It combines:
 * - parameter editing
 * - theme settings
 * - the run trigger that moves the app into initializing mode
 */

import type { SimulationClass } from '../data/simulations.ts';
import { getCredits } from '../data/credits.ts';
import { createParameterEditor } from './parameter-editor.ts';
import {
  createThemePicker,
  type ThemeId,
  type ThemePickerController,
} from './theme.ts';

export interface ConfigOverlayController {
  /** Reveal the configuration overlay. */
  show: () => void;
  /** Hide the overlay without destroying its DOM. */
  hide: () => void;
  /** Rebind the form to a different simulation class and value set. */
  setSimulation: (simClass: SimulationClass, values: Record<string, number>) => void;
  /** Keep the embedded theme picker selection synchronized. */
  setTheme: (theme: ThemeId) => void;
  /** Switch which internal section is visible. */
  setView: (view: ConfigOverlayView) => void;
}

export type ConfigOverlayView = 'parameters' | 'settings' | 'credits' | 'terminal';

interface ConfigOverlayOptions {
  simClass: SimulationClass;
  values: Record<string, number>;
  theme: ThemeId;
  onValuesChange: (values: Record<string, number>) => void;
  onThemeChange: (theme: ThemeId) => void;
  onRun: () => void;
  onApplySettings: () => void;
  onClose: () => void;
  initialView?: ConfigOverlayView;
}

/**
 * Create and mount the main configuration overlay.
 *
 * The overlay is created once and then updated/reused when simulation family,
 * parameter values, or theme selection changes.
 *
 * @param container - Overlay layer host element.
 * @param options - Initial state and callback hooks.
 * @returns Controller for showing/hiding and syncing state.
 */
export function createConfigOverlay(
  container: HTMLElement,
  options: ConfigOverlayOptions,
): ConfigOverlayController {
  // Full-screen overlay wrapper. This provides the dimmed glass backdrop.
  const overlay = document.createElement('section');
  overlay.className = 'overlay overlay--config';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // Central panel that holds the full overlay content.
  const panel = document.createElement('div');
  panel.className = 'config-overlay';

  // Shell splits the overlay into the left visual panel and the right controls panel.
  const shell = document.createElement('div');
  shell.className = 'config-overlay__shell';

  // Left side: atmospheric copy and preview styling.
  const media = document.createElement('div');
  media.className = 'config-overlay__media';
  const mediaImage = document.createElement('img');
  mediaImage.className = 'config-overlay__media-image';
  mediaImage.src = options.simClass.placeholderImage;
  mediaImage.alt = `${options.simClass.label} preview`;
  media.innerHTML = `
    <div class="config-overlay__media-copy">
      <h1 class="config-overlay__headline">Universe \n Engine</h1>
    </div>
  `;
  media.prepend(mediaImage);

  // Right side: the interactive controls the user actually edits.
  const controls = document.createElement('div');
  controls.className = 'config-overlay__controls';
  controls.dataset.view = options.initialView ?? 'parameters';

  // Header contains settings access and a lightweight close action.
  const header = document.createElement('div');
  header.className = 'config-overlay__header';

  // Center title block gives the overlay a strong identity.
  const titleBlock = document.createElement('div');
  titleBlock.className = 'config-overlay__title-block';
  titleBlock.innerHTML = `
    <p class="config-overlay__eyebrow">Celestial observer</p>
    <h2 class="config-overlay__title">Simulation matrix</h2>
  `;

  // Right-edge close action lets the user leave config without running.
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

  // Main editable section: parameter controls. This is allowed to grow and scroll.
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

  const creditsSection = document.createElement('section');
  creditsSection.className = 'config-overlay__section config-overlay__section--grow';
  creditsSection.dataset.section = 'credits';
  creditsSection.innerHTML = `
    <p class="config-overlay__eyebrow">Credits</p>
    <p class="config-overlay__settings-copy">Attribution and acknowledgements.</p>
    <div class="config-overlay__console" data-credits></div>
  `;

  const creditsConsole = creditsSection.querySelector(
    '[data-credits]',
  ) as HTMLDivElement;

  // Credits are repo-controlled YAML today (not user input), but we still render
  // them via DOM APIs (not `innerHTML`) to keep the data flow safe and obvious.
  const credits = getCredits();
  creditsConsole.innerHTML = '';

  if (credits.length === 0) {
    const row = document.createElement('div');
    row.className = 'config-overlay__console-line';
    row.textContent = 'To be credited...';
    creditsConsole.appendChild(row);
  } else {
    for (const credit of credits) {
      const row = document.createElement('div');
      row.className = 'config-overlay__console-line';
      row.textContent = credit.text;
      creditsConsole.appendChild(row);
    }
  }

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

  // Footer anchors the run call-to-action and explains what happens next.
  const footer = document.createElement('div');
  footer.className = 'config-overlay__footer';

  const runButton = document.createElement('button');
  runButton.className = 'run-button';
  runButton.type = 'button';
  runButton.textContent = 'Run';

  footer.appendChild(runButton);

  // Physically assemble the right-hand controls column.
  controls.appendChild(header);
  controls.appendChild(parameterSection);
  controls.appendChild(settingsSection);
  controls.appendChild(creditsSection);
  controls.appendChild(terminalSection);
  controls.appendChild(footer);

  // Physically assemble the whole overlay shell and mount it.
  shell.appendChild(media);
  shell.appendChild(controls);
  panel.appendChild(shell);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  // Create the three reusable child controllers that live inside this overlay.
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

  // Close just hides the overlay; it does not clear any stored state.
  closeButton.addEventListener('click', options.onClose);

  applyView(options.initialView ?? 'parameters');

  /**
   * Apply the active internal view and keep header/footer labels consistent.
   *
   * @param view - View to activate.
   * @returns void
   */
  function applyView(view: ConfigOverlayView): void {
    controls.dataset.view = view;
    sectionLabel.textContent =
      view === 'parameters'
        ? 'Parameters'
        : view === 'settings'
          ? 'Settings'
          : view === 'credits'
            ? 'Credits'
            : 'Terminal';

    if (view === 'settings') {
      runButton.textContent = 'Apply';
    } else if (view === 'terminal' || view === 'credits') {
      runButton.textContent = 'Close';
    } else {
      runButton.textContent = 'Run';
    }
  }

  // The primary footer action changes by active overlay section.
  runButton.addEventListener('click', () => {
    const activeView = controls.dataset.view as ConfigOverlayView;

    if (activeView === 'settings') {
      options.onApplySettings();
      return;
    }

    if (activeView === 'terminal') {
      options.onClose();
      return;
    }

    if (activeView === 'credits') {
      options.onClose();
      return;
    }

    options.onRun();
  });

  return {
    show() {
      // Keep the DOM mounted and simply reveal it.
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
    },
    hide() {
      // Hide the overlay and also collapse the settings card so it does not
      // unexpectedly remain open next time config is shown.
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
    },
    setSimulation(simClass: SimulationClass, values: Record<string, number>) {
      // Sync the parameter editor and the preview copy to the latest external state.
      parameterEditor.setSimClass(simClass, values);
      mediaImage.src = simClass.placeholderImage;
      mediaImage.alt = `${simClass.label} preview`;
      terminalProfileLine.textContent = `> CURRENT_PROFILE :: ${simClass.label.toUpperCase()}`;
    },
    setTheme(theme: ThemeId) {
      // Only the picker UI needs to update here; `main.ts` applies the real theme tokens.
      themePicker.setActive(theme);
    },
    setView(view: ConfigOverlayView) {
      applyView(view);
    },
  };
}
