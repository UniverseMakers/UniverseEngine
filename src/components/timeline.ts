/**
 * Timeline — bottom scrubber for navigating simulation time.
 *
 * Non-functional for now (no video to seek), but wired up with
 * events for future integration. Displays a time label and slider.
 */

export interface TimelineController {
  /** Set the current time position (0–1) */
  setPosition: (t: number) => void;
  /** Set the time label (e.g. "0.0 Gyr" → "13.8 Gyr") */
  setRange: (startLabel: string, endLabel: string) => void;
}

export type TimelineChangeCallback = (position: number) => void;

export function createTimeline(
  container: HTMLElement,
  onChange?: TimelineChangeCallback,
): TimelineController {
  const timeline = document.createElement('div');
  timeline.className = 'timeline';

  const startLabel = document.createElement('span');
  startLabel.className = 'timeline__label';
  startLabel.textContent = 't = 0';

  const slider = document.createElement('input');
  slider.className = 'timeline__slider';
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1000';
  slider.step = '1';
  slider.value = '0';
  slider.setAttribute('aria-label', 'Simulation time');

  const endLabel = document.createElement('span');
  endLabel.className = 'timeline__label';
  endLabel.textContent = 't = 1';

  slider.addEventListener('input', () => {
    const position = parseInt(slider.value, 10) / 1000;
    onChange?.(position);
  });

  timeline.appendChild(startLabel);
  timeline.appendChild(slider);
  timeline.appendChild(endLabel);
  container.appendChild(timeline);

  return {
    setPosition(t: number) {
      slider.value = String(Math.round(t * 1000));
    },
    setRange(start: string, end: string) {
      startLabel.textContent = start;
      endLabel.textContent = end;
    },
  };
}
