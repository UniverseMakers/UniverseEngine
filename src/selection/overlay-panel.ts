/**
 * Overlay panel — a generic multi-purpose modal reused across the app.
 *
 * This is a shell with three tabbed subviews. The settings view also contains
 * the password-gated advanced controls used for kiosk/exhibit configuration.
 */

import type { SimulationClass } from './simulation-catalog.ts';
import { getCredits } from '../data/credits.ts';
import { createParameterEditor } from './parameter-editor.ts';
import {
  createThemePicker,
  type ThemeId,
  type ThemePickerController,
} from './theme.ts';
import { withBaseUrl } from '../shared/urls.ts';
import {
  ADVANCED_SETTINGS_PASSWORD,
  type AdvancedSettings,
} from '../shared/advanced-settings.ts';

export interface OverlayPanelController {
  show: () => void;
  hide: () => void;
  setSimulation: (simClass: SimulationClass, values: Record<string, number>) => void;
  setTheme: (theme: ThemeId) => void;
  setView: (view: OverlayPanelView) => void;
  setAdvancedSettings: (settings: AdvancedSettings) => void;
  setBackVisible: (visible: boolean) => void;
}

export type OverlayPanelView = 'parameters' | 'settings' | 'credits';

interface OverlayPanelOptions {
  simClass: SimulationClass;
  values: Record<string, number>;
  theme: ThemeId;
  advancedSettings: AdvancedSettings;
  availableScales: SimulationClass[];
  onValuesChange: (values: Record<string, number>) => void;
  onThemeChange: (theme: ThemeId) => void;
  onRun: () => void;
  onResetGalaxyChecklist: () => void;
  onApplySettings: (settings: AdvancedSettings) => void;
  onClose: () => void;
  initialView?: OverlayPanelView;
}

