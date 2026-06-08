/**
 * Viewport — full-page background layer for simulation media.
 *
 * The viewport now hosts a real video element, but the media remains visually
 * hidden until the app finishes its initializing phase. This lets the app mimic
 * an empty display that only "comes alive" once the simulation is ready.
 */

export interface ViewportController {
  /** Change the displayed media with a soft transition. */
  setSource: (src: string, options?: ViewportSourceOptions) => void;
  /** Enable or disable audio on the video element. */
  setMuted: (muted: boolean) => void;
  /** Attempt playback, usually after a user gesture. */
  play: () => Promise<void>;
  /** Pause playback without clearing the current source. */
  pause: () => void;
  /** Hide the media visually while keeping the viewport frame mounted. */
  hideMedia: () => void;
  /** Reveal the media once initialization is complete. */
  showMedia: () => void;
  /** Seek the current media by normalized position. */
  seekToFraction: (fraction: number) => void;
  /** Reset the current media back to the start. */
  resetPlayback: () => void;
  /** Subscribe to time updates from the active video. */
  onTimeUpdate: (callback: (fraction: number) => void) => void;
  /** Subscribe to media ended events. */
  onEnded: (callback: () => void) => void;
  /** Read the current video duration. */
  getDurationSeconds: () => number;
  /** Read the current playback progress as a normalized fraction. */
  getPlaybackFraction: () => number;
  /** Whether the video is currently paused. */
  isPaused: () => boolean;
  /** Get the viewport element. */
  getElement: () => HTMLElement;
}

export interface ViewportSourceOptions {
  /** Optional normalized seek target to apply after load. */
  seekFraction?: number;
  /** Resume playback after load when true. */
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
  // Build the outer viewport wrapper that anchors the media layer.
  const viewport = document.createElement('div');
  viewport.className = 'viewport';

  // Build the actual HTML video element used for placeholder playback.
  const video = document.createElement('video');
  video.className = 'viewport__media is-empty';
  video.src = initialSrc;
  // No loop — we rely on the ended event to show the summary overlay.
  video.loop = false;
  // Start muted to comply with browser autoplay policies.
  video.muted = true;
  // Required for inline playback on iOS Safari.
  video.playsInline = true;
  // Load metadata first so we can query duration before play.
  video.preload = 'metadata';
  video.setAttribute('aria-label', 'Simulation output');

  // Mount the media element into the viewport and then into the app shell.
  viewport.appendChild(video);
  container.appendChild(viewport);

  // These callbacks are registered by the app shell so playback state can flow upward.
  let timeUpdateCallback: ((fraction: number) => void) | undefined;
  let endedCallback: (() => void) | undefined;

  // Forward time updates whenever the media has a valid duration.
  // We emit normalized fractions (0..1) rather than raw seconds so callers
  // don't need to query video.duration separately for every tick.
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

  // Forward media-ended events so the app shell can show the summary overlay
  // and let the user decide to replay or configure a new run.
  video.addEventListener('ended', () => {
    endedCallback?.();
  });
  /**
   * Swap to a new source with a short fade transition.
   *
   * The 120ms delay lets the CSS fade-out animation start before we swap the
   * video source, preventing an abrupt visual cut. We also handle optional
   * seek-to-fraction and autoplay for view switching.
   *
   * @param src - URL for the new media.
   * @returns void
   */
  function setSource(src: string, options: ViewportSourceOptions = {}): void {
    // Start the CSS fade-out so the current frame fades to black.
    video.classList.add('fade-out');

    window.setTimeout(() => {
      // If the requested source is already active, just remove the fade and stop.
      // This avoids unnecessary re-loads when the user clicks the same view.
      if (video.src.endsWith(src)) {
        video.classList.remove('fade-out');
        return;
      }

      // Remember the current mute state so setting a new src doesn't reset it.
      const resumeMuted = video.muted;
      const seekFraction = options.seekFraction;

      // Swap the source and trigger a fresh load.
      video.src = src;
      video.load();

      // Once the new video's first frame is ready, apply post-load settings.
      video.onloadeddata = () => {
        video.muted = resumeMuted;

        // Seek to a specific fraction if requested (used during view switches).
        if (
          seekFraction !== undefined &&
          Number.isFinite(video.duration) &&
          video.duration > 0
        ) {
          // Clamp to 0..0.999 so we never seek exactly to the end.
          const clamped = Math.max(0, Math.min(0.999, seekFraction));
          video.currentTime = clamped * video.duration;
        } else {
          video.currentTime = 0;
        }

        // Fade back in now that the new source is ready.
        video.classList.remove('fade-out');

        // Resume playback if requested (e.g. switching views while playing).
        if (options.autoplay) {
          void video.play().catch(() => {
            // Leave the media paused if the browser rejects playback.
          });
        }
      };
      // 120ms matches the CSS fade-out transition duration, giving the old
      // frame time to fade before the source is replaced.
    }, 120);
  }

  /**
   * Set the media element mute state.
   *
   * @param muted - Whether audio should be muted.
   * @returns void
   */
  function setMuted(muted: boolean): void {
    // Mute state is controlled by the app shell based on user-gesture context.
    video.muted = muted;
  }

  /**
   * Attempt playback.
   *
   * @returns Promise that resolves when playback starts.
   */
  async function play(): Promise<void> {
    // Delegate to the native media play promise.
    await video.play();
  }

  /**
   * Pause playback.
   *
   * @returns void
   */
  function pause(): void {
    // Pause without changing source or current frame.
    video.pause();
  }

  /**
   * Hide the media visually while leaving the element mounted.
   *
   * @returns void
   */
  function hideMedia(): void {
    // Hide the video visually while leaving the element mounted and ready.
    video.classList.add('is-empty');
  }

  /**
   * Show the media after initialization completes.
   *
   * @returns void
   */
  function showMedia(): void {
    // Reveal the video once initialization has completed.
    video.classList.remove('is-empty');
  }

  /**
   * Seek to a normalized playback fraction.
   *
   * @param fraction - Value in the range 0..1.
   * @returns void
   */
  function seekToFraction(fraction: number): void {
    // Ignore invalid seeks before the duration is known.
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }

    // Clamp normalized input to the 0..1 range before converting to seconds.
    const clamped = Math.max(0, Math.min(1, fraction));
    video.currentTime = clamped * video.duration;
  }

  /**
   * Reset playback to the beginning.
   *
   * @returns void
   */
  function resetPlayback(): void {
    // Reset playback and immediately notify the shell so timeline state resets too.
    video.currentTime = 0;
    timeUpdateCallback?.(0);
  }

  /**
   * Subscribe to normalized playback position updates.
   *
   * @param callback - Called with fraction 0..1 when the video time updates.
   * @returns void
   */
  function onTimeUpdate(callback: (fraction: number) => void): void {
    // Store the shell-provided callback for future media events.
    timeUpdateCallback = callback;
  }

  /**
   * Subscribe to the playback-ended event.
   *
   * @param callback - Called once playback ends.
   * @returns void
   */
  function onEnded(callback: () => void): void {
    // Store the shell-provided callback for future media events.
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
    getElement: () => viewport,
  };
}
