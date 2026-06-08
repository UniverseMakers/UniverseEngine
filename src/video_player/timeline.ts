/**
 * Display-mode timeline scrubber.
 *
 * Thin wrapper around a range input (0-1000) that converts to/from normalized
 * 0..1 fractions at the boundary for smooth slider behavior.
 */

export interface TimelineController {
  setPosition: (t: number) => void;
}

export type TimelineChangeCallback = (position: number) => void;

/**
 * Create and mount the timeline scrubber.
 *
 * @param container - Host element to mount into.
 * @param onChange - Optional callback invoked when the user scrubs (receives 0..1).
 * @returns Controller for updating the thumb from playback.
 */
export function createTimeline(
  container: HTMLElement,
  onChange?: TimelineChangeCallback,
): TimelineController {
  const timeline = document.createElement('div');
  timeline.className = 'timeline';

  const barRow = document.createElement('div');
  barRow.className = 'timeline__bar-row';

  const slider = document.createElement('input');
  slider.className = 'timeline__slider';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.value = '0';
  slider.style.setProperty('--fill', '0%');
  slider.setAttribute('aria-label', 'Simulation time');

  const bottomRow = document.createElement('div');
  bottomRow.className = 'timeline__bottom-row';

  const leftCluster = document.createElement('div');
  leftCluster.className = 'timeline__left-cluster';

  const current = document.createElement('span');
  current.className = 'timeline__current';
  current.textContent = 'STATUS: IDLE_OBSERVATION';

  slider.addEventListener('input', () => {
    const position = parseInt(slider.value, 10) / 1000;
    slider.style.setProperty('--fill', `${position * 100}%`);
    current.textContent = `STATUS: IDLE_OBSERVATION [T=${position.toFixed(2)}]`;
    onChange?.(position);
  });

  barRow.appendChild(slider);
  bottomRow.appendChild(leftCluster);
  timeline.appendChild(barRow);
  timeline.appendChild(bottomRow);
  container.appendChild(timeline);

  return {
    setPosition(t: number) {
      const clamped = Math.max(0, Math.min(1, t));
      slider.value = String(Math.round(clamped * 1000));
      slider.style.setProperty('--fill', `${clamped * 100}%`);
      current.textContent = `STATUS: IDLE_OBSERVATION [T=${clamped.toFixed(2)}]`;
    },
  };
}
