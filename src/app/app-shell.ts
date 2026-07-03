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
import { createEntryInfoOverlay } from '../entry/entry-info-overlay.ts';
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
import { NavigationStack } from './navigation-stack.ts';

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
const LOCAL*

