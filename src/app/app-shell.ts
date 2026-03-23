/**
 * Application shell.
 *
 * This module owns the assembled UniverseEngine experience after the HTML mount
 * node has been located. It is still fairly large, but moving it out of
 * `src/main.ts` is the first step toward a cleaner app-layer split where boot,
 * orchestration, and domain logic are separated more clearly.
 */

import { SIMULATION_CLASSES, type SimulationClass } from '../data/simulations.ts';
import { applyTheme, getInitialTheme, type ThemeId } from '../components/theme.ts';
import { createViewport } from '../components/viewport.ts';
import { createTimeline } from '../components/timeline.ts';
import { createTelemetryPanel } from '../components/telemetry-panel.ts';
import { createDisplayTerminal } from '../components/display-terminal.ts';
import { createEntryOverlay } from '../components/entry-overlay.ts';
import { createSummaryOverlay } from '../components/summary-overlay.ts';
import {
  createConfigOverlay,
  type ConfigOverlayView,
} from '../components/config-overlay.ts';
import { createInitializingOverlay } from '../components/initializing-overlay.ts';
import { createDisplayMenu } from './display-menu.ts';
import { getInitializationLines } from '../init-text/index.ts';
import {
  findNearestVideo,
  getLocalPlaceholderStats,
  getLocalPlaceholderVideo,
} from '../domain/simulations/placeholder-assets.ts';
import {
  loadLiveStatsCsv,
  sampleLiveStats,
  type LiveStatsFrame,
} from '../domain/live-stats/csv.ts';

type AppMode = 'entry' | 'config' | 'initializing' | 'display';

/**
 * Create and run the full application shell inside the provided mount node.
 *
 * The shell is created once and then manages all subsequent mode switches,
 * simulation changes, overlay visibility, media playback, and telemetry updates.
 *
 * @param app - Root mount node (`#app`).
 * @returns void
 */