export function createOverlayPanel(
  container: HTMLElement,
  options: OverlayPanelOptions,
): OverlayPanelController {
  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--config';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  const panel = document.createElement('div');

  panel.className = 'config-overlay';

  const shell = document.createElement('div');

  shell.className = 'config-overlay__shell';

  const media = document.createElement('div');

  media.className = 'config-overlay__media';
  media.dataset.simClass = options.simClass.id;
  const mediaImage = document.createElement('img');

  mediaImage.className = 'config-overlay__media-image';
  mediaImage.src = options.simClass.placeholderImage;
  mediaImage.alt = `${options.simClass.label} preview`;

  media.innerHTML = `
    <div class="config-overlay__media-copy">
      <h1 class="config-overlay__headline">Universe \n Engine</h1>
      <p class="config-overlay__media-subtitle"></p>
    </div>
  `;
  media.prepend(mediaImage);
  const mediaSubtitle = media.querySelector(
    '.config-overlay__media-subtitle',
  ) as HTMLParagraphElement;

  const charterMark = document.createElement('img');

  charterMark.className = 'config-overlay__chartermark';
  charterMark.src = withBaseUrl('assets/credits/des9400-chartermark.webp');
  charterMark.alt = 'DES9400 SSE 2026 Chartermark';
  charterMark.decoding = 'async';
  media.appendChild(charterMark);

  const controls = document.createElement('div');

  controls.className = 'config-overlay__controls';
  controls.dataset.view = options.initialView ?? 'parameters';

  const header = document.createElement('div');

  header.className = 'config-overlay__header';

  const titleBlock = document.createElement('div');

  titleBlock.className = 'config-overlay__title-block';
  titleBlock.innerHTML = `
    <p class="config-overlay__eyebrow"></p>
    <h2 class="config-overlay__title"></h2>
    <p class="config-overlay__subtitle"></p>
  `;
  const titleEyebrow = titleBlock.querySelector(
    '.config-overlay__eyebrow',
  ) as HTMLParagraphElement;
  const titleText = titleBlock.querySelector(
    '.config-overlay__title',
  ) as HTMLHeadingElement;
  const titleSubtitle = titleBlock.querySelector(
    '.config-overlay__subtitle',
  ) as HTMLParagraphElement;

  const closeButton = document.createElement('button');

  closeButton.className = 'config-overlay__close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Back');
  closeButton.textContent = '←';

  header.appendChild(titleBlock);
  header.appendChild(closeButton);

  const parameterSection = document.createElement('section');

  parameterSection.className = 'config-overlay__section config-overlay__section--grow';
  parameterSection.dataset.section = 'parameters';
  const parametersHost = document.createElement('div');

  parameterSection.appendChild(parametersHost);

  const settingsSection = document.createElement('section');

  settingsSection.className = 'config-overlay__section config-overlay__section--grow';
  settingsSection.dataset.section = 'settings';
  const themePickerHost = document.createElement('div');
  themePickerHost.className = 'config-overlay__settings-block';
  themePickerHost.innerHTML = `
    <p class="config-overlay__eyebrow">Theme settings</p>
    <p class="config-overlay__settings-copy">Theme only for this pass. Choose the interface era here, and set the default audio behavior for views that support sonification.</p>
  `;
  const checklistSettings = document.createElement('section');

  checklistSettings.className = 'config-overlay__settings-group config-overlay__settings-block';
  checklistSettings.innerHTML = `
    <p class="config-overlay__eyebrow">Galaxy checklist</p>
    <p class="config-overlay__settings-copy">Clear the galaxy scavenger-hunt progress and uncheck every morphology box for this session.</p>
  `;

  const resetGalaxyChecklistButton = document.createElement('button');

  resetGalaxyChecklistButton.className = 'advanced-settings__access';
  resetGalaxyChecklistButton.type = 'button';
  resetGalaxyChecklistButton.textContent = 'Reset Galaxy Checkboxes';
  resetGalaxyChecklistButton.addEventListener('click', () => {
    options.onResetGalaxyChecklist();
  });
  checklistSettings.appendChild(resetGalaxyChecklistButton);
  settingsSection.appendChild(themePickerHost);
  settingsSection.prepend(checklistSettings);

  const audioSettings = document.createElement('section');

  audioSettings.className = 'audio-settings config-overlay__settings-block';
  audioSettings.innerHTML = `
    <p class="config-overlay__eyebrow">Audio defaults</p>
    <p class="config-overlay__settings-copy">These defaults apply when a run opens an audio-enabled view. You can still change them from the playback controls.</p>
  `;

  const audioMuteField = document.createElement('label');

  audioMuteField.className = 'advanced-settings__field advanced-settings__field--inline';
  const audioMuteInput = document.createElement('input');
  const audioMuteCopy = document.createElement('span');

  audioMuteInput.type = 'checkbox';
  audioMuteInput.className = 'advanced-settings__checkbox';
  audioMuteCopy.innerHTML = `
    <span class="advanced-settings__label">Mute audio by default</span>
    <span class="advanced-settings__help">Start audio-enabled views muted until the visitor chooses to listen.</span>
  `;
  audioMuteField.appendChild(audioMuteInput);
  audioMuteField.appendChild(audioMuteCopy);
  audioSettings.appendChild(audioMuteField);

  const audioVolumeField = document.createElement('label');

  audioVolumeField.className = 'advanced-settings__field';
  audioVolumeField.innerHTML = `
    <span class="advanced-settings__label">Default audio volume</span>
    <span class="advanced-settings__help">Set the starting playback level for sonified runs.</span>
  `;
  const audioVolumeInput = document.createElement('input');
  const audioVolumeValue = document.createElement('span');

  audioVolumeInput.type = 'range';
  audioVolumeInput.min = '0';
  audioVolumeInput.max = '100';
  audioVolumeInput.step = '1';
  audioVolumeInput.className = 'audio-settings__slider';
  audioVolumeValue.className = 'audio-settings__value';
  audioVolumeField.appendChild(audioVolumeInput);
  audioVolumeField.appendChild(audioVolumeValue);
  audioSettings.appendChild(audioVolumeField);
  settingsSection.appendChild(audioSettings);

  const advancedPanel = document.createElement('section');

  advancedPanel.className = 'advanced-settings config-overlay__settings-block';
  advancedPanel.dataset.state = 'closed';
  advancedPanel.innerHTML = `
    <div class="advanced-settings__header">
      <p class="config-overlay__eyebrow">Advanced settings</p>
      <p class="config-overlay__settings-copy">Password-gated controls for scale locking, asset source selection, logging, and scale visibility.</p>
    </div>
  `;

  const advancedAccessButton = document.createElement('button');

  advancedAccessButton.className = 'advanced-settings__access';
  advancedAccessButton.type = 'button';
  advancedAccessButton.textContent = 'Advanced Settings';
  advancedPanel.appendChild(advancedAccessButton);

  const advancedAuth = document.createElement('div');

  advancedAuth.className = 'advanced-settings__auth';
  const passwordInput = document.createElement('input');

  passwordInput.className = 'advanced-settings__password';
  passwordInput.type = 'password';
  passwordInput.placeholder = 'Enter password';
  passwordInput.autocomplete = 'off';

  const unlockButton = document.createElement('button');

  unlockButton.className = 'advanced-settings__unlock';
  unlockButton.type = 'button';
  unlockButton.textContent = 'Unlock';

  const authMessage = document.createElement('p');

  authMessage.className = 'advanced-settings__message';

  advancedAuth.appendChild(passwordInput);
  advancedAuth.appendChild(unlockButton);
  advancedAuth.appendChild(authMessage);
  advancedPanel.appendChild(advancedAuth);

  const advancedForm = document.createElement('div');

  advancedForm.className = 'advanced-settings__form';

  const lockField = document.createElement('label');

  lockField.className = 'advanced-settings__field';
  lockField.innerHTML = `
    <span class="advanced-settings__label">Scale lock</span>
    <span class="advanced-settings__help">Lock the app to one scale and hide the Home action.</span>
  `;
  const lockSelect = document.createElement('select');

  lockSelect.className = 'advanced-settings__select';
  lockSelect.appendChild(new Option('None', ''));

  for (const scale of options.availableScales) {
    lockSelect.appendChild(new Option(scale.label, scale.id));
  }

  lockField.appendChild(lockSelect);
  advancedForm.appendChild(lockField);

  const sourceField = document.createElement('div');

  sourceField.className = 'advanced-settings__field';
  sourceField.innerHTML = `
    <span class="advanced-settings__label">Video source</span>
    <span class="advanced-settings__help">Local uses public/assets. Online uses the future Cloudflare-backed manifest.</span>
  `;
  const sourceOptions = document.createElement('div');

  sourceOptions.className = 'advanced-settings__options';
  const localSourceLabel = document.createElement('label');
  const localSourceInput = document.createElement('input');

  localSourceLabel.className = 'advanced-settings__choice';
  localSourceInput.type = 'radio';
  localSourceInput.name = 'manifest-source';
  localSourceInput.value = 'local';
  localSourceLabel.appendChild(localSourceInput);
  localSourceLabel.append('Local manifest');

  const onlineSourceLabel = document.createElement('label');
  const onlineSourceInput = document.createElement('input');

  onlineSourceLabel.className = 'advanced-settings__choice';
  onlineSourceInput.type = 'radio';
  onlineSourceInput.name = 'manifest-source';
  onlineSourceInput.value = 'online';
  onlineSourceLabel.appendChild(onlineSourceInput);
  onlineSourceLabel.append('Online manifest');

  sourceOptions.appendChild(localSourceLabel);
  sourceOptions.appendChild(onlineSourceLabel);
  sourceField.appendChild(sourceOptions);
  advancedForm.appendChild(sourceField);

  const verboseField = document.createElement('label');

  verboseField.className = 'advanced-settings__field advanced-settings__field--inline';
  const verboseInput = document.createElement('input');
  const verboseCopy = document.createElement('span');

  verboseInput.type = 'checkbox';
  verboseInput.className = 'advanced-settings__checkbox';
  verboseCopy.innerHTML = `
    <span class="advanced-settings__label">Verbose logging</span>
    <span class="advanced-settings__help">Adds parameter, manifest, and run-selection logs to the console.</span>
  `;
  verboseField.appendChild(verboseInput);
  verboseField.appendChild(verboseCopy);
  advancedForm.appendChild(verboseField);

  const visibilityField = document.createElement('div');

  visibilityField.className = 'advanced-settings__field';
  visibilityField.innerHTML = `
    <span class="advanced-settings__label">Visible scales</span>
    <span class="advanced-settings__help">Hide scales from the landing screen without changing their data.</span>
  `;
  const visibilityOptions = document.createElement('div');

  visibilityOptions.className = 'advanced-settings__options';
  const visibilityInputs = new Map<string, HTMLInputElement>();

  for (const scale of options.availableScales) {
    const choice = document.createElement('label');
    const checkbox = document.createElement('input');

    choice.className = 'advanced-settings__choice';
    checkbox.type = 'checkbox';
    checkbox.value = scale.id;
    visibilityInputs.set(scale.id, checkbox);
    choice.appendChild(checkbox);
    choice.append(`Show ${scale.label}`);
    visibilityOptions.appendChild(choice);
  }

  visibilityField.appendChild(visibilityOptions);
  advancedForm.appendChild(visibilityField);
  advancedPanel.appendChild(advancedForm);
  settingsSection.appendChild(advancedPanel);

  const creditsSection = document.createElement('section');

  creditsSection.className = 'config-overlay__section config-overlay__section--grow';
  creditsSection.dataset.section = 'credits';
  creditsSection.innerHTML = `
    <div class="credits-list" data-credits></div>
  `;

  const creditsList = creditsSection.querySelector('[data-credits]') as HTMLDivElement;
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

  const footer = document.createElement('div');

  footer.className = 'config-overlay__footer';

  const footerButton = document.createElement('button');

  footerButton.className = 'run-button';
  footerButton.type = 'button';
  footerButton.textContent = 'Run';

  footer.appendChild(footerButton);

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

  let pendingAdvancedSettings = cloneAdvancedSettings(options.advancedSettings);
  let advancedState: 'closed' | 'auth' | 'open' = 'closed';
  let parameterBackVisible = !options.advancedSettings.lockedScaleId;

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
  advancedAccessButton.addEventListener('click', () => {
    if (advancedState === 'open') {
      setAdvancedPanelState('closed');

      return;
    }

    setAdvancedPanelState('auth');
    passwordInput.focus();
  });
  unlockButton.addEventListener('click', unlockAdvancedSettings);
  passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      unlockAdvancedSettings();
    }
  });

  lockSelect.addEventListener('change', () => {
    pendingAdvancedSettings.lockedScaleId = lockSelect.value || null;
    syncAdvancedControls();
  });
  localSourceInput.addEventListener('change', () => {
    if (localSourceInput.checked) {
      pendingAdvancedSettings.manifestSource = 'local';
    }
  });
  onlineSourceInput.addEventListener('change', () => {
    if (onlineSourceInput.checked) {
      pendingAdvancedSettings.manifestSource = 'online';
    }
  });
  verboseInput.addEventListener('change', () => {
    pendingAdvancedSettings.verboseLogging = verboseInput.checked;
  });
  audioMuteInput.addEventListener('change', () => {
    pendingAdvancedSettings.audioMutedByDefault = audioMuteInput.checked;
  });
  audioVolumeInput.addEventListener('input', () => {
    pendingAdvancedSettings.defaultAudioVolume = Number(audioVolumeInput.value) / 100;
    syncAudioVolumeValue();
  });

  for (const [scaleId, checkbox] of visibilityInputs.entries()) {
    checkbox.addEventListener('change', () => {
      const visibleScaleIds = Array.from(visibilityInputs.entries())
        .filter(([, input]) => input.checked)
        .map(([id]) => id);

      if (visibleScaleIds.length === 0 && !pendingAdvancedSettings.lockedScaleId) {
        checkbox.checked = true;

        return;
      }

      pendingAdvancedSettings.hiddenScaleIds = Array.from(
        visibilityInputs.keys(),
      ).filter(
        (id) =>
          !visibilityInputs.get(id)?.checked &&
          id !== pendingAdvancedSettings.lockedScaleId,
      );
      syncAdvancedControls();
    });

    if (scaleId === pendingAdvancedSettings.lockedScaleId) {
      checkbox.disabled = true;
    }
  }

  applyView(options.initialView ?? 'parameters');
  syncAdvancedControls();
  setBackVisible(parameterBackVisible);

  function applyView(view: OverlayPanelView): void {
    controls.dataset.view = view;

    if (view === 'parameters') {
      titleEyebrow.textContent = options.simClass.label;
      titleText.textContent = 'Shape Your Simulation';
      titleSubtitle.textContent =
        options.simClass.parameterSubtitle ??
        "Adjust the parameters, inspect the setup, and press 'Run' when you're ready.";
      mediaSubtitle.textContent = options.simClass.label;
      mediaSubtitle.hidden = false;
      mediaImage.src = options.simClass.placeholderImage;
      mediaImage.alt = `${options.simClass.label} preview`;
    } else if (view === 'settings') {
      titleEyebrow.textContent = 'Interface';
      titleText.textContent = 'Adjust The Control Room';
      titleSubtitle.textContent =
        'Change the interface theme and manage exhibit-level options for this installation.';
      mediaSubtitle.textContent = '';
      mediaSubtitle.hidden = true;
      mediaImage.src = withBaseUrl('assets/Cluster_Stuart.webp');
      mediaImage.alt = 'Galaxy cluster simulation preview';
    } else {
      titleEyebrow.textContent = 'References';
      titleText.textContent = 'Project Sources And Attribution';
      titleSubtitle.textContent =
        'Review the datasets, imagery, and supporting materials behind this experience.';
      mediaSubtitle.textContent = '';
      mediaSubtitle.hidden = true;
      mediaImage.src = withBaseUrl('assets/synthetic_hst_pretty_galaxy.webp');
      mediaImage.alt = 'Synthetic galaxy image preview';
    }

    if (view === 'settings') {
      footerButton.textContent = 'Apply';
    } else {
      footerButton.textContent = 'Run Simulation';
    }

    footer.hidden = view === 'credits';
    syncCloseButton();
  }

  function syncAdvancedControls(): void {
    lockSelect.value = pendingAdvancedSettings.lockedScaleId ?? '';
    localSourceInput.checked = pendingAdvancedSettings.manifestSource === 'local';
    onlineSourceInput.checked = pendingAdvancedSettings.manifestSource === 'online';
    verboseInput.checked = pendingAdvancedSettings.verboseLogging;
    audioMuteInput.checked = pendingAdvancedSettings.audioMutedByDefault;
    audioVolumeInput.value = String(
      Math.round(pendingAdvancedSettings.defaultAudioVolume * 100),
    );
    syncAudioVolumeValue();

    for (const [scaleId, checkbox] of visibilityInputs.entries()) {
      const isLockedScale = pendingAdvancedSettings.lockedScaleId === scaleId;

      checkbox.checked =
        isLockedScale || !pendingAdvancedSettings.hiddenScaleIds.includes(scaleId);
      checkbox.disabled = isLockedScale;
    }
  }

  function unlockAdvancedSettings(): void {
    if (passwordInput.value !== ADVANCED_SETTINGS_PASSWORD) {
      authMessage.textContent = 'Incorrect password';

      return;
    }

    passwordInput.value = '';
    authMessage.textContent = '';
    setAdvancedPanelState('open');
  }

  function setAdvancedPanelState(state: 'closed' | 'auth' | 'open'): void {
    advancedState = state;
    advancedPanel.dataset.state = state;
    advancedAccessButton.textContent =
      state === 'open' ? 'Hide Advanced Settings' : 'Advanced Settings';

    if (state !== 'auth') {
      authMessage.textContent = '';
    }
  }

  function resetAdvancedPanel(): void {
    passwordInput.value = '';
    authMessage.textContent = '';
    setAdvancedPanelState('closed');
  }

  function resetAdvancedDraft(): void {
    pendingAdvancedSettings = cloneAdvancedSettings(options.advancedSettings);
    syncAdvancedControls();
  }

  function syncAudioVolumeValue(): void {
    audioVolumeValue.textContent = `${Math.round(Number(audioVolumeInput.value))}%`;
  }

  function syncCloseButton(): void {
    const activeView = controls.dataset.view as OverlayPanelView;
    const showCloseButton =
      activeView === 'settings' || activeView === 'credits' || parameterBackVisible;

    closeButton.hidden = !showCloseButton;
    closeButton.classList.toggle('is-hidden', !showCloseButton);
    closeButton.setAttribute('aria-label', activeView === 'parameters' ? 'Back' : 'Close');
    closeButton.textContent = activeView === 'parameters' ? '←' : '×';
  }

  function setBackVisible(visible: boolean): void {
    parameterBackVisible = visible;
    syncCloseButton();
  }

  footerButton.addEventListener('click', () => {
    const activeView = controls.dataset.view as OverlayPanelView;

    if (activeView === 'settings') {
      options.onApplySettings(cloneAdvancedSettings(pendingAdvancedSettings));

      return;
    }

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
      resetAdvancedDraft();
      resetAdvancedPanel();
    },
    setSimulation(simClass: SimulationClass, values: Record<string, number>) {
      options.simClass = simClass;
      media.dataset.simClass = simClass.id;
      parameterEditor.setSimClass(simClass, values);

      if ((controls.dataset.view as OverlayPanelView) === 'parameters') {
        mediaImage.src = simClass.placeholderImage;
        mediaImage.alt = `${simClass.label} preview`;
        applyView('parameters');
      }
    },
    setTheme(theme: ThemeId) {
      themePicker.setActive(theme);
    },
    setView(view: OverlayPanelView) {
      applyView(view);
      if (view !== 'settings') {
        resetAdvancedPanel();
      }
    },
    setAdvancedSettings(settings: AdvancedSettings) {
      options.advancedSettings = cloneAdvancedSettings(settings);
      pendingAdvancedSettings = cloneAdvancedSettings(settings);
      syncAdvancedControls();
      resetAdvancedPanel();
    },
    setBackVisible,
  };
}

function cloneAdvancedSettings(settings: AdvancedSettings): AdvancedSettings {
  return {
    lockedScaleId: settings.lockedScaleId,
    manifestSource: settings.manifestSource,
    verboseLogging: settings.verboseLogging,
    hiddenScaleIds: [...settings.hiddenScaleIds],
    audioMutedByDefault: settings.audioMutedByDefault,
    defaultAudioVolume: settings.defaultAudioVolume,
  };
}
