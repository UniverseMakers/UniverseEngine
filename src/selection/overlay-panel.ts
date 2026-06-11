/**
 * Overlay panel — a generic multi-purpose modal reused across the app.
 *
 * This is a shell with three tabbed subviews. The same panel is repurposed
 * for different tasks — only the body content and the footer button label
 * change per view.
 *
 * ── Views ──────────────────────────────────────────────────────────────
 * `parameters`   Sliders for tweaking simulation knobs before a run.
 *                Footer button: "Run" → kicks off the simulation.
 * `settings`     Theme picker (choose the visual era for this session).
 *                Footer button: "Apply" → saves theme and closes.
 * `credits`      Read-only list of project contributors.
 *                Footer button: "Close" → dismisses the panel.
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

export interface OverlayPanelController {
  show: () => void;
  hide: () => void;
  setSimulation: (simClass: SimulationClass, values: Record<string, number>) => void;
  setTheme: (theme: ThemeId) => void;
  setView: (view: OverlayPanelView) => void;
}

export type OverlayPanelView = 'parameters' | 'settings' | 'credits';

interface OverlayPanelOptions {
  simClass: SimulationClass;
  values: Record<string, number>;
  theme: ThemeId;
  onValuesChange: (values: Record<string, number>) => void;
  onThemeChange: (theme: ThemeId) => void;
  onRun: () => void;
  onApplySettings: () => void;
  onClose: () => void;
  initialView?: OverlayPanelView;
}

/**
 * Create and mount the overlay panel.
 */
export function createOverlayPanel(
  container: HTMLElement,
  options: OverlayPanelOptions,
): OverlayPanelController {
  // ── Shell ──────────────────────────────────────────────────────────────

  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--config';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  const panel = document.createElement('div');

  panel.className = 'config-overlay';

  const shell = document.createElement('div');

  shell.className = 'config-overlay__shell';

  // ── Left column: media block ──────────────────────────────────────────

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

  // ── Right column: controls ────────────────────────────────────────────

  const controls = document.createElement('div');

  controls.className = 'config-overlay__controls';
  controls.dataset.view = options.initialView ?? 'parameters';

  // ── Header ─────────────────────────────────────────────────────────────

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
  closeButton.setAttribute('aria-label', 'Close overlay');
  closeButton.textContent = '×';

  const sectionLabel = document.createElement('div');

  sectionLabel.className = 'config-overlay__section-indicator';
  sectionLabel.textContent = 'Parameters';

  header.appendChild(sectionLabel);
  header.appendChild(titleBlock);
  header.appendChild(closeButton);

  // ── Body: Parameters ──────────────────────────────────────────────────

  const parameterSection = document.createElement('section');

  parameterSection.className = 'config-overlay__section config-overlay__section--grow';
  parameterSection.dataset.section = 'parameters';
  const parametersHost = document.createElement('div');

  parameterSection.appendChild(parametersHost);

  // ── Body: Settings ────────────────────────────────────────────────────

  const settingsSection = document.createElement('section');

  settingsSection.className = 'config-overlay__section config-overlay__section--grow';
  settingsSection.dataset.section = 'settings';
  settingsSection.innerHTML = `
    <p class="config-overlay__eyebrow">Theme settings</p>
    <p class="config-overlay__settings-copy">Theme only for this pass. Choose the interface era here instead of keeping extra buttons inside the overlay.</p>
  `;
  const themePickerHost = document.createElement('div');

  settingsSection.appendChild(themePickerHost);

  // ── Body: Credits ─────────────────────────────────────────────────────

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

  // ── Footer ─────────────────────────────────────────────────────────────
  // Context-sensitive button:
  //   parameters → "Run"    (launches the simulation)
  //   settings   → "Apply"  (saves theme, returns to display)
  //   credits    → "Close"  (dismisses the panel)

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
  controls.appendChild(footer);

  shell.appendChild(media);
  shell.appendChild(controls);
  panel.appendChild(shell);
  overlay.appendChild(panel);
  container.appendChild(overlay);

  // ── Sub-controllers ────────────────────────────────────────────────────

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

  function applyView(view: OverlayPanelView): void {
    controls.dataset.view = view;
    sectionLabel.textContent =
      view === 'parameters' ? 'Parameters' : view === 'settings' ? 'Settings' : 'Credits';

    if (view === 'settings') {
      footerButton.textContent = 'Apply';
    } else if (view === 'credits') {
      footerButton.textContent = 'Close';
    } else {
      footerButton.textContent = 'Run';
    }
  }

  // ── Footer button actions ──────────────────────────────────────────────

  footerButton.addEventListener('click', () => {
    const activeView = controls.dataset.view as OverlayPanelView;

    if (activeView === 'settings') {
      options.onApplySettings();

      return;
    }

    if (activeView === 'credits') {
      options.onClose();

      return;
    }

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
      parameterEditor.setSimClass(simClass, values);
      mediaImage.src = simClass.placeholderImage;
      mediaImage.alt = `${simClass.label} preview`;
    },
    setTheme(theme: ThemeId) {
      themePicker.setActive(theme);
    },
    setView(view: OverlayPanelView) {
      applyView(view);
    },
  };
}
