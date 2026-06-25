/**
 * Display-mode timeline scrubber with playback controls.
 *
 * Renders a thin translucent control bar containing a play/pause button, a
 * range-input scrubber, and a playback-speed selector. All callbacks are
 * delegated to the shell so the timeline stays stateless.
 */

export interface TimelineController {
  /** Update the visible thumb position from normalized playback progress. */
  setPosition: (t: number) => void;

  /** Update the play/pause button visual state. */
  setPlaying: (playing: boolean) => void;

  /** Update the speed selector label. */
  setSpeed: (rate: number) => void;

  /** Show or hide the audio control. */
  setAudioVisible: (visible: boolean) => void;

  /** Update the mute button visual state. */
  setMuted: (muted: boolean) => void;

  /** Update the audio volume slider. */
  setVolume: (volume: number) => void;
}

export type TimelineChangeCallback = (position: number) => void;

interface TimelineOptions {
  /** Called when the user scrubs the slider (receives 0..1). */
  onChange?: TimelineChangeCallback;

  /** Called when the user clicks the play/pause button. */
  onTogglePlay?: () => void;

  /** Called when the user picks a speed from the dropdown. */
  onSpeedChange?: (rate: number) => void;

  /** Called when the user clicks the summary button. */
  onSummaryClick?: () => void;

  /** Called when the user clicks the audio button. */
  onAudioToggle?: () => void;

  /** Called when the user drags the audio slider. */
  onAudioVolumeChange?: (volume: number) => void;

  /** Called when the user starts dragging the scrubber. */
  onScrubStart?: () => void;

  /** Called when the user finishes dragging the scrubber. */
  onScrubEnd?: () => void;

  /** Initial playback rate label (e.g. 1 for "x1"). */
  initialSpeed?: number;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2] as const;

/**
 * Create and mount the timeline control bar.
 *
 * @param container - Host element to mount into.
 * @param options  - Callback hooks for scrub / play-toggle / speed-change.
 * @returns Controller for updating the thumb, play state, and speed label.
 */
