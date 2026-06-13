/**
 * Viewport — full-page background layer for simulation media.
 *
 * The viewport hosts a real video element. Media is visually hidden until
 * initialization finishes, so the display only "comes alive" once ready.
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

  /** Ask the browser to begin buffering a set of likely-next videos. */
  prewarmSources: (sources: string[]) => void;

  /** Drop any prewarmed video elements for the previous run. */
  clearPrewarmedSources: () => void;
}

export interface ViewportSourceOptions {
  seekFraction?: number;
  autoplay?: boolean;
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

  function setSource(src: string, options: ViewportSourceOptions = {}): void {
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
  }

  function clearPrewarmedSources(): void {
    for (const prewarmedVideo of prewarmedVideos.values()) {
      prewarmedVideo.removeAttribute('src');
      prewarmedVideo.load();
    }

    prewarmedVideos.clear();
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
  };
}
