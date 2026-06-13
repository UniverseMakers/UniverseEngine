/**
 * Viewport — full-page background layer for simulation media.
 *
 * The viewport hosts a real video element. Media is visually hidden until
 * initialization finishes, so the display only "comes alive" once ready.
 *
 * ── Loading philosophy ─────────────────────────────────────────────────
 * This module tries to keep tab switches and re-seeks network-free wherever
 * possible while avoiding premature prewarm work that would compete with
 * the active video's initial buffer.
 *
 *   • The active video uses `preload="auto"` so the browser can fetch ahead.
 *   • `prewarmSources()` runs detached `<video>` preloading + full-Blob
 *     fetches for likely-next views *after* the active video is revealed.
 *   • `setSource()` silently substitutes a primed Blob URL for the remote
 *     URL, so the caller (app-shell) can stay simple and never worry about
 *     whether the video is local or remote.
 *   • `clearPrewarmedSources()` revokes everything when the run changes,
 *     keeping memory and object-URL references clean.
 */

export interface ViewportController {
  /** Swap the active video source, optionally preserving position/autoplaying. */
  setSource: (src: string, options?: ViewportSourceOptions) => void;

  /** Toggle media muting. */
  setMuted: (muted: boolean) => void;

  /** Start playback. */
  play: () => Promise<void>;

  /** Pause playback. */
  pause: () => void;

  /** Visually hide the media element while keeping it mounted. */
  hideMedia: () => void;

  /** Reveal the media element again. */
  showMedia: () => void;

  /** Seek by normalized fraction 0..1. */
  seekToFraction: (fraction: number) => void;

  /** Reset playback back to the start. */
  resetPlayback: () => void;

  /** Wait for the current source to have decoded initial media data. */
  waitForLoadedData: (timeoutMs?: number) => Promise<void>;

  /** Wait until the current source has buffered ahead by the requested amount. */
  waitForBufferedAhead: (minSeconds: number, timeoutMs?: number) => Promise<void>;

  /** Subscribe to normalized time updates. */
  onTimeUpdate: (callback: (fraction: number) => void) => void;

  /** Subscribe to playback-end notifications. */
  onEnded: (callback: () => void) => void;

  /** Read the current media duration in seconds. */
  getDurationSeconds: () => number;

  /** Read the current playback position as a normalized fraction. */
  getPlaybackFraction: () => number;

  /** Whether playback is currently paused. */
  isPaused: () => boolean;

  /** Set video playback rate (0.25, 0.5, 1, etc.). */
  setPlaybackRate: (rate: number) => void;

  /** Read the current playback rate. */
  getPlaybackRate: () => number;

  /** Subscribe to play/pause/ended state changes. */
  onPlayStateChange: (callback: (isPaused: boolean) => void) => void;

  /** Access the root viewport element. */
  getElement: () => HTMLElement;

  /** Ask the browser to begin buffering a set of likely-next videos.
   *
   *  This runs two strategies in parallel for every candidate URL:
   *
   *  1.  **Media-element preloading** — a detached `<video>` element whose
   *      `preload="auto"` tells the browser to fetch and cache a useful
   *      buffer window.  If the user later switches tabs, the browser's
   *      media cache may serve the data directly.
   *
   *  2.  **Background blob pre-fetch** — a `fetch()` of the full file.  When
   *      it completes the resulting Blob URL is stored so that
   *      `setSource()` can swap it in silently, giving the viewport a
   *      completely local media source with zero network activity on the
   *      next seek or tab switch.
   *
   *  Pre-fetched blob URLs are automatically consumed and cleaned up by
   *  `setSource()` (so the caller does not need to look them up) and are
   *  revoked together when `clearPrewarmedSources()` runs.
   *
   *  ── Why both strategies? ──────────────────────────────────────────
   *  Media-element preloading is fast to start and lets progressive
   *  playback begin quickly.  Background blob pre-fetch eliminates
   *  network reads and decode stalls entirely once the file is local.
   *  Together they give the best chance of an instant tab switch
   *  regardless of which strategy finishes first. */
  prewarmSources: (sources: string[]) => void;

