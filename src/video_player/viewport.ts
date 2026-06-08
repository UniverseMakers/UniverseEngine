/**
 * Viewport — full-page background layer for simulation media.
 *
 * The viewport hosts a real video element. Media is visually hidden until
 * initialization finishes, so the display only "comes alive" once ready.
 */

export interface ViewportController {
  setSource: (src: string, options?: ViewportSourceOptions) => void;
  setMuted: (muted: boolean) => void;
  play: () => Promise<void>;
  pause: () => void;
  hideMedia: () => void;
  showMedia: () => void;
  seekToFraction: (fraction: number) => void;
  resetPlayback: () => void;
  onTimeUpdate: (callback: (fraction: number) => void) => void;
  onEnded: (callback: () => void) => void;
  getDurationSeconds: () => number;
  getPlaybackFraction: () => number;
  isPaused: () => boolean;
  getElement: () => HTMLElement;
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
  const viewport = document.createElement('div');
  viewport.className = 'viewport';

  const video = document.createElement('video');
  video.className = 'viewport__media is-empty';
  video.src = initialSrc;
  video.loop = false;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.setAttribute('aria-label', 'Simulation output');

  viewport.appendChild(video);
  container.appendChild(viewport);

  let timeUpdateCallback: ((fraction: number) => void) | undefined;
  let endedCallback: (() => void) | undefined;

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

  function setSource(src: string, options: ViewportSourceOptions = {}): void {
    video.classList.add('fade-out');

    window.setTimeout(() => {
      if (video.src.endsWith(src)) {
        video.classList.remove('fade-out');
        return;
      }

      const resumeMuted = video.muted;
      const seekFraction = options.seekFraction;

      video.src = src;
      video.load();

      video.onloadeddata = () => {
        video.muted = resumeMuted;

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

        video.classList.remove('fade-out');

        if (options.autoplay) {
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

    const clamped = Math.max(0, Math.min(1, fraction));
    video.currentTime = clamped * video.duration;
  }

  function resetPlayback(): void {
    video.currentTime = 0;
    timeUpdateCallback?.(0);
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
    getElement: () => viewport,
  };
}
