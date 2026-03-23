/**
 * Display-mode timeline scrubber.
 *
 * This component is a thin wrapper around a range input that:
 * - displays the current normalized playback position (0..1)
 * - allows the user to scrub (seek) by dragging
 *
 * Callers provide the seek callback; the component stays UI-only.
 */

export interface TimelineController {
  /** Move the scrubber thumb programmatically. */
  setPosition: (t: number) => void;
}

export type TimelineChangeCallback = (position: number) => void;

/**
 * Create and mount the timeline scrubber.
 *
 * @param container - Host element to mount into.
 * @param onChange - Optional callback invoked when the user scrubs.
 * @returns Controller for updating the thumb from playback.
 */
export function createTimeline(
  container: HTMLElement,
  onChange?: TimelineChangeCallback,
): TimelineController {
  // Outer footer structure closely mirrors the reference HUD: a slim timeline
  // plus a lower status row carrying the current state readout.
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
    // Convert the integer slider value back into a normalized position for callers.
    const position = parseInt(slider.value, 10) / 1000;
    slider.style.setProperty('--fill', `${position * 100}%`);
    current.textContent = `STATUS: IDLE_OBSERVATION [T=${position.toFixed(3)}]`;
    onChange?.(position);
  });

  barRow.appendChild(slider);
  bottomRow.appendChild(leftCluster);
  timeline.appendChild(barRow);
  timeline.appendChild(bottomRow);
  container.appendChild(timeline);

  return {
    setPosition(t: number) {
      // Clamp to the valid range before updating the control.
      const clamped = Math.max(0, Math.min(1, t));
      slider.value = String(Math.round(clamped * 1000));
      slider.style.setProperty('--fill', `${clamped * 100}%`);
      current.textContent = `STATUS: IDLE_OBSERVATION [T=${clamped.toFixed(3)}]`;
    },
  };
}
