/**
 * Application shell.
 *
 * This module owns the assembled UniverseEngine experience after the HTML mount
 * node has been located. It is still fairly large, but moving it out of
 * `src/main.ts` is the first step toward a cleaner app-layer split where boot,
 * orchestration, and domain logic are separated more clearly.
 */

import { SIMULATION_CLASSES, type SimulationClass } from '../selection/simulation-catalog.ts';
import { applyTheme, getInitialTheme, type ThemeId } from '../selection/theme.ts';
import { createViewport } from '../video_player/viewport.ts';
import { createTimeline } from '../video_player/timeline.ts';
import { createTelemetryPanel } from '../live-data/hud.ts';
import { createDisplayTerminal } from '../overlays/display-terminal.ts';
import { createViewSwitcher } from '../video_player/view-switcher.ts';
import { createEntryOverlay } from '../entry/entry-overlay.ts';
import { createSummaryOverlay } from '../summaries/summary-overlay.ts';
import {
  createSelectionOverlay,
  type SelectionOverlayView,
} from '../selection/overlay.ts';
import { createLoadingOverlay } from '../loading/overlay.ts';
import { createDisplayMenu } from './display-menu.ts';
import { getInitializationLines } from '../loading/init-text.ts';
import {
  findNearestVideo,
  getLocalPlaceholderVideo,
  type VideoMatch,
} from '../selection/placeholder-assets.ts';
import {
  loadVideoRunMetadata,
  type VideoRunMetadata,
} from '../selection/video-run-metadata.ts';
import {
  EMPTY_LIVE_STATS_DATASET,
  loadLiveStatsCsv,
  sampleLiveStats,
  type LiveStatsDataset,
} from '../live-data/csv.ts';
import { countDecimals } from '../shared/format.ts';

type AppMode = 'entry' | 'config' | 'initializing' | 'display';