export function createTimeline(
  container: HTMLElement,
  options: TimelineOptions = {},
): TimelineController {
  const {
    onChange,
    onTogglePlay,
    onSpeedChange,
    onSummaryClick,
    onAudioToggle,
    onAudioVolumeChange,
    onScrubStart,
    onScrubEnd,
    initialSpeed = 1,
  } = options;

  const timeline = document.createElement('div');

  timeline.className = 'timeline';

  // ── Top row: play button | scrubber | speed selector ──────────────────
  const barRow = document.createElement('div');

  barRow.className = 'timeline__bar-row';

  const playBtn = document.createElement('button');

  playBtn.className = 'timeline__play-btn';
  playBtn.type = 'button';
  playBtn.setAttribute('aria-label', 'Toggle playback');
  playBtn.addEventListener('click', () => onTogglePlay?.());

  const audioWrap = document.createElement('div');

  audioWrap.className = 'timeline__audio is-hidden';

  const audioBtn = document.createElement('button');

  audioBtn.className = 'timeline__audio-btn';
  audioBtn.type = 'button';
  audioBtn.setAttribute('aria-label', 'Toggle audio mute');

  const audioSliderWrap = document.createElement('div');

  audioSliderWrap.className = 'timeline__audio-slider-wrap';

  const audioSlider = document.createElement('input');

  audioSlider.className = 'timeline__audio-slider';
  audioSlider.type = 'range';
  audioSlider.min = '0';
  audioSlider.max = '100';
  audioSlider.step = '1';
  audioSlider.value = '75';
  audioSlider.setAttribute('aria-label', 'Audio volume');
  audioSliderWrap.appendChild(audioSlider);
  audioWrap.appendChild(audioBtn);
  audioWrap.appendChild(audioSliderWrap);

  let showAudioSliderTimer: number | null = null;
  let suppressAudioToggleClick = false;

  audioBtn.addEventListener('pointerdown', () => {
    showAudioSliderTimer = window.setTimeout(() => {
      audioWrap.classList.add('open');
      suppressAudioToggleClick = true;
      showAudioSliderTimer = null;
    }, 250);
  });
  audioBtn.addEventListener('pointerup', clearAudioSliderTimer);
  audioBtn.addEventListener('pointercancel', clearAudioSliderTimer);
  audioBtn.addEventListener('pointerleave', clearAudioSliderTimer);
  audioBtn.addEventListener('click', () => {
    if (suppressAudioToggleClick) {
      suppressAudioToggleClick = false;

      return;
    }

    onAudioToggle?.();
  });
  audioSlider.addEventListener('input', () => {
    const volume = parseInt(audioSlider.value, 10) / 100;

    onAudioVolumeChange?.(volume);
  });

  const slider = document.createElement('input');

  slider.className = 'timeline__slider';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.value = '0';
  slider.style.setProperty('--fill', '0%');
  slider.setAttribute('aria-label', 'Simulation time');

  const speedWrap = document.createElement('div');

  speedWrap.className = 'timeline__speed';

  const speedBtn = document.createElement('button');

  speedBtn.className = 'timeline__speed-btn';
  speedBtn.type = 'button';
  speedBtn.setAttribute('aria-label', 'Playback speed');
  speedBtn.addEventListener('click', () => {
    speedWrap.classList.toggle('open');
  });

  const speedMenu = document.createElement('div');

  speedMenu.className = 'timeline__speed-menu';

  for (const rate of SPEED_OPTIONS) {
    const option = document.createElement('button');

    option.className = 'timeline__speed-option';
    option.type = 'button';
    option.textContent = formatSpeed(rate);
    option.addEventListener('click', () => {
      speedWrap.classList.remove('open');
      onSpeedChange?.(rate);
    });
    speedMenu.appendChild(option);
  }

  speedWrap.appendChild(speedBtn);
  speedWrap.appendChild(speedMenu);

  const summaryBtn = document.createElement('button');

  summaryBtn.className = 'timeline__summary-btn';
  summaryBtn.type = 'button';
  summaryBtn.setAttribute('aria-label', 'View run summary');
  summaryBtn.textContent = '\u24D8';
  summaryBtn.addEventListener('click', () => onSummaryClick?.());

  barRow.appendChild(audioWrap);
  barRow.appendChild(playBtn);
  barRow.appendChild(slider);
  barRow.appendChild(speedWrap);
  barRow.appendChild(summaryBtn);

  slider.addEventListener('input', () => {
    const position = parseInt(slider.value, 10) / 1000;

    slider.style.setProperty('--fill', `${position * 100}%`);
    onChange?.(position);
  });

  slider.addEventListener('pointerdown', () => onScrubStart?.());
  slider.addEventListener('pointerup', () => onScrubEnd?.());
  // pointerup may not fire if the pointer leaves the slider; `change` catches
  // the release in those cases.
  slider.addEventListener('change', () => onScrubEnd?.());

  // Dismiss the speed dropdown when the user clicks anywhere outside it.
  document.addEventListener('click', (event) => {
    if (!speedWrap.contains(event.target as Node)) {
      speedWrap.classList.remove('open');
    }

    if (!audioWrap.contains(event.target as Node)) {
      audioWrap.classList.remove('open');
    }
  });

  timeline.appendChild(barRow);
  container.appendChild(timeline);

  // Prime the initial speed label.
  setSpeedLabel(initialSpeed);

  return {
    setPosition(t: number) {
      const clamped = Math.max(0, Math.min(1, t));

      slider.value = String(Math.round(clamped * 1000));
      slider.style.setProperty('--fill', `${clamped * 100}%`);
    },
    setPlaying(playing: boolean) {
      playBtn.textContent = playing ? '⏸' : '▶';
      playBtn.classList.toggle('is-paused', !playing);
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    },
    setSpeed(rate: number) {
      setSpeedLabel(rate);
    },
    setAudioVisible(visible: boolean) {
      audioWrap.hidden = !visible;
      audioWrap.classList.toggle('is-hidden', !visible);
      if (!visible) {
        audioWrap.classList.remove('open');
      }
    },
    setMuted(muted: boolean) {
      audioBtn.textContent = muted ? '🔇' : '🔊';
      audioBtn.classList.toggle('is-muted', muted);
      audioBtn.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    },
    setVolume(volume: number) {
      const clamped = Math.max(0, Math.min(1, volume));

      audioSlider.value = String(Math.round(clamped * 100));
    },
  };

  function setSpeedLabel(rate: number) {
    speedBtn.textContent = formatSpeed(rate);

    for (const child of speedMenu.children) {
      child.classList.toggle('is-active', child.textContent === formatSpeed(rate));
    }
  }

  function clearAudioSliderTimer() {
    if (showAudioSliderTimer !== null) {
      window.clearTimeout(showAudioSliderTimer);
      showAudioSliderTimer = null;
    }
  }
}

function formatSpeed(rate: number): string {
  return `x${rate}`;
}
