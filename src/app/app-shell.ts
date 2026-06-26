/**
 * Application shell.
 *
 * This module owns the assembled UniverseEngine experience after the HTML mount
 * node has been located. It is still fairly large, but moving it out of
 * `src/main.ts` is the first step toward a cleaner app-layer split where boot,
 * orchestration, and domain logic are separated more clearly.
 */

import {
  SIMULATION_CLASSES,
  type SimulationClass,
} from '../selection/simulation-catalog.ts';
import { applyTheme, getInitialTheme, type ThemeId } from '../selection/theme.ts';
import { createViewport } from '../video_player/viewport.ts';
import { createTimeline } from '../video_player/timeline.ts';
import { createTelemetryPanel } from '../live-data/hud.ts';
import { createEntryOverlay } from '../entry/entry-overlay.ts';
import { createSummaryOverlay } from '../summaries/summary-overlay.ts';
import { createViewSwitcher } from '../video_player/view-switcher.ts';
import {
  createOverlayPanel,
  type OverlayPanelView,
} from '../selection/overlay-panel.ts';
import { createLoadingOverlay } from '../loading/overlay.ts';
import { createDisplayMenu } from './display-menu.ts';
import {
  loadPlaybackSpeed,
  persistPlaybackSpeed,
  playViewportWithMutedFallback,
} from './playback.ts';
import { createRunRequestController } from './run-requests.ts';
import { getInitializationLines } from '../loading/init-text.ts';
import {
  createManifestController,
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
import { withBaseUrl } from '../shared/urls.ts';
import { INITIALIZATION } from '../shared/constants.ts';
import {
  getVisibleScaleIds,
  loadAdvancedSettings,
  saveAdvancedSettings,
  type AdvancedSettings,
} from '../shared/advanced-settings.ts';
import {
  logInfo,
  logWarn,
  setVerboseLoggingEnabled,
} from '../shared/logger.ts';
import {
  fetchWithOnlineAssetFallback,
  getAssetHostInfo,
  resolveOnlineAssetUrl,
} from '../shared/online-assets.ts';
import { trackRunSelection } from '../shared/track-run.ts';

type AppMode = 'entry' | 'config' | 'initializing' | 'display';

interface PreparedVideoSource {
  src: string;
  ownedObjectUrl: boolean;
  shouldWaitForBuffer: boolean;
}

const ACTIVE_VIDEO_FULL_FETCH_MAX_BYTES = 50 * 1024 * 1024;
const ACTIVE_VIDEO_BUFFER_SECONDS = 8;
const ACTIVE_VIDEO_BUFFER_WAIT_MS = 6000;
const ACTIVE_VIDEO_LOADED_DATA_WAIT_MS = 8000;
const LOCAL_MANIFEST_MIN_TERMINAL_TIME_MAX_MS = 5000;
const ALTERNATE_PREWARM_RESUME_DELAY_MS = 1200;
const SCRUB_HUD_UPDATE_INTERVAL_MS = 100;

/** Maps each cosmic scale to its default visual theme. */
const SCALE_TO_THEME: Record<string, ThemeId> = {
  galaxy: 'tron',
  planetary: 'matrix',
  cosmos: 'hal',
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
  const scaleIds = SIMULATION_CLASSES.map((simClass) => simClass.id);
  let advancedSettings = loadAdvancedSettings(scaleIds);
  let availableSimulationClasses = getSelectableSimulationClasses(advancedSettings);
  const manifestController = createManifestController(advancedSettings.manifestSource);
  const runRequests = createRunRequestController();

  setVerboseLoggingEnabled(advancedSettings.verboseLogging);

  if (advancedSettings.manifestSource === 'online') {
    void manifestController.preloadActiveManifest();
  }
  // ── State ────────────────────────────────────────────────────────────────
  // Everything the shell needs to track lives here so it's easy to see what's
  // being managed at a glance. We keep these as closure variables rather than
  // a formal state object because the data is all independently scoped.

  // Start on the first simulation class defined in the catalog.
  let activeClass: SimulationClass =
    getSimulationClassById(advancedSettings.lockedScaleId) ??
    availableSimulationClasses[0] ??
    SIMULATION_CLASSES[0];

  // Load the user's persisted theme immediately so the UI renders in the right
  // color scheme from the very first frame.
  let activeTheme: ThemeId = advancedSettings.lockedScaleId
    ? SCALE_TO_THEME[activeClass.id]
    : getInitialTheme();

  // Track whether the currently loaded video has reached the end — we need this
  // to know if we should re-show the summary overlay.
  let hasCompletedPlayback = false;

  // Sidecar run metadata for the currently loaded video (wallclock, compute, etc).
  let activeRunMetadata: VideoRunMetadata | null = null;

  // Optional per-run audio track used by audio-capable views.
  let activeAudioUrl: string | null = null;
  let activeAudioAvailable = false;
  let audioMuted = advancedSettings.audioMutedByDefault;
  let audioVolume = advancedSettings.defaultAudioVolume;
  let audioProbeNonce = 0;

  // Manifest-backed run selection for the currently loaded simulation.
  let activeRunMatch: VideoMatch | null = null;

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
    SIMULATION_CLASSES.map((simClass) => [
      simClass.id,
      createRandomizedValues(simClass),
    ]),
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
  const runAudio = document.createElement('audio');

  runAudio.preload = 'auto';
  runAudio.hidden = true;
  runAudio.setAttribute('playsinline', 'true');
  runAudio.muted = audioMuted;
  runAudio.volume = audioVolume;
  app.appendChild(runAudio);

  // Build the display HUD container that appears in config/display contexts.
  const displayChrome = document.createElement('div');

  displayChrome.className = 'display-chrome';
  displayChrome.classList.add('is-hidden');
  app.appendChild(displayChrome);

  // Mobile-only helper overlay shown when the device is in portrait.

  const orientationOverlay = document.createElement('div');

  orientationOverlay.className = 'orientation-overlay';
  orientationOverlay.innerHTML = `
    <div class="orientation-overlay__card" role="status" aria-live="polite">
      <div class="orientation-overlay__icon" aria-hidden="true"></div>
      <p class="orientation-overlay__title">Please rotate to landscape</p>
      <p class="orientation-overlay__copy">Portrait mode is not supported.</p>
    </div>
  `;
  app.appendChild(orientationOverlay);

  // Persistent SWIFT logo — bottom-right corner for subtle attribution.
  const swiftLogo = document.createElement('div');

  swiftLogo.className = 'swift-logo';
  swiftLogo.innerHTML = `
    <img
      class="swift-logo__image"
      src="${withBaseUrl('assets/credits/swift-logo.webp')}"
      alt="SWIFT"
      width="478"
      height="169"
      decoding="async"
    />
  `;
  app.appendChild(swiftLogo);

  // Synthesizer logo – shown only for the galaxy family's HST tab.
  const synthLogo = document.createElement('div');

  synthLogo.className = 'synth-logo is-hidden';
  synthLogo.innerHTML = `
    <img
      class="synth-logo__image"
      src="${withBaseUrl('assets/credits/synthesizer_banner.webp')}"
      alt="Synthesizer"
      decoding="async"
    />
  `;
  app.appendChild(synthLogo);

  const partnerLogo = document.createElement('img');

  partnerLogo.className = 'app-partner-logo';
  partnerLogo.src = withBaseUrl('assets/dirac-hpc-white.webp');
  partnerLogo.alt = 'DIRAC HPC';
  partnerLogo.decoding = 'async';
  app.appendChild(partnerLogo);

  // Build the burger-menu host in the upper-left corner of the app.
  // Mounted outside displayChrome so it is available on the landing page too.
  const topLeft = document.createElement('div');

  topLeft.className = 'display-chrome__top-left is-hidden';
  app.appendChild(topLeft);

  // Mount the display menu and delegate actions back into the shell state.
  // The menu doesn't know about modes or state — it just fires callbacks.
  const displayMenu = createDisplayMenu(topLeft, {
    onHome() {
      handleHome();
    },
    onViewSelected(view) {
      if (view === 'credits') {
        openConfigPanel('credits');

        return;
      }

      openConfigPanel(view);
    },
    showHome: !advancedSettings.lockedScaleId,
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
    onInfo(_viewId, label, description) {
      infoOverlayTitle.textContent = label;
      infoOverlayText.textContent = description;
      infoOverlay.classList.add('is-visible');
    },
  });

  const infoOverlay = document.createElement('div');

  infoOverlay.className = 'view-info-overlay';
  infoOverlay.innerHTML = `
    <div class="view-info-overlay__card">
      <button class="view-info-overlay__close" type="button" aria-label="Close">&times;</button>
      <h3 class="view-info-overlay__title"></h3>
      <p class="view-info-overlay__text"></p>
    </div>
  `;
  app.appendChild(infoOverlay);

  const infoOverlayTitle = infoOverlay.querySelector('.view-info-overlay__title')!;
  const infoOverlayText = infoOverlay.querySelector('.view-info-overlay__text')!;
  const infoOverlayClose = infoOverlay.querySelector('.view-info-overlay__close')!;

  infoOverlay.addEventListener('click', (event) => {
    if (event.target === infoOverlay) {
      infoOverlay.classList.remove('is-visible');
    }
  });

  infoOverlayClose.addEventListener('click', () => {
    infoOverlay.classList.remove('is-visible');
  });

  // Viewport title — shows the current tab name centered at the top of the
  // video area when multiple views are available.
  const viewportTitle = document.createElement('div');

  viewportTitle.className = 'display-chrome__top-center is-hidden';
  displayChrome.appendChild(viewportTitle);

  // Mount the compact top-right telemetry panel (the HUD with live stats).
  const dataPanelHost = document.createElement('div');

  dataPanelHost.className = 'display-chrome__top-right';
  displayChrome.appendChild(dataPanelHost);
  const dataPanel = createTelemetryPanel(dataPanelHost);

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

  const initialPlaybackSpeed = loadPlaybackSpeed();

  // Prime the video element with the persisted speed before the first frame.
  viewport.setPlaybackRate(initialPlaybackSpeed);

  // Mount the timeline scrubber footer.
  const timelineHost = document.createElement('div');

  timelineHost.className = 'display-chrome__bottom';
  displayChrome.appendChild(timelineHost);
  const timeline = createTimeline(timelineHost, {
    onChange(position) {
      scheduleViewportSeek(position);
    },
    onTogglePlay: handleTogglePlay,
    onAudioToggle: handleAudioToggle,
    onSpeedChange: handleSpeedChange,
    onSummaryClick: handleShowSummary,
    onScrubStart() {
      handleScrubStart();
      stopScrubberLoop();
    },
    onScrubEnd() {
      handleScrubEnd();
      if (!viewport.isPaused()) {
        startScrubberLoop();
      }
    },
    initialSpeed: initialPlaybackSpeed,
  });

  // Prime the play/pause button from the current video state.
  timeline.setPlaying(!viewport.isPaused());
  timeline.setAudioVisible(false);
  timeline.setMuted(audioMuted);

  runAudio.addEventListener('loadedmetadata', () => {
    syncAudioToViewport(true);
    syncRunAudioPlayback();
  });

  // ── Smooth scrubber updates via requestAnimationFrame ──────────────────
  // The video's native `timeupdate` event fires too infrequently (~4 Hz) to
  // drive the slider smoothly. Instead, we poll the video's current time on
  // every animation frame while playback is active, giving a 60-fps visual.
  let scrubberRafId: number | null = null;
  let pendingSeekFraction: number | null = null;
  let scheduledSeekRafId: number | null = null;
  let isPointerScrubbing = false;
  let alternatePrewarmResumeTimer: number | null = null;
  let lastScrubHudUpdateAt = 0;

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

  function scheduleViewportSeek(fraction: number): void {
    pendingSeekFraction = fraction;

    if (scheduledSeekRafId !== null) {
      return;
    }

    scheduledSeekRafId = requestAnimationFrame(() => {
      scheduledSeekRafId = null;

      if (pendingSeekFraction === null) {
        return;
      }

      const fractionToSeek = pendingSeekFraction;

      pendingSeekFraction = null;
      viewport.seekToFraction(fractionToSeek);
      syncAudioToViewport(true);
    });
  }

  function flushScheduledViewportSeek(): void {
    if (pendingSeekFraction === null) {
      return;
    }

    if (scheduledSeekRafId !== null) {
      cancelAnimationFrame(scheduledSeekRafId);
      scheduledSeekRafId = null;
    }

    const fractionToSeek = pendingSeekFraction;

    pendingSeekFraction = null;
    viewport.seekToFraction(fractionToSeek);
    syncAudioToViewport(true);
  }

  function clearAlternatePrewarmResumeTimer(): void {
    if (alternatePrewarmResumeTimer !== null) {
      window.clearTimeout(alternatePrewarmResumeTimer);
      alternatePrewarmResumeTimer = null;
    }
  }

  function getAlternateViewUrls(): string[] {
    if (!activeRunMatch?.views) {
      return [];
    }

    const selectedViewId = resolveSelectedViewId(activeClass, activeRunMatch);

    return Object.entries(activeRunMatch.views)
      .filter(([viewId]) => viewId !== selectedViewId)
      .map(([, url]) => resolveOnlineAssetUrl(url))
      .filter(Boolean);
  }

  function suspendAlternatePrewarming(): void {
    clearAlternatePrewarmResumeTimer();
    viewport.suspendPrewarming();
  }

  function scheduleAlternatePrewarmingResume(
    delayMs = ALTERNATE_PREWARM_RESUME_DELAY_MS,
  ): void {
    clearAlternatePrewarmResumeTimer();

    if (isPointerScrubbing || viewport.isPaused()) {
      return;
    }

    alternatePrewarmResumeTimer = window.setTimeout(
      () => {
        alternatePrewarmResumeTimer = null;

        if (isPointerScrubbing || viewport.isPaused()) {
          return;
        }

        viewport.resumePrewarming();
        viewport.prewarmSources(getAlternateViewUrls());
      },
      Math.max(0, delayMs),
    );
  }

  function handleScrubStart(): void {
    isPointerScrubbing = true;
    lastScrubHudUpdateAt = 0;
    suspendAlternatePrewarming();
    syncRunAudioPlayback();
  }

  function handleScrubEnd(): void {
    isPointerScrubbing = false;
    lastScrubHudUpdateAt = 0;
    flushScheduledViewportSeek();
    lastPlaybackSeconds =
      viewport.getPlaybackFraction() * viewport.getDurationSeconds();
    refreshDisplayData(lastPlaybackSeconds);
    scheduleAlternatePrewarmingResume();
    syncRunAudioPlayback();
  }

  // Keep the timeline button in sync and start/stop the smooth scrubber loop.
  viewport.onPlayStateChange((isPaused) => {
    timeline.setPlaying(!isPaused);

    if (isPaused) {
      stopScrubberLoop();
      suspendAlternatePrewarming();
    } else {
      startScrubberLoop();
      scheduleAlternatePrewarmingResume(0);
    }

    syncRunAudioPlayback();
  });

  // The native `timeupdate` event still drives HUD data refresh — its rate
  // (~4 Hz) is perfectly adequate for live-stat counters and telemetry.
  viewport.onTimeUpdate((position) => {
    lastPlaybackSeconds = position * viewport.getDurationSeconds();

    if (isPointerScrubbing) {
      const now = performance.now();

      if (now - lastScrubHudUpdateAt < SCRUB_HUD_UPDATE_INTERVAL_MS) {
        return;
      }

      lastScrubHudUpdateAt = now;
    }

    refreshDisplayData(lastPlaybackSeconds);
    syncAudioToViewport();
  });

  // Mount the shared overlay layer used by the app's mode transitions.
  // Overlays sit above the chrome and block interaction with the viewport.
  const overlayLayer = document.createElement('div');

  overlayLayer.className = 'overlay-layer';
  app.appendChild(overlayLayer);

  // Mount the end-of-run summary overlay that appears when a video finishes.
  const summaryOverlay = createSummaryOverlay(overlayLayer, {
    onReplay: handleReplay,
    onParameters: () => openConfigPanel('parameters'),
    onHome: handleHome,
    showHome: !advancedSettings.lockedScaleId,
  });

  // When playback ends, remember that state and show the summary overlay.
  viewport.onEnded(() => {
    hasCompletedPlayback = true;
    const thumbnail = viewport.captureFrame();

    summaryOverlay.update(
      activeClass,
      getActiveValues(),
      viewport.getDurationSeconds(),
      activeRunMetadata,
      thumbnail,
    );
    summaryOverlay.show();
    syncRunAudioPlayback();
  });

  // Mount the first-load entry overlay — the very first thing the user sees.
  const entryOverlay = createEntryOverlay(
    overlayLayer,
    availableSimulationClasses,
    (simClass) => {
      handleClassChange(simClass);
      openConfigPanel('parameters');
    },
  );

  // Mount the main selection overlay — parameters, settings, credits, etc.
  const overlayPanel = createOverlayPanel(overlayLayer, {
    simClass: activeClass,
    values: getActiveValues(),
    theme: activeTheme,
    advancedSettings,
    availableScales: SIMULATION_CLASSES,
    onValuesChange: handleValuesChange,
    onThemeChange: handleThemeChange,
    onRun: () => {
      logInfo('Parameters submitted — starting run', {
        simClassId: activeClass.id,
      });
      void handleRun().catch((error) => {
        logWarn('Run failed to start', {
          simClassId: activeClass.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
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

  const bindCollapsibleChrome = (
    el: HTMLElement,
    options: { toggleOnClick: boolean; isCollapsible?: () => boolean },
  ) => {
    const isCollapsible = options.isCollapsible ?? (() => true);

    // The same behavior powers three different chrome elements, so we make the
    // collapsible-ness itself injectable. That lets entry mode keep the burger
    // permanently expanded without duplicating the rest of the hover/focus logic.
    el.addEventListener('mouseenter', () => expandOne(el));
    el.addEventListener('mouseleave', () => {
      if (!isCollapsible()) {
        expandOne(el);

        return;
      }

      scheduleCollapseOne(el);
    });
    el.addEventListener('focusin', () => expandOne(el));
    el.addEventListener('focusout', (event) => {
      if (!el.contains(event.relatedTarget as Node)) {
        if (!isCollapsible()) {
          expandOne(el);

          return;
        }

        scheduleCollapseOne(el);
      }
    });
    el.addEventListener('click', () => {
      if (!isCollapsible()) {
        expandOne(el);

        return;
      }

      if (el.classList.contains('side-collapsed')) {
        expandOne(el);
        scheduleCollapseOne(el);

        return;
      }

      if (options.toggleOnClick) {
        collapseOneNow(el);
      } else {
        scheduleCollapseOne(el);
      }
    });

    if (isCollapsible()) {
      // Non-entry chrome starts compact so the viewport stays visually quiet
      // until the visitor intentionally interacts with that control.
      collapseOneNow(el);
    } else {
      // Entry mode is the exception: the landing page should advertise the menu
      // rather than hide it behind a shrunk affordance.
      expandOne(el);
    }
  };

  bindCollapsibleChrome(topLeft, {
    toggleOnClick: true,
    isCollapsible: () => app.dataset.mode !== 'entry',
  });
  bindCollapsibleChrome(leftCenter, { toggleOnClick: true });
  bindCollapsibleChrome(timelineHost, { toggleOnClick: false });

  // ── Keyboard controls ──────────────────────────────────────────────────
  let scrubDirection = 0;
  let scrubRaf: number | null = null;
  let scrubFraction = 0;

  const stopScrubbing = () => {
    if (scrubRaf !== null) {
      cancelAnimationFrame(scrubRaf);
      scrubRaf = null;
    }
  };

  const startScrubbing = () => {
    if (scrubRaf !== null) return;
    scrubFraction = viewport.getPlaybackFraction();

    const stepFraction = () => {
      if (scrubDirection === 0) {
        stopScrubbing();

        return;
      }

      const secs = 12 * (1 / 60);
      const frac = secs / Math.max(viewport.getDurationSeconds(), 1);

      scrubFraction = Math.max(0, Math.min(1, scrubFraction + scrubDirection * frac));
      viewport.seekToFraction(scrubFraction);
      scrubRaf = requestAnimationFrame(stepFraction);
    };

    scrubRaf = requestAnimationFrame(stepFraction);
  };

  document.addEventListener('keydown', (event) => {
    // Only respond during display mode; bail if typing in an input.
    if (app.dataset.mode !== 'display') return;
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    )
      return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        if (infoOverlay.classList.contains('is-visible')) {
          infoOverlay.classList.remove('is-visible');
        } else {
          handleHome();
        }

        break;

      case ' ':
        event.preventDefault();
        handleTogglePlay();
        break;

      case 'ArrowLeft':
        event.preventDefault();
        expandOne(timelineHost);
        scheduleCollapseOne(timelineHost);
        scrubDirection = -1;
        startScrubbing();
        break;

      case 'ArrowRight':
        event.preventDefault();
        expandOne(timelineHost);
        scheduleCollapseOne(timelineHost);
        scrubDirection = 1;
        startScrubbing();
        break;

      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        expandOne(leftCenter);
        scheduleCollapseOne(leftCenter);
        // Only switch views when multiple visualizations are available.
        if (!activeRunMatch?.views || Object.keys(activeRunMatch.views).length <= 1)
          break;

        const configuredViews = activeClass.views.filter(
          (v) => activeRunMatch?.views?.[v.id] !== undefined,
        );

        if (configuredViews.length <= 1) break;

        const currentId =
          activeRunMatch.viewId ?? resolveSelectedViewId(activeClass, activeRunMatch);
        const currentIndex = configuredViews.findIndex((v) => v.id === currentId);
        const nextIndex =
          event.key === 'ArrowUp'
            ? (currentIndex - 1 + configuredViews.length) % configuredViews.length
            : (currentIndex + 1) % configuredViews.length;

        handleViewSelection(configuredViews[nextIndex].id);
        break;
      }
    }
  });

  document.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      scrubDirection = 0;
      stopScrubbing();
    }
  });

  // Start in entry mode with the media hidden and paused unless the app has
  // been locked to a single scale, in which case we open directly to config.
  viewport.hideMedia();
  viewport.pause();
  setMode(advancedSettings.lockedScaleId ? 'config' : 'entry');

  /**
   * Switch to a new simulation family and reset any playback/session state.
   *
   * @param newClass - Newly selected simulation family.
   * @returns void
   */
  function handleClassChange(newClass: SimulationClass): void {
    // If the user picks the family they're already on, skip the reset entirely.
    if (newClass.id === activeClass.id && hasCompletedInitialization) return;

    activeClass = newClass;
    resetSimulationState();
    // Apply the scale's signature theme.
    handleThemeChange(SCALE_TO_THEME[newClass.id]);
    // Rebuild the config overlay so the parameters match the new family.
    overlayPanel.setSimulation(activeClass, getActiveValues());
    timeline.setPosition(0);
    refreshDisplayData();
    refreshViewSwitcher();
    updateSynthesizerLogo();
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
    logInfo('Parameter values updated', {
      simClassId: activeClass.id,
      values: valuesByClass[activeClass.id],
    });
    // The HUD shows parameter values, so refresh it immediately.
    refreshDisplayData();
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
    overlayPanel.setTheme(theme);
  }

  /**
   * Open the configuration overlay to a specific subview.
   *
   * @param view - Which config subview to display.
   * @returns void
   */
  function openConfigPanel(view: OverlayPanelView): void {
    if (view === 'parameters') {
      overlayPanel.setSimulation(activeClass, getActiveValues());
    }

    overlayPanel.setView(view);
    setMode('config');
  }

  /**
   * Apply settings without launching a new run.
   *
   * @returns void
   */
  function handleApplySettings(nextAdvancedSettings: AdvancedSettings): void {
    applyAdvancedSettings(nextAdvancedSettings);

    // If we've already initialized a run, just go back to display mode.
    if (hasCompletedInitialization) {
      summaryOverlay.hide();
      setMode('display');

      return;
    }

    // Otherwise keep showing the parameter view so the user can start a run.
    overlayPanel.setSimulation(activeClass, getActiveValues());
    overlayPanel.setView('parameters');
  }

  /**
   * Close config to display when possible, otherwise return to entry.
   *
   * @returns void
   */
  function handleCloseConfig(): void {
    summaryOverlay.hide();
    if (!hasCompletedInitialization && advancedSettings.lockedScaleId) {
      overlayPanel.setSimulation(activeClass, getActiveValues());
      overlayPanel.setView('parameters');

      return;
    }

    // If we've been through init at least once, going back to display makes
    // sense. Otherwise the video hasn't loaded yet — send them to entry.
    setMode(hasCompletedInitialization ? 'display' : 'entry');
  }

  function handleHome(): void {
    if (advancedSettings.lockedScaleId) {
      return;
    }

    logInfo('Returning to home screen', { simClassId: activeClass.id });
    resetSimulationState();
    hasCompletedInitialization = false;
    viewport.hideMedia();
    setMode('entry');
  }

  /**
   * Replay the currently loaded simulation video from the beginning.
   *
   * @returns void
   */
  function handleReplay(): void {
    hasCompletedPlayback = false;
    summaryOverlay.hide();

    const atEnd = viewport.getPlaybackFraction() >= 0.999;

    if (atEnd) {
      viewport.resetPlayback();
      syncAudioToViewport(true);
    }

    void playViewportWithMutedFallback(viewport);
    syncRunAudioPlayback();
  }

  /**
   * Pause playback and show the end-of-run summary overlay on demand.
   *
   * @returns void
   */
  function handleShowSummary(): void {
    hasCompletedPlayback = true;
    viewport.pause();
    const thumbnail = activeRunMetadata ? viewport.captureFrame() : null;

    summaryOverlay.update(
      activeClass,
      getActiveValues(),
      viewport.getDurationSeconds(),
      activeRunMetadata,
      thumbnail,
    );
    summaryOverlay.show();
    syncRunAudioPlayback();
  }

  /**
   * Toggle play/pause from the timeline control bar.
   *
   * @returns void
   */
  function handleTogglePlay(): void {
    if (viewport.isPaused()) {
      void playViewportWithMutedFallback(viewport);
    } else {
      viewport.pause();
    }
  }

  function handleAudioToggle(): void {
    audioMuted = !audioMuted;
    syncRunAudioPlayback();
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
   * stats and metadata → start full-fetching the active video AND prewarming
   * alternate views, all behind the terminal boot sequence. During active
   * scrubbing we temporarily suspend that background work, then resume it once
   * playback has settled again.
   *
   * @returns void
   */
  async function handleRun(): Promise<void> {
    const values = getActiveValues();
    const runRequestId = runRequests.start();

    logInfo('Run requested', {
      simClassId: activeClass.id,
      values,
      manifestSource: manifestController.getSource(),
    });

    // Query the manifest for the best-matching precomputed video asset.
    // This only selects which video bundle to show; the user's chosen slider
    // values remain the source of truth for scoring and answer-checking.
    const match = await manifestController.findNearestVideo(
      activeClass.id,
      activeClass.parameters,
      values,
    );

    if (!runRequests.isCurrent(runRequestId)) {
      return;
    }

    resetSimulationState({ preserveRunRequest: true });
    activeRunMatch = match;
    // Resolve which view (dark matter, gas density, etc.) to show first.
    const selectedViewId = resolveSelectedViewId(activeClass, match);
    // Fire-and-forget tracking — never blocks playback.

    const assetHostInfo = getAssetHostInfo(manifestController.getSource());

    trackRunSelection({
      simulationId: activeClass.id,
      parameters: values,
      manifestSource: manifestController.getSource(),
      matchedRunId: match.runId,
      assetHostMode: assetHostInfo.mode,
      assetHostBase: assetHostInfo.base,
    });

    const selectedViewUrl = getViewUrl(match, selectedViewId) ?? match.url;
    const alternateViewUrls = Object.entries(match.views ?? {})
      .filter(([viewId]) => viewId !== selectedViewId)
      .map(([, url]) => url);

    // Fire-and-forget the async data loads — they'll update the HUD when done.
    void loadActiveLiveStats(match.liveDataUrl, runRequestId);
    void loadActiveRunMetadata(match.summaryUrl, runRequestId);
    void loadActiveRunAudio(match.summaryUrl, runRequestId);
    viewport.setMuted(true);
    refreshViewSwitcher(selectedViewId);
    refreshAudioControlVisibility();
    setMode('initializing');

    const preparedSourcePromise = prepareActiveVideoSource(selectedViewUrl);

    viewport.resumePrewarming();
    viewport.prewarmSources(alternateViewUrls);

    const videoReady = (async (): Promise<void> => {
      const preparedSource = await preparedSourcePromise;

      if (!runRequests.isCurrent(runRequestId)) {
        return;
      }

      logInfo(
        `Prepared active video source: ${preparedSource.ownedObjectUrl ? 'FULL-FETCH' : 'PROGRESSIVE'}`,
        { selectedViewUrl, waitsForBuffer: preparedSource.shouldWaitForBuffer },
      );

      viewport.setSource(preparedSource.src, {
        ownedObjectUrl: preparedSource.ownedObjectUrl,
      });
      viewport.pause();

      await viewport.waitForLoadedData(ACTIVE_VIDEO_LOADED_DATA_WAIT_MS);

      if (!runRequests.isCurrent(runRequestId)) {
        return;
      }

      if (preparedSource.shouldWaitForBuffer) {
        await viewport.waitForBufferedAhead(
          ACTIVE_VIDEO_BUFFER_SECONDS,
          ACTIVE_VIDEO_BUFFER_WAIT_MS,
        );
      }
    })();

    const loadingFinished = new Promise<void>((resolve) => {
      loadingOverlay.show(getInitializationLines(activeClass), resolve, videoReady, {
        minTerminalTimeMs: getLoadingOverlayMinimumMs(),
      });
    });

    await loadingFinished;

    if (!runRequests.isCurrent(runRequestId)) {
      return;
    }

    hasCompletedInitialization = true;
    viewport.showMedia();
    void playViewportWithMutedFallback(viewport);
    setMode('display');
    syncRunAudioPlayback();
  }

  async function prepareActiveVideoSource(
    videoUrl: string,
  ): Promise<PreparedVideoSource> {
    const resolvedVideoUrl = resolveOnlineAssetUrl(videoUrl);
    const contentLength = await probeContentLength(videoUrl);

    if (
      contentLength !== null &&
      contentLength > 0 &&
      contentLength <= ACTIVE_VIDEO_FULL_FETCH_MAX_BYTES
    ) {
        logInfo('Downloading active video behind loading overlay', {
        videoUrl: resolvedVideoUrl,
        contentLength,
      });

      try {
        const mediaResponse = await fetchWithOnlineAssetFallback(videoUrl);

        if (!mediaResponse.ok) {
          throw new Error(`Failed to download active video: ${resolvedVideoUrl}`);
        }

        const blob = await mediaResponse.blob();

        logInfo(`Active video full fetch complete: ${blob.size} bytes`, {
          videoUrl: resolveOnlineAssetUrl(videoUrl),
          blobType: blob.type,
        });

        return {
          src: URL.createObjectURL(blob),
          ownedObjectUrl: true,
          shouldWaitForBuffer: false,
        };
      } catch (error) {
        logWarn(
          `Full-fetch FAILED; falling back to progressive: ${error instanceof Error ? error.message : String(error)}`,
          {
            videoUrl,
          },
        );
      }
    }

    if (contentLength !== null) {
      logInfo('Active video exceeds full-fetch threshold; using progressive load', {
        videoUrl,
        contentLength,
        fullFetchMaxBytes: ACTIVE_VIDEO_FULL_FETCH_MAX_BYTES,
      });
    } else {
      logInfo('Could not determine active video size; using progressive load', {
        videoUrl,
      });
    }

    logInfo('Using progressive active video load', { videoUrl });

    return {
      src: resolveOnlineAssetUrl(videoUrl),
      ownedObjectUrl: false,
      shouldWaitForBuffer: true,
    };
  }

  async function probeContentLength(videoUrl: string): Promise<number | null> {
    try {
      const rangeResponse = await fetchWithOnlineAssetFallback(videoUrl, {
        headers: { Range: 'bytes=0-0' },
      });

      logInfo('Probed active video size with range request', {
        videoUrl,
        ok: rangeResponse.ok,
        status: rangeResponse.status,
        contentLength: rangeResponse.headers.get('Content-Length'),
        contentRange: rangeResponse.headers.get('Content-Range'),
      });

      const contentLength = parseContentLength(
        rangeResponse.headers.get('Content-Length'),
      );

      if (contentLength !== null) {
        return contentLength;
      }

      const sizeFromRange = parseContentRangeTotal(
        rangeResponse.headers.get('Content-Range'),
      );

      if (sizeFromRange !== null) {
        return sizeFromRange;
      }

      return null;
    } catch (error) {
      logWarn('Could not probe active video size', {
        videoUrl,
        error: error instanceof Error ? error.message : String(error),
      });

      return null;
    }
  }

  function parseContentRangeTotal(header: string | null): number | null {
    if (!header) {
      return null;
    }

    const match = header.match(/bytes\s+\d+-\d+\/(\d+)/i);

    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function parseContentLength(value: string | null): number | null {
    if (!value) {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
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
    setElementVisibility(swiftLogo, nextMode === 'display' || nextMode === 'entry');

    // Burger menu: visible on landing page, parameter selection, and display
    // unless the experience is locked to a single theme. Hidden during loading.
    setElementVisibility(
      topLeft,
      !advancedSettings.lockedScaleId &&
        (nextMode === 'entry' || nextMode === 'config' || nextMode === 'display'),
    );

    if (nextMode === 'entry') {
      // Reassert the expanded state every time we return home. This prevents the
      // burger from carrying a previously collapsed display/config state back
      // into the landing page.
      expandOne(topLeft);
    } else {
      collapseOneNow(topLeft);
    }

    // Entry overlay: shown only in entry mode, hidden everywhere else.
    if (nextMode === 'entry' && !advancedSettings.lockedScaleId) {
      entryOverlay.show();
    } else {
      entryOverlay.hide();
    }

    // Config overlay: only shown when we're explicitly in config mode.
    if (nextMode === 'config') {
      loadingOverlay.hide();
      overlayPanel.setSimulation(activeClass, getActiveValues());
      overlayPanel.show();
    } else {
      overlayPanel.hide();
    }

    // Summary overlay: hidden outside display mode, but re-shown if playback
    // had already completed when the user left and came back.
    if (nextMode !== 'display') {
      summaryOverlay.hide();
    } else if (hasCompletedPlayback) {
      const thumbnail = viewport.captureFrame();

      summaryOverlay.update(
        activeClass,
        getActiveValues(),
        viewport.getDurationSeconds(),
        activeRunMetadata,
        thumbnail,
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

    updateSynthesizerLogo();
    syncRunAudioPlayback();
  }

  function updateSynthesizerLogo(): void {
    if (app.dataset.mode === 'entry') {
      setElementVisibility(synthLogo, true);

      return;
    }

    const isDisplay = app.dataset.mode === 'display';
    const isGalaxy = activeClass.id === 'galaxy';

    setElementVisibility(synthLogo, isDisplay && isGalaxy);
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
      viewportTitle.classList.add('is-hidden');

      return;
    }

    const resolvedId = selectedId ?? resolveSelectedViewId(activeClass, activeRunMatch);
    const activeView = configuredViews.find((v) => v.id === resolvedId);

    viewSwitcher.update(configuredViews, resolvedId);

    if (activeView) {
      viewportTitle.classList.remove('is-hidden');
      viewportTitle.innerHTML = `<span class="viewport-title">${activeView.label ?? activeView.id}</span>`;
    } else {
      viewportTitle.classList.add('is-hidden');
    }
  }

  /**
   * Clear run-specific state so switching families or starting a new run always
   * starts from a clean baseline.
   *
   * @returns void
   */
  function resetSimulationState(options: { preserveRunRequest?: boolean } = {}): void {
    if (!options.preserveRunRequest) {
      runRequests.invalidate();
    }

    activeLiveStatsFrames = EMPTY_LIVE_STATS_DATASET;
    hasCompletedPlayback = false;
    activeRunMetadata = null;
    activeRunMatch = null;
    lastPlaybackSeconds = 0;
    isPointerScrubbing = false;
    pendingSeekFraction = null;
    clearAlternatePrewarmResumeTimer();

    if (scheduledSeekRafId !== null) {
      cancelAnimationFrame(scheduledSeekRafId);
      scheduledSeekRafId = null;
    }

    summaryOverlay.hide();
    viewSwitcher.hide();
    viewport.pause();
    runAudio.pause();
    viewport.clearPrewarmedSources();
    viewport.resetPlayback();
    timeline.setPosition(0);
    clearActiveRunAudio();
  }

  /**
   * Switch to a different view for the active run while preserving playback progress.
   *
   * Views are alternate video renderings of the same simulation run (e.g. dark
   * matter vs. gas density). Switching views should feel seamless — we preserve
   * the current seek position and autoplay state.
   *
   * Alternate views are prewarmed in the background and may already have a
   * primed Blob URL by the time the user switches.
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

    const nextUrl = resolveOnlineAssetUrl(activeRunMatch.views[viewId]);

    if (!nextUrl) {
      return;
    }

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

    viewport.prewarmSources(getAlternateViewUrls());

    if (shouldAutoplay && !isPointerScrubbing) {
      scheduleAlternatePrewarmingResume();
    } else {
      suspendAlternatePrewarming();
    }

    refreshViewSwitcher(viewId);
    refreshAudioControlVisibility();
    syncRunAudioPlayback();
    infoOverlay.classList.remove('is-visible');
    updateSynthesizerLogo();
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
  function createRandomizedValues(simClass: SimulationClass): Record<string, number> {
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
    if (parameter.logScale) {
      const logMin = Math.log10(parameter.min);
      const logMax = Math.log10(parameter.max);
      const logValue = logMin + Math.random() * (logMax - logMin);

      return 10 ** logValue;
    }

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
  async function loadActiveLiveStats(url: string, runRequestId: number): Promise<void> {
    let nextFrames = EMPTY_LIVE_STATS_DATASET;

    try {
      nextFrames = await loadLiveStatsCsv(url);
    } catch (error) {
      logWarn('Failed to load live stats', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!runRequests.isCurrent(runRequestId)) {
      return;
    }

    activeLiveStatsFrames = nextFrames;
    refreshDisplayData();
  }

  /**
   * Load the sidecar run metadata for the active video.
   *
   * @param summaryUrl - URL of the currently selected run summary YAML.
   * @returns Promise that resolves once loading completes.
   */
  async function loadActiveRunMetadata(
    summaryUrl: string,
    runRequestId: number,
  ): Promise<void> {
    const nextMetadata = await loadVideoRunMetadata(summaryUrl);

    if (!runRequests.isCurrent(runRequestId)) {
      return;
    }

    activeRunMetadata = nextMetadata;
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
   * Resolve the default view id for the active simulation.
   *
   * Priority order: manifest's default view → the first view in the manifest's
   * views object. This ensures every fresh run starts on the canonical entry
   * view for that simulation family.
   *
   * @param simClass - Simulation family.
   * @param match - Active manifest-backed run.
   * @returns View id when available.
   */
  function resolveSelectedViewId(
    _simClass: SimulationClass,
    match: VideoMatch | null,
  ): string | undefined {
    // No views configured? Just return whatever the match has.
    if (!match?.views) {
      return match?.viewId;
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

  function doesActiveViewSupportAudio(): boolean {
    const selectedViewId = resolveSelectedViewId(activeClass, activeRunMatch);

    if (!selectedViewId) {
      return false;
    }

    return activeClass.views.some((view) => view.id === selectedViewId && view.audio);
  }

  function getRunAudioUrl(summaryUrl: string): string {
    return summaryUrl.replace(/run_summary\.yaml($|\?)/, 'audio_track.wav$1');
  }

  async function loadActiveRunAudio(
    summaryUrl: string,
    runRequestId: number,
  ): Promise<void> {
    const audioUrl = getRunAudioUrl(summaryUrl);
    const probeNonce = ++audioProbeNonce;
    const available = await doesAudioTrackExist(audioUrl);

    if (!runRequests.isCurrent(runRequestId) || probeNonce !== audioProbeNonce) {
      return;
    }

    if (!available) {
      clearActiveRunAudio();

      return;
    }

    activeAudioUrl = resolveOnlineAssetUrl(audioUrl);
    activeAudioAvailable = true;

    if (runAudio.src !== activeAudioUrl) {
      runAudio.pause();
      runAudio.src = activeAudioUrl;
      runAudio.load();
    }

    refreshAudioControlVisibility();
    syncRunAudioPlayback();
  }

  async function doesAudioTrackExist(audioUrl: string): Promise<boolean> {
    try {
      const headResponse = await fetchWithOnlineAssetFallback(audioUrl, {
        method: 'HEAD',
      });

      if (headResponse.ok) {
        return true;
      }
    } catch {
      // Fall through to the range request fallback.
    }

    try {
      const rangeResponse = await fetchWithOnlineAssetFallback(audioUrl, {
        headers: { Range: 'bytes=0-0' },
      });

      return rangeResponse.ok;
    } catch {
      return false;
    }
  }

  function clearActiveRunAudio(): void {
    audioProbeNonce += 1;
    activeAudioUrl = null;
    activeAudioAvailable = false;
    runAudio.pause();
    runAudio.removeAttribute('src');
    runAudio.load();
    refreshAudioControlVisibility();
  }

  function resetAudioPreferencesToDefaults(): void {
    audioMuted = advancedSettings.audioMutedByDefault;
    audioVolume = advancedSettings.defaultAudioVolume;
    runAudio.muted = audioMuted;
    runAudio.volume = audioVolume;
    timeline.setMuted(audioMuted);
  }

  function refreshAudioControlVisibility(): void {
    timeline.setAudioVisible(
      doesActiveViewSupportAudio() && activeAudioAvailable && Boolean(activeAudioUrl),
    );
    timeline.setMuted(audioMuted);
  }

  function syncAudioToViewport(force = false): void {
    if (!activeAudioAvailable || !Number.isFinite(runAudio.duration) || runAudio.duration <= 0) {
      return;
    }

    const targetTime = Math.max(
      0,
      Math.min(runAudio.duration, viewport.getPlaybackFraction() * runAudio.duration),
    );

    if (force || Math.abs(runAudio.currentTime - targetTime) > 0.35) {
      runAudio.currentTime = targetTime;
    }
  }

  function syncRunAudioPlayback(): void {
    const audioVisible =
      doesActiveViewSupportAudio() && activeAudioAvailable && Boolean(activeAudioUrl);

    refreshAudioControlVisibility();
    runAudio.muted = audioMuted;
    runAudio.volume = audioVolume;

    if (!audioVisible) {
      runAudio.pause();

      return;
    }

    syncAudioToViewport();

    if (
      app.dataset.mode !== 'display' ||
      viewport.isPaused() ||
      hasCompletedPlayback ||
      isPointerScrubbing
    ) {
      runAudio.pause();

      return;
    }

    void runAudio.play().catch(() => {
      audioMuted = true;
      runAudio.muted = true;
      timeline.setMuted(true);
    });
  }

  function getSelectableSimulationClasses(
    settings: AdvancedSettings,
  ): SimulationClass[] {
    const visibleScaleIds = new Set(getVisibleScaleIds(settings, scaleIds));

    return SIMULATION_CLASSES.filter((simClass) => visibleScaleIds.has(simClass.id));
  }

  function getSimulationClassById(simClassId: string | null): SimulationClass | null {
    if (!simClassId) {
      return null;
    }

    return SIMULATION_CLASSES.find((simClass) => simClass.id === simClassId) ?? null;
  }

  function getLoadingOverlayMinimumMs(): number {
    if (manifestController.getSource() !== 'local') {
      return INITIALIZATION.MIN_TERMINAL_TIME_MS;
    }

    return randomIntInclusive(
      INITIALIZATION.MIN_TERMINAL_TIME_MS,
      LOCAL_MANIFEST_MIN_TERMINAL_TIME_MAX_MS,
    );
  }

  function randomIntInclusive(min: number, max: number): number {
    const lower = Math.ceil(Math.min(min, max));
    const upper = Math.floor(Math.max(min, max));

    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
  }

  function applyAdvancedSettings(nextAdvancedSettings: AdvancedSettings): void {
    const previousActiveClassId = activeClass.id;
    const previousManifestSource = advancedSettings.manifestSource;

    advancedSettings = saveAdvancedSettings(nextAdvancedSettings, scaleIds);
    setVerboseLoggingEnabled(advancedSettings.verboseLogging);
    availableSimulationClasses = getSelectableSimulationClasses(advancedSettings);
    manifestController.setSource(advancedSettings.manifestSource);
    if (advancedSettings.manifestSource === 'online') {
      void manifestController.preloadActiveManifest();
    }

    displayMenu.setHomeVisible(!advancedSettings.lockedScaleId);
    summaryOverlay.setHomeVisible(!advancedSettings.lockedScaleId);
    entryOverlay.setSimulationClasses(availableSimulationClasses);
    overlayPanel.setAdvancedSettings(advancedSettings);
    logInfo('Advanced settings updated', advancedSettings);
    resetAudioPreferencesToDefaults();
    syncRunAudioPlayback();

    if (previousManifestSource !== advancedSettings.manifestSource) {
      activeRunMatch = null;
    }

    const lockedClass = getSimulationClassById(advancedSettings.lockedScaleId);

    if (lockedClass) {
      handleClassChange(lockedClass);

      if (lockedClass.id !== previousActiveClassId) {
        hasCompletedInitialization = false;
        viewport.hideMedia();
        overlayPanel.setView('parameters');
      }

      if (!hasCompletedInitialization) {
        handleThemeChange(SCALE_TO_THEME[lockedClass.id]);
        overlayPanel.setSimulation(activeClass, getActiveValues());
      }
    }
  }
}