/** Maps each cosmic scale to its default visual theme. */
const SCALE_TO_THEME: Record<string, ThemeId> = {
  galaxy: 'tron',
  planetary: 'matrix',
  cosmos: 'nostromo',
};

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
  // ── State ────────────────────────────────────────────────────────────────
  // Everything the shell needs to track lives here so it's easy to see what's
  // being managed at a glance. We keep these as closure variables rather than
  // a formal state object because the data is all independently scoped.

  // Start on the first simulation class defined in the catalog.
  let activeClass: SimulationClass = SIMULATION_CLASSES[0];

  // Load the user's persisted theme immediately so the UI renders in the right
  // color scheme from the very first frame.
  let activeTheme: ThemeId = getInitialTheme();

  // Track whether the display-side terminal viewer is open so we can restore it
  // when the user comes back to display mode.
  let isDisplayTerminalOpen = false;

  // Track whether the currently loaded video has reached the end — we need this
  // to know if we should re-show the summary overlay after closing the terminal.
  let hasCompletedPlayback = false;

  // Sidecar run metadata for the currently loaded video (wallclock, compute, etc).
  let activeRunMetadata: VideoRunMetadata | null = null;

  // Manifest-backed run selection for the currently loaded simulation.
  let activeRunMatch: VideoMatch | null = null;

  // Persist the user's preferred view per simulation family so switching
  // families and coming back remembers which view they last chose.
  const preferredViewByClass: Record<string, string | undefined> = {};

  // Last-known playback time in seconds; used to refresh HUD after async loads
  // complete (e.g. CSV parsing or YAML fetch).
  let lastPlaybackSeconds = 0;

  // Hold the currently loaded live-stat frames for the active simulation/video.
  let activeLiveStatsFrames: LiveStatsDataset = EMPTY_LIVE_STATS_DATASET;

  // Keep the viewport hidden until a simulation has successfully initialized.
  // This way the video element doesn't flash before the boot sequence finishes.
  let hasCompletedInitialization = false;

  // Persist parameter values per simulation family so users can switch between
  // families without losing their slider positions.
  const valuesByClass = Object.fromEntries(
    SIMULATION_CLASSES.map((simClass) => [simClass.id, createDefaultValues(simClass)]),
  ) as Record<string, Record<string, number>>;

  // ── UI Assembly ──────────────────────────────────────────────────────────
  // Build the full DOM tree top-down. Layers stack: viewport at the bottom,
  // chrome overlays in the middle, modal overlays on top.

  // Apply the theme before assembling UI so token-based styling is ready before
  // any element references a CSS custom property.
  applyTheme(activeTheme);

  // Use the active family to choose the initial local placeholder video.
  const initialPlaceholderVideo = getLocalPlaceholderVideo(activeClass.id);

  // Mount the persistent viewport layer first so every overlay can sit above it.
  // The viewport stays mounted forever — only its source video changes.
  const viewport = createViewport(app, initialPlaceholderVideo);

  // Build the display HUD container that appears in config/display contexts.
  const displayChrome = document.createElement('div');

  displayChrome.className = 'display-chrome';
  displayChrome.classList.add('is-hidden');
  app.appendChild(displayChrome);

  // Mobile-only helper overlay shown when the device is in landscape.
  // We mount it unconditionally; CSS media queries control visibility.
  const orientationOverlay = document.createElement('div');

  orientationOverlay.className = 'orientation-overlay';
  orientationOverlay.innerHTML = `
    <div class="orientation-overlay__card" role="status" aria-live="polite">
      <div class="orientation-overlay__icon" aria-hidden="true"></div>
      <p class="orientation-overlay__title">Please rotate to portrait</p>
      <p class="orientation-overlay__copy">Landscape support is coming soon.</p>
    </div>
  `;
  app.appendChild(orientationOverlay);

  // Persistent SWIFT logo — bottom-right corner for subtle attribution.
  const swiftLogo = document.createElement('div');

  swiftLogo.className = 'swift-logo';
  swiftLogo.innerHTML = `
    <img
      class="swift-logo__image"
      src="assets/credits/swift-logo.png"
      alt="SWIFT"
    />
  `;
  app.appendChild(swiftLogo);

  // Build the burger-menu host in the upper-left corner of the app.
  // Mounted outside displayChrome so it is available on the landing page too.
  const topLeft = document.createElement('div');

  topLeft.className = 'display-chrome__top-left is-hidden';
  app.appendChild(topLeft);

  // Mount the display menu and delegate actions back into the shell state.
  // The menu doesn't know about modes or state — it just fires callbacks.
  createDisplayMenu(topLeft, SIMULATION_CLASSES, {
    onSimulationSelected(simClass) {
      handleClassChange(simClass);
      openSelectionView('parameters');
    },
    onViewSelected(view) {
      if (view === 'terminal') {
        toggleDisplayTerminal();

        return;
      }

      if (view === 'credits') {
        openSelectionView('credits');

        return;
      }

      openSelectionView(view);
    },
  });

  // Left-center slot: the view-switcher that appears when a run has multiple
  // video views available (e.g. dark matter + gas density for cosmos).
  const leftCenter = document.createElement('div');

  leftCenter.className = 'display-chrome__left-center';
  displayChrome.appendChild(leftCenter);
  const viewSwitcher = createViewSwitcher(leftCenter, {
    onSelect(viewId) {
      handleViewSelection(viewId);
    },
  });

  // Mount the compact top-right telemetry panel (the HUD with live stats).
  const dataPanelHost = document.createElement('div');

  dataPanelHost.className = 'display-chrome__top-right';
  displayChrome.appendChild(dataPanelHost);
  const dataPanel = createTelemetryPanel(dataPanelHost);

  // Mount the centered display terminal overlay host. This shows placeholder
  // log lines while the simulation is running.
  const displayTerminalHost = document.createElement('div');

  displayTerminalHost.className = 'display-chrome__terminal';
  displayChrome.appendChild(displayTerminalHost);
  const displayTerminal = createDisplayTerminal(displayTerminalHost, {
    onClose: handleCloseTerminal,
  });

  // Mount the decorative center status frame used by tablet/mobile layouts.
  // This is purely cosmetic — it gives the display mode a bit of visual weight
  // when there's no sidebar to fill the screen.
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

  // ── Playback speed persistence ─────────────────────────────────────────
  const PLAYBACK_SPEED_KEY = 'universe-engine-playback-speed';

  const loadPlaybackSpeed = (): number => {
    const raw = localStorage.getItem(PLAYBACK_SPEED_KEY);
    const parsed = raw ? Number(raw) : NaN;

    // Only accept known rates so hand-edited storage doesn't break the dropdown.
    return [0.25, 0.5, 1].includes(parsed) ? parsed : 1;
  };

  const persistPlaybackSpeed = (rate: number) => {
    localStorage.setItem(PLAYBACK_SPEED_KEY, String(rate));
  };

  const initialPlaybackSpeed = loadPlaybackSpeed();

  // Prime the video element with the persisted speed before the first frame.
  viewport.setPlaybackRate(initialPlaybackSpeed);

  // Mount the timeline scrubber footer.
  const timelineHost = document.createElement('div');

  timelineHost.className = 'display-chrome__bottom';
  displayChrome.appendChild(timelineHost);
  const timeline = createTimeline(timelineHost, {
    onChange(position) {
      viewport.seekToFraction(position);
    },
    onTogglePlay: handleTogglePlay,
    onSpeedChange: handleSpeedChange,
    onScrubStart() {
      stopScrubberLoop();
    },
    onScrubEnd() {
      if (!viewport.isPaused()) {
        startScrubberLoop();
      }
    },
    initialSpeed: initialPlaybackSpeed,
  });

  // Prime the play/pause button from the current video state.
  timeline.setPlaying(!viewport.isPaused());

  // ── Smooth scrubber updates via requestAnimationFrame ──────────────────
  // The video's native `timeupdate` event fires too infrequently (~4 Hz) to
  // drive the slider smoothly. Instead, we poll the video's current time on
  // every animation frame while playback is active, giving a 60-fps visual.
  let scrubberRafId: number | null = null;

  function startScrubberLoop() {
    if (scrubberRafId !== null) return;

    function tick() {
      const fraction = viewport.getPlaybackFraction();

      timeline.setPosition(fraction);

      if (!viewport.isPaused()) {
        scrubberRafId = requestAnimationFrame(tick);
      } else {
        scrubberRafId = null;
      }
    }

    scrubberRafId = requestAnimationFrame(tick);
  }

  function stopScrubberLoop() {
    if (scrubberRafId !== null) {
      cancelAnimationFrame(scrubberRafId);
      scrubberRafId = null;
    }
  }

  // Keep the timeline button in sync and start/stop the smooth scrubber loop.
  viewport.onPlayStateChange((isPaused) => {
    timeline.setPlaying(!isPaused);

    if (isPaused) {
      stopScrubberLoop();
    } else {
      startScrubberLoop();
    }
  });

  // The native `timeupdate` event still drives HUD data refresh — its rate
  // (~4 Hz) is perfectly adequate for live-stat counters and telemetry.
  viewport.onTimeUpdate((position) => {
    lastPlaybackSeconds = position * viewport.getDurationSeconds();
    refreshDisplayData(lastPlaybackSeconds);
  });

  // Mount the shared overlay layer used by the app's mode transitions.
  // Overlays sit above the chrome and block interaction with the viewport.
  const overlayLayer = document.createElement('div');

  overlayLayer.className = 'overlay-layer';
  app.appendChild(overlayLayer);

  // Mount the end-of-run summary overlay that appears when a video finishes.
  const summaryOverlay = createSummaryOverlay(overlayLayer, {
    onReplay: handleReplay,
    onNew: () => openSelectionView('parameters'),
    onTerminal: handleOpenTerminalFromSummary,
  });

  // When playback ends, remember that state and show the summary overlay.
  viewport.onEnded(() => {
    hasCompletedPlayback = true;
    summaryOverlay.update(
      activeClass,
      getActiveValues(),
      viewport.getDurationSeconds(),
      activeRunMetadata,
    );
    summaryOverlay.show();
  });

  // Mount the first-load entry overlay — the very first thing the user sees.
  const entryOverlay = createEntryOverlay(overlayLayer, (simClass) => {
    handleClassChange(simClass);
    openSelectionView('parameters');
  });

  // Mount the main selection overlay — parameters, settings, credits, etc.
  const selectionOverlay = createSelectionOverlay(overlayLayer, {
    simClass: activeClass,
    values: getActiveValues(),
    theme: activeTheme,
    onValuesChange: handleValuesChange,
    onThemeChange: handleThemeChange,
    onRun: () => {
      void handleRun();
    },
    onApplySettings: handleApplySettings,
    onClose: handleCloseConfig,
    initialView: 'parameters',
  });

  // Mount the initializing terminal overlay — the faux-boot sequence.
  const loadingOverlay = createLoadingOverlay(overlayLayer);

  // ── Initial State ────────────────────────────────────────────────────────
  // Prime everything to a clean, empty baseline before the first mode switch.

  timeline.setPosition(0);
  refreshDisplayData();
  refreshDisplayTerminal();
  summaryOverlay.hide();

  // ── Collapsible Left-Side UI ────────────────────────────────────────────
  // Each left-side panel shrinks independently when idle. Hover (mouse) or
  // tap (touch) expands only the hovered/tapped element; after 2.5 seconds
  // of inactivity on that element it collapses back.
  const sideTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

  const expandOne = (el: HTMLElement) => {
    const timer = sideTimers.get(el);

    if (timer) {
      clearTimeout(timer);
      sideTimers.delete(el);
    }

    el.classList.remove('side-collapsed');
  };

  const scheduleCollapseOne = (el: HTMLElement) => {
    const timer = sideTimers.get(el);

    if (timer) clearTimeout(timer);

    sideTimers.set(
      el,
      setTimeout(() => {
        el.classList.add('side-collapsed');
        sideTimers.delete(el);
      }, 2500),
    );
  };

  const collapseOneNow = (el: HTMLElement) => {
    const timer = sideTimers.get(el);

    if (timer) {
      clearTimeout(timer);
      sideTimers.delete(el);
    }

    el.classList.add('side-collapsed');
  };

  for (const el of [topLeft, leftCenter]) {
    el.addEventListener('mouseenter', () => expandOne(el));
    el.addEventListener('mouseleave', () => scheduleCollapseOne(el));
    el.addEventListener('focusin', () => expandOne(el));
    el.addEventListener('focusout', (event) => {
      if (!el.contains(event.relatedTarget as Node)) {
        scheduleCollapseOne(el);
      }
    });
    el.addEventListener('click', () => {
      if (el.classList.contains('side-collapsed')) {
        expandOne(el);
        scheduleCollapseOne(el);
      } else {
        collapseOneNow(el);
      }
    });

    // Start collapsed.
    collapseOneNow(el);
  }

  // Start in entry mode with the media hidden and paused.
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
    // If the user picks the family they're already on, skip the reset entirely.
    if (newClass.id === activeClass.id) return;

    activeClass = newClass;
    resetSimulationState();
    // Apply the scale's signature theme.
    handleThemeChange(SCALE_TO_THEME[newClass.id]);
    // Rebuild the config overlay so the parameters match the new family.
    selectionOverlay.setSimulation(activeClass, getActiveValues());
    timeline.setPosition(0);
    refreshDisplayData();
    refreshDisplayTerminal();
    refreshViewSwitcher();
  }

  /**
   * Store updated parameter values for the active simulation family.
   *
   * @param values - New parameter map keyed by parameter id.
   * @returns void
   */
  function handleValuesChange(values: Record<string, number>): void {
    // Take a defensive copy so the caller can't mutate our internal state.
    valuesByClass[activeClass.id] = { ...values };
    // The HUD and terminal show parameter values, so refresh them immediately.
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
    selectionOverlay.setTheme(theme);
  }

  /**
   * Open the configuration overlay to a specific subview.
   *
   * @param view - Which config subview to display.
   * @returns void
   */
  function openSelectionView(view: SelectionOverlayView): void {
    // Close the display terminal first — it's a separate concern from config.
    isDisplayTerminalOpen = false;
    displayTerminal.hide();
    selectionOverlay.setView(view);
    setMode('config');
  }

  /**
   * Apply settings without launching a new run.
   *
   * @returns void
   */
  function handleApplySettings(): void {
    // If we've already initialized a run, just go back to display mode.
    if (hasCompletedInitialization) {
      summaryOverlay.hide();
      setMode('display');

      return;
    }

    // Otherwise keep showing the parameter view so the user can start a run.
    selectionOverlay.setView('parameters');
  }

  /**
   * Close config to display when possible, otherwise return to entry.
   *
   * @returns void
   */
  function handleCloseConfig(): void {
    summaryOverlay.hide();
    // If we've been through init at least once, going back to display makes
    // sense. Otherwise the video hasn't loaded yet — send them to entry.
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
    // Browsers often require a user gesture to play audio. If the initial play
    // fails, fall back to muted playback so the video still works.
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
   * had already ended — we don't want the terminal to swallow the summary.
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
        activeRunMetadata,
      );
      summaryOverlay.show();
    }
  }

  /**
   * Toggle play/pause from the timeline control bar.
   *
   * @returns void
   */
  function handleTogglePlay(): void {
    if (viewport.isPaused()) {
      void viewport.play().catch(() => {
        viewport.setMuted(true);
        void viewport.play();
      });
    } else {
      viewport.pause();
    }
  }

  /**
   * Change the video playback rate and persist the choice.
   *
   * @param rate - New playback rate (0.25, 0.5, or 1).
   * @returns void
   */
  function handleSpeedChange(rate: number): void {
    viewport.setPlaybackRate(rate);
    persistPlaybackSpeed(rate);
    timeline.setSpeed(rate);
  }

  /**
   * Start a new run for the active simulation class.
   *
   * The flow: find the nearest matching video in the manifest → load its live
   * stats and metadata → show the boot sequence → reveal the viewport → play.
   *
   * @returns void
   */
  async function handleRun(): Promise<void> {
    const values = getActiveValues();
    // Query the manifest for the best-matching precomputed video asset.
    const match = await findNearestVideo(
      activeClass.id,
      activeClass.parameters,
      values,
    );

    resetSimulationState();
    activeRunMatch = match;
    // Resolve which view (dark matter, gas density, etc.) to show first.
    const selectedViewId = resolveSelectedViewId(activeClass, match);
    const selectedViewUrl = getViewUrl(match, selectedViewId) ?? match.url;

    viewport.setSource(selectedViewUrl);
    viewport.pause();
    // Fire-and-forget the async data loads — they'll update the HUD when done.
    void loadActiveLiveStats(match.liveDataUrl);
    void loadActiveRunMetadata(match.summaryUrl);
    viewport.setMuted(false);
    refreshViewSwitcher(selectedViewId);
    setMode('initializing');

    // Kick off the terminal boot sequence. When it finishes, reveal the video
    // and try to play it. If autoplay is blocked, fall back to muted.
    loadingOverlay.show(getInitializationLines(activeClass), () => {
      hasCompletedInitialization = true;
      viewport.showMedia();
      void viewport.play().catch(() => {
        viewport.setMuted(true);
        void viewport.play().catch(() => {
          // Leave the media paused if the browser still rejects playback.
          // This is expected on some mobile browsers without a user gesture.
        });
      });
      setMode('display');
    });
  }

  /**
   * Switch the shell into one of its four high-level UI modes.
   *
   * Each mode shows/hides the right combination of overlays, chrome chrome, and
   * viewport. The important invariant is that exactly the right set of elements
   * is visible at the end — no more, no less.
   *
   * @param nextMode - Mode to apply.
   * @returns void
   */
  function setMode(nextMode: AppMode): void {
    // Set a data attribute on the app root so CSS can react to mode changes.
    app.dataset.mode = nextMode;

    // The landing page uses the neutral glass theme. All other modes use the
    // active scale-specific theme (set when the user picks a simulation class).
    if (nextMode === 'entry') {
      document.documentElement.setAttribute('data-theme', 'glass');
    } else if (nextMode === 'display') {
      applyTheme(activeTheme);
    }

    // Display chrome is shared between display and config modes.
    const showDisplay = nextMode === 'display' || nextMode === 'config';

    setElementVisibility(displayChrome, showDisplay);
    setElementVisibility(swiftLogo, nextMode === 'display');

    // Burger menu: visible on landing page and display, hidden during loading
    // and config (config already hides it via the CSS mode selector).
    setElementVisibility(topLeft, nextMode === 'entry' || nextMode === 'display');

    // Entry overlay: shown only in entry mode, hidden everywhere else.
    if (nextMode === 'entry') {
      entryOverlay.show();
    } else {
      entryOverlay.hide();
    }

    // Config overlay: only shown when we're explicitly in config mode.
    if (nextMode === 'config') {
      loadingOverlay.hide();
      selectionOverlay.setSimulation(activeClass, getActiveValues());
      selectionOverlay.show();
    } else {
      selectionOverlay.hide();
    }

    // Display terminal: hidden outside display mode, but restored if the user
    // had it open before leaving display mode.
    if (nextMode !== 'display') {
      displayTerminal.hide();
    } else if (isDisplayTerminalOpen) {
      displayTerminal.show();
    }

    // Summary overlay: hidden outside display mode, but re-shown if playback
    // had already completed when the user left and came back.
    if (nextMode !== 'display') {
      summaryOverlay.hide();
    } else if (hasCompletedPlayback) {
      summaryOverlay.update(
        activeClass,
        getActiveValues(),
        viewport.getDurationSeconds(),
        activeRunMetadata,
      );
      summaryOverlay.show();
    }

    // Viewport visibility: hidden before init and during the boot sequence.
    if (!hasCompletedInitialization || nextMode === 'initializing') {
      viewport.hideMedia();
      if (nextMode === 'initializing') {
        viewport.pause();
      }
    } else {
      viewport.showMedia();
    }

    // Initializing overlay: only shown during the boot sequence.
    if (nextMode !== 'initializing') {
      loadingOverlay.hide();
    }
  }

  /**
   * Refresh the compact top-right telemetry card.
   *
   * @param timeSeconds - Current playback time in seconds.
   * @returns void
   */
  function refreshDisplayData(timeSeconds = 0): void {
    const sampledValues = sampleLiveStats(
      activeLiveStatsFrames,
      timeSeconds,
      viewport.getDurationSeconds(),
    );
    const videoScaledValues = buildVideoScaledStats(
      activeClass,
      activeRunMetadata,
      timeSeconds,
      viewport.getDurationSeconds(),
    );

    dataPanel.update(activeClass, getActiveValues(), {
      ...sampledValues,
      ...videoScaledValues,
    });
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
   * Refresh the display-side video-view switcher.
   *
   * @param selectedId - Optional selected view override.
   * @returns void
   */
  function refreshViewSwitcher(selectedId?: string): void {
    const configuredViews = activeClass.views.filter(
      (view) => activeRunMatch?.views?.[view.id] !== undefined,
    );

    if (configuredViews.length <= 1) {
      viewSwitcher.hide();

      return;
    }

    viewSwitcher.update(
      configuredViews,
      selectedId ?? resolveSelectedViewId(activeClass, activeRunMatch),
    );
  }

  /**
   * Clear run-specific state so switching families or starting a new run always
   * starts from a clean baseline.
   *
   * @returns void
   */
  function resetSimulationState(): void {
    activeLiveStatsFrames = EMPTY_LIVE_STATS_DATASET;
    hasCompletedPlayback = false;
    isDisplayTerminalOpen = false;
    activeRunMetadata = null;
    activeRunMatch = null;
    lastPlaybackSeconds = 0;
    summaryOverlay.hide();
    displayTerminal.hide();
    viewSwitcher.hide();
    viewport.pause();
    viewport.resetPlayback();
    timeline.setPosition(0);
  }

  /**
   * Switch to a different view for the active run while preserving playback progress.
   *
   * Views are alternate video renderings of the same simulation run (e.g. dark
   * matter vs. gas density). Switching views should feel seamless — we preserve
   * the current seek position and autoplay state.
   *
   * @param viewId - Manifest/YAML view id.
   * @returns void
   */
  function handleViewSelection(viewId: string): void {
    // Guard: no views configured, or already on this view.
    if (!activeRunMatch?.views) {
      return;
    }

    if (viewId === resolveSelectedViewId(activeClass, activeRunMatch)) {
      return;
    }

    const nextUrl = activeRunMatch.views[viewId];

    if (!nextUrl) {
      return;
    }

    // Remember the user's preference for this simulation family.
    preferredViewByClass[activeClass.id] = viewId;
    activeRunMatch.viewId = viewId;

    // Determine whether the video was playing before the switch.
    const shouldAutoplay = !viewport.isPaused() && !hasCompletedPlayback;
    // Seek to the same fraction unless playback already finished.
    const seekFraction = hasCompletedPlayback ? 0 : viewport.getPlaybackFraction();

    hasCompletedPlayback = false;
    summaryOverlay.hide();
    viewport.setSource(nextUrl, {
      seekFraction,
      autoplay: shouldAutoplay,
    });
    refreshViewSwitcher(viewId);
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
      simClass.parameters.map((parameter) => [
        parameter.id,
        randomizeParameterValue(parameter),
      ]),
    );
  }

  /**
   * Pick a random slider value aligned to the configured parameter step.
   *
   * Rather than always defaulting to min or midpoint, we randomize the initial
   * parameter position so the entry experience feels different each time and
   * users explore more of the parameter space.
   *
   * @param parameter - Parameter schema.
   * @returns Randomized initial value.
   */
  function randomizeParameterValue(
    parameter: SimulationClass['parameters'][number],
  ): number {
    // Figure out how many discrete steps the slider has.
    const steps = Math.max(
      0,
      Math.round((parameter.max - parameter.min) / parameter.step),
    );
    // Pick a random step index — uniform across the full range.
    const stepIndex = Math.floor(Math.random() * (steps + 1));
    // Convert back to an actual numeric value.
    const value = parameter.min + stepIndex * parameter.step;
    // Round to the parameter's step precision to avoid floating-point artifacts.
    const decimals = countDecimals(parameter.step);

    return Number(value.toFixed(decimals));
  }

  /**
   * Load the CSV-driven live stats for the active simulation family.
   *
   * @returns Promise that resolves once loading completes.
   */
  async function loadActiveLiveStats(url: string): Promise<void> {
    try {
      activeLiveStatsFrames = await loadLiveStatsCsv(url);
    } catch {
      activeLiveStatsFrames = EMPTY_LIVE_STATS_DATASET;
    }

    refreshDisplayData();
  }

  /**
   * Load the sidecar run metadata for the active video.
   *
   * @param summaryUrl - URL of the currently selected run summary YAML.
   * @returns Promise that resolves once loading completes.
   */
  async function loadActiveRunMetadata(summaryUrl: string): Promise<void> {
    activeRunMetadata = await loadVideoRunMetadata(summaryUrl);
    refreshDisplayData(lastPlaybackSeconds);
  }

  /**
   * Build derived "live" stats that scale a final value linearly with time.
   *
   * For stats flagged with `fromVideo` and `scaleWithTime`, we take the total
   * value from the run's sidecar metadata and linearly interpolate it based on
   * current playback progress. This gives the illusion of a live counter that
   * steadily climbs toward the final total.
   *
   * Example: if a run used 1200 compute units total and we're 50% through,
   * we'd show ~600 units.
   *
   * @param simClass - Active simulation family.
   * @param runMetadata - Parsed run metadata from the active video.
   * @param timeSeconds - Current playback time.
   * @param durationSeconds - Full video duration.
   * @returns Live-value map keyed by stat id.
   */
  function buildVideoScaledStats(
    simClass: SimulationClass,
    runMetadata: VideoRunMetadata | null,
    timeSeconds: number,
    durationSeconds: number,
  ): Record<string, string> {
    // Without metadata or a known duration, there's nothing to scale.
    if (!runMetadata || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return {};
    }

    // Clamp the playback fraction — we don't want >100% values on overshoot.
    const fraction = Math.max(0, Math.min(1, timeSeconds / durationSeconds));
    const output: Record<string, string> = {};

    // Walk the configured live stats and scale any that are marked for it.
    for (const stat of simClass.metadata.liveStats) {
      // Only scale stats that are explicitly tagged for this behavior.
      if (!stat.live || !stat.fromVideo || !stat.scaleWithTime) {
        continue;
      }

      // Look up the final value from the metadata using the configured key.
      const key = stat.videoKey ?? stat.id;
      const rawValue = (runMetadata as unknown as Record<string, unknown>)[key];

      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        continue;
      }

      // Linearly interpolate: fraction × total = current.
      const scaled = rawValue * fraction;

      output[stat.id] = stat.integer ? String(Math.floor(scaled)) : String(scaled);
    }

    return output;
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

  /**
   * Resolve the preferred or default view id for the active simulation.
   *
   * Priority order: user's saved preference → manifest's default view → the
   * first view in the manifest's views object. This ensures the switcher always
   * has a valid starting selection.
   *
   * @param simClass - Simulation family.
   * @param match - Active manifest-backed run.
   * @returns View id when available.
   */
  function resolveSelectedViewId(
    simClass: SimulationClass,
    match: VideoMatch | null,
  ): string | undefined {
    // No views configured? Just return whatever the match has.
    if (!match?.views) {
      return match?.viewId;
    }

    // Check for a user preference saved from a previous selection.
    const preferred = preferredViewByClass[simClass.id];

    if (preferred && match.views[preferred]) {
      return preferred;
    }

    // Fall back to the manifest's default, or the first view alphabetically.
    return match.viewId ?? Object.keys(match.views)[0];
  }

  /**
   * Resolve one concrete video URL for a matched run and view id.
   *
   * @param match - Active run match.
   * @param viewId - Desired view id.
   * @returns Video URL or `null` when unavailable.
   */
  function getViewUrl(match: VideoMatch, viewId?: string): string | null {
    if (!viewId || !match.views) {
      return null;
    }

    return match.views[viewId] ?? null;
  }
}