export function createAppShell(app: HTMLElement): void {
  // Start on the first simulation class defined in the catalog.
  let activeClass: SimulationClass = SIMULATION_CLASSES[0];

  // Load the user's persisted theme immediately.
  let activeTheme: ThemeId = getInitialTheme();

  // Track whether the display-side terminal viewer is open.
  let isDisplayTerminalOpen = false;

  // Track whether the currently loaded video has reached the end.
  let hasCompletedPlayback = false;

  // Hold the currently loaded live-stat frames for the active simulation/video.
  let activeLiveStatsFrames: LiveStatsFrame[] = [];

  // Keep the viewport hidden until a simulation has successfully initialized.
  let hasCompletedInitialization = false;

  // Persist parameter values per simulation family so users can switch around.
  const valuesByClass = Object.fromEntries(
    SIMULATION_CLASSES.map((simClass) => [simClass.id, createDefaultValues(simClass)]),
  ) as Record<string, Record<string, number>>;

  // Apply the theme before assembling UI so token-based styling is ready.
  applyTheme(activeTheme);

  // Use the active family to choose the initial local placeholder video.
  const initialPlaceholderVideo = getLocalPlaceholderVideo(activeClass.id);

  // Mount the persistent viewport layer first so every overlay can sit above it.
  const viewport = createViewport(app, initialPlaceholderVideo);

  // Build the display HUD container that appears in config/display contexts.
  const displayChrome = document.createElement('div');
  displayChrome.className = 'display-chrome';
  displayChrome.classList.add('is-hidden');
  app.appendChild(displayChrome);

  // Build the burger-menu host in the upper-left corner.
  const topLeft = document.createElement('div');
  topLeft.className = 'display-chrome__top-left';
  displayChrome.appendChild(topLeft);

  // Mount the display menu and delegate actions back into the shell state.
  createDisplayMenu(topLeft, SIMULATION_CLASSES, {
    onSimulationSelected(simClass) {
      handleClassChange(simClass);
      openConfigView('parameters');
    },
    onViewSelected(view) {
      if (view === 'terminal') {
        toggleDisplayTerminal();
        return;
      }

      openConfigView(view);
    },
  });

  // Mount the compact top-right telemetry panel.
  const dataPanelHost = document.createElement('div');
  dataPanelHost.className = 'display-chrome__top-right';
  displayChrome.appendChild(dataPanelHost);
  const dataPanel = createTelemetryPanel(dataPanelHost);

  // Mount the centered display terminal overlay host.
  const displayTerminalHost = document.createElement('div');
  displayTerminalHost.className = 'display-chrome__terminal';
  displayChrome.appendChild(displayTerminalHost);
  const displayTerminal = createDisplayTerminal(displayTerminalHost, {
    onClose: handleCloseTerminal,
  });

  // Mount the decorative center status frame used by tablet/mobile layouts.
  const centerStatus = document.createElement('div');
  centerStatus.className = 'display-chrome__center-status';
  centerStatus.innerHTML = `
    <div class="display-chrome__center-status-inner">
      <p class="display-chrome__center-kicker">Simulation Active</p>
      <h2 class="display-chrome__center-title">DISPLAY_STATE</h2>
      <div class="display-chrome__center-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  displayChrome.appendChild(centerStatus);

  // Mount the timeline footer.
  const timelineHost = document.createElement('div');
  timelineHost.className = 'display-chrome__bottom';
  displayChrome.appendChild(timelineHost);
  const timeline = createTimeline(timelineHost, (position) => {
    viewport.seekToFraction(position);
  });

  // Keep the timeline synchronized to the real media playback position.
  viewport.onTimeUpdate((position) => {
    timeline.setPosition(position);
    refreshDisplayData(position * viewport.getDurationSeconds());
  });

  // Mount the shared overlay layer used by the app's mode transitions.
  const overlayLayer = document.createElement('div');
  overlayLayer.className = 'overlay-layer';
  app.appendChild(overlayLayer);

  // Mount the end-of-run summary overlay.
  const summaryOverlay = createSummaryOverlay(overlayLayer, {
    onReplay: handleReplay,
    onNew: () => openConfigView('parameters'),
    onTerminal: handleOpenTerminalFromSummary,
  });

  // When playback ends, remember that state and show the summary overlay.
  viewport.onEnded(() => {
    hasCompletedPlayback = true;
    summaryOverlay.update(
      activeClass,
      getActiveValues(),
      viewport.getDurationSeconds(),
    );
    summaryOverlay.show();
  });

  // Mount the first-load entry overlay.
  const entryOverlay = createEntryOverlay(overlayLayer, (simClass) => {
    handleClassChange(simClass);
    openConfigView('parameters');
  });

  // Mount the main configuration overlay.
  const configOverlay = createConfigOverlay(overlayLayer, {
    simClass: activeClass,
    values: getActiveValues(),
    theme: activeTheme,
    onValuesChange: handleValuesChange,
    onThemeChange: handleThemeChange,
    onRun: handleRun,
    onApplySettings: handleApplySettings,
    onClose: handleCloseConfig,
    initialView: 'parameters',
  });

  // Mount the initializing terminal overlay.
  const initializingOverlay = createInitializingOverlay(overlayLayer);

  // Prime display-side UI to a known empty state before the first run.
  timeline.setPosition(0);
  refreshDisplayData();
  refreshDisplayTerminal();
  summaryOverlay.hide();

  // Start in entry mode with the media hidden.
  viewport.hideMedia();
  viewport.pause();
  setMode('entry');

  /**
   * Switch to a new simulation family and reset any playback/session state.
   *
   * @param newClass - Newly selected simulation family.
   * @returns void
   */
  function handleClassChange(newClass: SimulationClass): void {
    if (newClass.id === activeClass.id) return;

    activeClass = newClass;
    resetSimulationState();
    configOverlay.setSimulation(activeClass, getActiveValues());
    timeline.setPosition(0);
    refreshDisplayData();
    refreshDisplayTerminal();
  }

  /**
   * Store updated parameter values for the active simulation family.
   *
   * @param values - New parameter map keyed by parameter id.
   * @returns void
   */
  function handleValuesChange(values: Record<string, number>): void {
    valuesByClass[activeClass.id] = { ...values };
    refreshDisplayData();
    refreshDisplayTerminal();
  }

  /**
   * Apply a new theme and keep the overlay picker in sync.
   *
   * @param theme - Theme id to apply.
   * @returns void
   */
  function handleThemeChange(theme: ThemeId): void {
    activeTheme = theme;
    applyTheme(theme);
    configOverlay.setTheme(theme);
  }

  /**
   * Open the configuration overlay to a specific subview.
   *
   * @param view - Which config subview to display.
   * @returns void
   */
  function openConfigView(view: ConfigOverlayView): void {
    isDisplayTerminalOpen = false;
    displayTerminal.hide();
    configOverlay.setView(view);
    setMode('config');
  }

  /**
   * Apply settings without launching a new run.
   *
   * @returns void
   */
  function handleApplySettings(): void {
    if (hasCompletedInitialization) {
      summaryOverlay.hide();
      setMode('display');
      return;
    }

    configOverlay.setView('parameters');
  }

  /**
   * Close config to display when possible, otherwise return to entry.
   *
   * @returns void
   */
  function handleCloseConfig(): void {
    summaryOverlay.hide();
    setMode(hasCompletedInitialization ? 'display' : 'entry');
  }

  /**
   * Toggle the display-side terminal viewer.
   *
   * @returns void
   */
  function toggleDisplayTerminal(): void {
    isDisplayTerminalOpen = displayTerminal.toggle();
    summaryOverlay.hide();
  }

  /**
   * Replay the currently loaded simulation video from the beginning.
   *
   * @returns void
   */
  function handleReplay(): void {
    hasCompletedPlayback = false;
    summaryOverlay.hide();
    viewport.resetPlayback();
    void viewport.play().catch(() => {
      viewport.setMuted(true);
      void viewport.play();
    });
  }

  /**
   * Open the terminal viewer directly from the summary overlay.
   *
   * @returns void
   */
  function handleOpenTerminalFromSummary(): void {
    summaryOverlay.hide();
    isDisplayTerminalOpen = true;
    displayTerminal.show();
  }

  /**
   * When the display terminal closes, restore the summary overlay if playback
   * had already ended.
   *
   * @returns void
   */
  function handleCloseTerminal(): void {
    isDisplayTerminalOpen = false;

    if (hasCompletedPlayback) {
      summaryOverlay.update(
        activeClass,
        getActiveValues(),
        viewport.getDurationSeconds(),
      );
      summaryOverlay.show();
    }
  }

  /**
   * Start a new run for the active simulation class.
   *
   * @returns void
   */
  function handleRun(): void {
    const values = getActiveValues();
    const match = findNearestVideo(
      activeClass.id,
      activeClass.parameters,
      values,
      activeClass.placeholderImage,
    );

    resetSimulationState();
    viewport.setSource(match.url);
    viewport.pause();
    void loadActiveLiveStats();
    viewport.setMuted(false);
    setMode('initializing');

    initializingOverlay.show(getInitializationLines(activeClass), () => {
      hasCompletedInitialization = true;
      viewport.showMedia();
      void viewport.play().catch(() => {
        viewport.setMuted(true);
        void viewport.play().catch(() => {
          // Leave the media paused if the browser still rejects playback.
        });
      });
      setMode('display');
    });
  }

  /**
   * Switch the shell into one of its four high-level UI modes.
   *
   * @param nextMode - Mode to apply.
   * @returns void
   */
  function setMode(nextMode: AppMode): void {
    app.dataset.mode = nextMode;

    const showDisplay = nextMode === 'display' || nextMode === 'config';
    setElementVisibility(displayChrome, showDisplay);

    if (nextMode === 'entry') {
      entryOverlay.show();
    } else {
      entryOverlay.hide();
    }

    if (nextMode === 'config') {
      initializingOverlay.hide();
      configOverlay.setSimulation(activeClass, getActiveValues());
      configOverlay.show();
    } else {
      configOverlay.hide();
    }

    if (nextMode !== 'display') {
      displayTerminal.hide();
    } else if (isDisplayTerminalOpen) {
      displayTerminal.show();
    }

    if (nextMode !== 'display') {
      summaryOverlay.hide();
    } else if (hasCompletedPlayback) {
      summaryOverlay.update(
        activeClass,
        getActiveValues(),
        viewport.getDurationSeconds(),
      );
      summaryOverlay.show();
    }

    if (!hasCompletedInitialization || nextMode === 'initializing') {
      viewport.hideMedia();
      if (nextMode === 'initializing') {
        viewport.pause();
      }
    } else {
      viewport.showMedia();
    }

    if (nextMode !== 'initializing') {
      initializingOverlay.hide();
    }
  }

  /**
   * Refresh the compact top-right telemetry card.
   *
   * @param timeSeconds - Current playback time in seconds.
   * @returns void
   */
  function refreshDisplayData(timeSeconds = 0): void {
    const liveValues = sampleLiveStats(activeLiveStatsFrames, timeSeconds);
    dataPanel.update(activeClass, getActiveValues(), liveValues);
  }

  /**
   * Refresh the display-side terminal placeholder content.
   *
   * @returns void
   */
  function refreshDisplayTerminal(): void {
    displayTerminal.update(activeClass, getActiveValues());
  }

  /**
   * Clear run-specific state so switching families or starting a new run always
   * starts from a clean baseline.
   *
   * @returns void
   */
  function resetSimulationState(): void {
    activeLiveStatsFrames = [];
    hasCompletedPlayback = false;
    isDisplayTerminalOpen = false;
    summaryOverlay.hide();
    displayTerminal.hide();
    viewport.pause();
    viewport.resetPlayback();
    timeline.setPosition(0);
  }

  /**
   * Return a defensive copy of the current parameter state.
   *
   * @returns Parameter map keyed by parameter id.
   */
  function getActiveValues(): Record<string, number> {
    return { ...valuesByClass[activeClass.id] };
  }

  /**
   * Build the initial value map for a simulation family.
   *
   * @param simClass - Simulation family to initialize.
   * @returns Parameter map keyed by parameter id.
   */
  function createDefaultValues(simClass: SimulationClass): Record<string, number> {
    return Object.fromEntries(
      simClass.parameters.map((parameter) => [parameter.id, parameter.defaultValue]),
    );
  }

  /**
   * Load the CSV-driven live stats for the active simulation family.
   *
   * @returns Promise that resolves once loading completes.
   */
  async function loadActiveLiveStats(): Promise<void> {
    try {
      activeLiveStatsFrames = await loadLiveStatsCsv(
        getLocalPlaceholderStats(activeClass.id),
      );
    } catch {
      activeLiveStatsFrames = [];
    }
    refreshDisplayData();
  }

  /**
   * Toggle visibility with both `hidden` and a CSS class.
   *
   * @param element - Element to show/hide.
   * @param isVisible - Whether it should be visible.
   * @returns void
   */
  function setElementVisibility(element: HTMLElement, isVisible: boolean): void {
    element.hidden = !isVisible;
    element.classList.toggle('is-hidden', !isVisible);
  }
}
