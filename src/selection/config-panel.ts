/**
 * Config panel — the primary overlay for parameter tuning, theme settings,
 * credits, and the system console.
 *
 * This is a multi-purpose modal with four tabbed subviews. The same panel
 * shell is reused for all of them — only the body content and the footer
 * button label change per view.
 *
 * ── Views ──────────────────────────────────────────────────────────────
 * `parameters`   Sliders for tweaking simulation knobs before a run.
 *                Footer button: "Run" → kicks off the simulation.
 * `settings`     Theme picker (choose the visual era for this session).
 *                Footer button: "Apply" → saves theme and closes.
 * `credits`      Read-only list of project contributors.
 *                Footer button: "Close" → dismisses the overlay.
 * `terminal`     Placeholder system console (reserved for future log viewer).
 *                Footer button: "Close" → dismisses the overlay.
 *
 * ── Architecture ───────────────────────────────────────────────────────
 * The panel is mounted once and stays alive for the lifetime of the app.
 * Switching views calls `setView()` which updates a CSS data attribute so
 * that section visibility is handled declaratively. The panel does not own
 * application state — it fires callbacks and the app shell decides what to
 * do with them.
 */

import type { SimulationClass } from './simulation-catalog.ts';
import { getCredits } from '../data/credits.ts';
import { createParameterEditor } from './parameter-editor.ts';
import {
  createThemePicker,
  type ThemeId,
  type ThemePickerController,
} from './theme.ts';

export interface ConfigPanelController {
  /** Reveal the panel. */
  show: () => void;

  /** Hide the panel. */
  hide: () => void;

  /** Replace the active simulation family and parameter values. */
  setSimulation: (simClass: SimulationClass, values: Record<string, number>) => void;

  /** Update the selected theme button state. */
  setTheme: (theme: ThemeId) => void;

  /** Switch the visible section within the panel. */
  setView: (view: ConfigPanelView) => void;
}

/** Which subview the config panel is currently displaying. */
export type ConfigPanelView = 'parameters' | 'settings' | 'credits' | 'terminal';

interface ConfigPanelOptions {
  simClass: SimulationClass;
  values: Record<string, number>;
  theme: ThemeId;
  onValuesChange: (values: Record<string, number>) => void;
  onThemeChange: (theme: ThemeId) => void;
  onRun: () => void;
  onApplySettings: () => void;
  onClose: () => void;
  initialView?: ConfigPanelView;
}

/**
 * Create and mount the config panel.
 *
 * @param container - Overlay layer host element.
 * @param options - Initial state and callback hooks.
 * @returns Controller for showing/hiding, syncing state, and switching views.
 */
