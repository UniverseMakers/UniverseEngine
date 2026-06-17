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
}

export type TimelineChangeCallback = (position: number) => void;

interface TimelineOptions {
  /** Called when the user scrubs the slider (receives 0..1). */
  onChange?: TimelineChangeCallback;

  /** Called when the user clicks the play/pause button. */
  onTogglePlay?: () => void;

  /** Called when the user picks a speed from the dropdown. */
  onSpeedChange?: (rate: number) => void;

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

  barRow.appendChild(playBtn);
  barRow.appendChild(slider);
  barRow.appendChild(speedWrap);

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
  };

  function setSpeedLabel(rate: number) {
    speedBtn.textContent = formatSpeed(rate);

    for (const child of speedMenu.children) {
      child.classList.toggle('is-active', child.textContent === formatSpeed(rate));
    }
  }
}

function formatSpeed(rate: number): string {
  return `x${rate}`;
}