  /** Drop any prewarmed video elements for the previous run. */
  clearPrewarmedSources: () => void;

  /** Return a pre-fetched blob URL if one was primed by prewarmSources. */
  getPrewarmedBlobUrl: (src: string) => string | null;
}

export interface ViewportSourceOptions {
  seekFraction?: number;
  autoplay?: boolean;
  ownedObjectUrl?: boolean;
}

/**
 * Create and mount the viewport media layer.
 *
 * @param container - Root app node to mount into.
 * @param initialSrc - Initial video URL to load.
 * @returns Controller for manipulating playback and subscribing to events.
 */
export function createViewport(
  container: HTMLElement,
  initialSrc: string,
): ViewportController {
  // The viewport wrapper gives CSS one stable full-screen layer to position and
  // animate independently from every overlay/chrome element above it.
  const viewport = document.createElement('div');

  viewport.className = 'viewport';

  // We use a real <video> so browser playback, seeking, and buffering work out
  // of the box. The rest of this module is mostly a light controller wrapper.
  const video = document.createElement('video');

  video.className = 'viewport__media is-empty';
  video.src = initialSrc;
  video.loop = false;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-label', 'Simulation output');

  viewport.appendChild(video);
  container.appendChild(viewport);

  let timeUpdateCallback: ((fraction: number) => void) | undefined;
  let endedCallback: (() => void) | undefined;
  let playStateCallback: ((isPaused: boolean) => void) | undefined;
  const prewarmedVideos = new Map<string, HTMLVideoElement>();
  const prewarmedBlobUrls = new Map<string, string>();
  let ownedObjectUrl: string | null = null;

  video.addEventListener('play', () => playStateCallback?.(false));
  video.addEventListener('pause', () => playStateCallback?.(true));
  video.addEventListener('ended', () => playStateCallback?.(true));

  // Convert native video time updates into normalized 0..1 progress so the
  // rest of the app never needs to think about seconds vs duration.
  video.addEventListener('timeupdate', () => {
    if (
      !timeUpdateCallback ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0
    ) {
      return;
    }

    timeUpdateCallback(video.currentTime / video.duration);
  });

  video.addEventListener('ended', () => {
    endedCallback?.();
  });

  // Persist the desired playback rate across source swaps so the user's
  // speed preference survives view switches and run restarts.
  let desiredRate = video.playbackRate;

  function releaseOwnedObjectUrl(): void {
    if (!ownedObjectUrl) {
      return;
    }

    URL.revokeObjectURL(ownedObjectUrl);
    ownedObjectUrl = null;
  }

  function setSource(src: string, options: ViewportSourceOptions = {}): void {
    // ── Blob-URL substitution ──────────────────────────────────────────
    // If a background pre-fetch primed a local Blob URL for this remote
    // source, substitute it now.  This is how tab switches and re-selects
    // get instant local scrubbing without any special-case code in the
    // callers.  The Blob URL is consumed on first use (removed from the
    // cache) so that a subsequent call with the same remote source won't
    // accidentally re-use a stale reference.
    const primedBlobUrl = prewarmedBlobUrls.get(src);

    if (primedBlobUrl) {
      prewarmedBlobUrls.delete(src);
      options = { ...options, ownedObjectUrl: true };

      src = primedBlobUrl;
    }

    // Fade out first so swapping sources feels deliberate rather than like a
    // hard cut between two unrelated videos.
    video.classList.add('fade-out');

    window.setTimeout(() => {
      // If the requested source is already loaded, just cancel the fade and keep
      // the current video. There is no need to flush playback state.
      if (video.src.endsWith(src)) {
        video.classList.remove('fade-out');

        return;
      }

      const resumeMuted = video.muted;
      const seekFraction = options.seekFraction;
      releaseOwnedObjectUrl();
      ownedObjectUrl = options.ownedObjectUrl ? src : null;

      // Replace the source and wait for media data before seeking/autoplaying.
      video.src = src;
      video.load();

      video.onloadeddata = () => {
        video.muted = resumeMuted;

        // Optional seek lets view-switching preserve playback position across
        // alternate renders of the same simulation.
        if (
          seekFraction !== undefined &&
          Number.isFinite(video.duration) &&
          video.duration > 0
        ) {
          const clamped = Math.max(0, Math.min(0.999, seekFraction));

          video.currentTime = clamped * video.duration;
        } else {
          video.currentTime = 0;
        }

        video.playbackRate = desiredRate;
        video.classList.remove('fade-out');

        if (options.autoplay) {
          // Autoplay can legitimately fail on some browsers. The shell handles
          // that gracefully, so we intentionally swallow the rejection here.
          void video.play().catch(() => {});
        }
      };
    }, 120);
  }

  function setMuted(muted: boolean): void {
    video.muted = muted;
  }

  async function play(): Promise<void> {
    await video.play();
  }

  function pause(): void {
    video.pause();
  }

  function hideMedia(): void {
    video.classList.add('is-empty');
  }

  function showMedia(): void {
    video.classList.remove('is-empty');
  }

  function seekToFraction(fraction: number): void {
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }

    // Clamp aggressively so scrubbing never asks the media element for a time
    // outside its real bounds.
    const clamped = Math.max(0, Math.min(1, fraction));

    video.currentTime = clamped * video.duration;
  }

  function resetPlayback(): void {
    // Reset both the media element and any subscribed UI (timeline/HUD).
    video.currentTime = 0;
    timeUpdateCallback?.(0);
  }

  function waitForLoadedData(timeoutMs = 8000): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const handleLoaded = () => {
        cleanup();
        resolve();
      };
      const handleTimeout = window.setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, timeoutMs));

      function cleanup() {
        window.clearTimeout(handleTimeout);
        video.removeEventListener('loadeddata', handleLoaded);
      }

      video.addEventListener('loadeddata', handleLoaded, { once: true });
    });
  }

  function waitForBufferedAhead(minSeconds: number, timeoutMs = 8000): Promise<void> {
    const target = Math.max(0, minSeconds);
    if (target === 0 || hasBufferedAhead(target)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const handleProgress = () => {
        if (!hasBufferedAhead(target)) {
          return;
        }

        cleanup();
        resolve();
      };
      const handleTimeout = window.setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, timeoutMs));

      function cleanup() {
        window.clearTimeout(handleTimeout);
        video.removeEventListener('progress', handleProgress);
        video.removeEventListener('canplay', handleProgress);
        video.removeEventListener('loadeddata', handleProgress);
      }

      video.addEventListener('progress', handleProgress);
      video.addEventListener('canplay', handleProgress);
      video.addEventListener('loadeddata', handleProgress);
      handleProgress()
    });
  }

  function hasBufferedAhead(minSeconds: number): boolean {
    const currentTime = video.currentTime;

    for (let index = 0; index < video.buffered.length; index += 1) {
      const start = video.buffered.start(index);
      const end = video.buffered.end(index);

      if (currentTime < start || currentTime > end) {
        continue;
      }

      return end - currentTime >= minSeconds;
    }

    return false;
  }

  // ── Prewarm / background-fetch strategy ──────────────────────────────
  //
  // Alternate-video views are prewarmed *after* the active video has been
  // revealed, so they never compete for bandwidth during the critical
  // initial-buffering window.
  //
  // Prewarming runs two parallel strategies (see the interface doc above):
  // detached <video> preloading + background Blob fetches.
  //
  // When `setSource()` is later called with a remote URL for which a Blob
  // is already primed, the Blob URL is silently substituted.  That gives the
  // viewport a fully local source — network-free scrubbing — with no extra
  // work or delay in the tab-switch code path.
  //
  // ── Cleanup ──────────────────────────────────────────────────────────
  // `clearPrewarmedSources()` revokes all tracked Blob URLs and resets the
  // detached media elements so the next run starts from a clean state.

  function prewarmSources(sources: string[]): void {
    const wanted = new Set(sources.filter(Boolean).filter((src) => src !== video.currentSrc));

    for (const [src, prewarmedVideo] of prewarmedVideos.entries()) {
      if (wanted.has(src)) {
        continue;
      }

      prewarmedVideo.removeAttribute('src');
      prewarmedVideo.load();
      prewarmedVideos.delete(src);
    }

    for (const src of wanted) {
      if (prewarmedVideos.has(src)) {
        continue;
      }

      const prewarmedVideo = document.createElement('video');

      prewarmedVideo.preload = 'auto';
      prewarmedVideo.muted = true;
      prewarmedVideo.playsInline = true;
      prewarmedVideo.src = src;
      prewarmedVideo.load();
      prewarmedVideos.set(src, prewarmedVideo);
    }

    // In parallel with media-element preloading, attempt full background
    // fetches for each wanted source so that tab switches can use a local
    // blob URL with zero network lag.
    for (const src of wanted) {
      if (prewarmedBlobUrls.has(src)) {
        continue;
      }

      // Append a cache-busting query parameter so that Cloudflare's edge
      // cache serves a fresh response with CORS headers.  Without a custom
      // domain the dashboard cache-purge controls are unavailable.
      const cacheBustedUrl = `${src}?_=${Date.now()}`;

      void fetch(cacheBustedUrl)
        .then(async (response) => {
          if (!response.ok) {
            return;
          }

          const blob = await response.blob();

          prewarmedBlobUrls.set(src, URL.createObjectURL(blob));
        })
        .catch(() => {
          // Background fetch failed — either CORS headers are still
          // propagating through Cloudflare's cache or the preflight
          // was rejected.  The <video>-element preload and the
          // progressive path will handle this view.
        });
    }
  }

  function clearPrewarmedSources(): void {
    // Reset detached <video> elements and revoke every background Blob URL
    // so the next run starts with a clean prewarm cache and no leaked Blob
    // references.
    for (const prewarmedVideo of prewarmedVideos.values()) {
      prewarmedVideo.removeAttribute('src');
      prewarmedVideo.load();
    }

    prewarmedVideos.clear();

    for (const blobUrl of prewarmedBlobUrls.values()) {
      URL.revokeObjectURL(blobUrl);
    }

    prewarmedBlobUrls.clear();
  }

  function getPrewarmedBlobUrl(src: string): string | null {
    return prewarmedBlobUrls.get(src) ?? null;
  }

  function onTimeUpdate(callback: (fraction: number) => void): void {
    timeUpdateCallback = callback;
  }

  function onEnded(callback: () => void): void {
    endedCallback = callback;
  }

  return {
    setSource,
    setMuted,
    play,
    pause,
    hideMedia,
    showMedia,
    seekToFraction,
    resetPlayback,
    waitForLoadedData,
    waitForBufferedAhead,
    onTimeUpdate,
    onEnded,
    getDurationSeconds: () => (Number.isFinite(video.duration) ? video.duration : 0),
    getPlaybackFraction: () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        return 0;
      }

      return video.currentTime / video.duration;
    },
    isPaused: () => video.paused,
    setPlaybackRate: (rate: number) => {
      desiredRate = rate;
      video.playbackRate = rate;
    },
    getPlaybackRate: () => desiredRate,
    onPlayStateChange: (callback: (isPaused: boolean) => void) => {
      playStateCallback = callback;
    },
    getElement: () => viewport,
    prewarmSources,
    clearPrewarmedSources,
    getPrewarmedBlobUrl,
  };
}