export function createConfigPanel(
  container: HTMLElement,
  options: ConfigPanelOptions,
): ConfigPanelController {
  // ── Shell ──────────────────────────────────────────────────────────────
  // Full-screen backdrop that sits above the viewport. Hidden by default;
  // shown/hidden via `show()` / `hide()` on the returned controller.

  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--config';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // ── Two-column layout ──────────────────────────────────────────────────
  // Left: media block (atmospheric — placeholder image + branding headline).
  // Right: controls column (header, body sections, footer button).
  // CSS handles responsive collapse so this module stays layout-agnostic.

  const panel = document.createElement('div');

  panel.className = 'config-overlay';

  const shell = document.createElement('div');

  shell.className = 'config-overlay__shell';

  // Left column —───────────────────────────────────────────────────────────

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

  // Right column —──────────────────────────────────────────────────────────

  const controls = document.createElement('div');

  controls.className = 'config-overlay__controls';
  controls.dataset.view = options.initialView ?? 'parameters';

  // ── Header ─────────────────────────────────────────────────────────────
  // Fixed row: section indicator (top-left label), title block, close button.

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

  // ── Body: Parameters section ───────────────────────────────────────────
  // Sliders for each tunable parameter of the active simulation family.
  // Rendered by the dedicated parameter-editor helper so this module doesn't
  // own slider creation or value-binding logic.

  const parameterSection = document.createElement('section');

  parameterSection.className = 'config-overlay__section config-overlay__section--grow';
  parameterSection.dataset.section = 'parameters';
  const parametersHost = document.createElement('div');

  parameterSection.appendChild(parametersHost);

  // ── Body: Settings section ─────────────────────────────────────────────
  // Theme picker — lets the user choose a visual era (Tron, Matrix, etc.)
  // that applies immediately to this session.

  const settingsSection = document.createElement('section');

  settingsSection.className = 'config-overlay__section config-overlay__section--grow';
  settingsSection.dataset.section = 'settings';
  settingsSection.innerHTML = `
    <p class="config-overlay__eyebrow">Theme settings</p>
    <p class="config-overlay__settings-copy">Theme only for this pass. Choose the interface era here instead of keeping extra buttons inside the overlay.</p>
  `;
  const themePickerHost = document.createElement('div');

  settingsSection.appendChild(themePickerHost);

  // ── Body: Credits section ──────────────────────────────────────────────
  // Static project credit entries loaded from the data module. Rendered once
  // at construction time since credits don't change during a session.

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

  // ── Body: Terminal section ─────────────────────────────────────────────
  // Placeholder system console. The console lines are decorative for now,
  // but this section is reserved for a real simulation log viewer.

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

  // ── Footer ─────────────────────────────────────────────────────────────
  // The single footer button is context-sensitive — its label and action
  // change depending on which subview is active:
  //   parameters → "Run"    (launches the simulation)
  //   settings   → "Apply"  (saves theme, returns to display)
  //   credits    → "Close"  (dismisses the overlay)
  //   terminal   → "Close"  (dismisses the overlay)

  const footer = document.createElement('div');

  footer.className = 'config-overlay__footer';

  const footerButton = document.createElement('button');

  footerButton.className = 'run-button';
  footerButton.type = 'button';
  footerButton.textContent = 'Run';

  footer.appendChild(footerButton);

  // ── Assemble ───────────────────────────────────────────────────────────

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

  // ── Sub-controllers ────────────────────────────────────────────────────
  // Mount parameter editor and theme picker into their host elements after
  // the DOM nodes exist.

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

  // ── View switching ─────────────────────────────────────────────────────

  /**
   * Switch the visible body section and update the footer button.
   *
   * Section visibility is driven by a `data-view` attribute on the controls
   * container — CSS rules handle show/hide declaratively so we don't need to
   * toggle individual `display` properties by hand.
   */
  function applyView(view: ConfigPanelView): void {
    controls.dataset.view = view;
    sectionLabel.textContent =
      view === 'parameters'
        ? 'Parameters'
        : view === 'settings'
          ? 'Settings'
          : view === 'credits'
            ? 'Credits'
            : 'Terminal';

    // The footer button is context-sensitive — its label reflects what
    // pressing it will actually do in the active view.
    if (view === 'settings') {
      footerButton.textContent = 'Apply';
    } else if (view === 'terminal' || view === 'credits') {
      footerButton.textContent = 'Close';
    } else {
      footerButton.textContent = 'Run';
    }
  }

  // ── Footer button actions ──────────────────────────────────────────────

  footerButton.addEventListener('click', () => {
    const activeView = controls.dataset.view as ConfigPanelView;

    if (activeView === 'settings') {
      options.onApplySettings();

      return;
    }

    // Credits and terminal are read-only views — the footer button just
    // dismisses the overlay back to the previous mode.
    if (activeView === 'terminal') {
      options.onClose();

      return;
    }

    if (activeView === 'credits') {
      options.onClose();

      return;
    }

    // Only the parameters view triggers an actual simulation run.
    options.onRun();
  });

  // ── Public controller ──────────────────────────────────────────────────

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
    setView(view: ConfigPanelView) {
      applyView(view);
    },
  };
}
