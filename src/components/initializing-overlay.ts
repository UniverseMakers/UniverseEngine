/**
 * Initializing overlay (faux terminal boot sequence).
 *
 * This overlay is shown immediately after pressing Run. It prints a sequence of
 * terminal-like lines over time, then calls `onComplete` so the app can reveal
 * the viewport and transition to display mode.
 */

import type { InitializationLine } from '../init-text/index.ts';

/** Terminal-style initializing overlay shown between config and display mode. */
export interface InitializingOverlayController {
  /** Start streaming terminal lines and call `onComplete` when finished. */
  show: (lines: InitializationLine[], onComplete: () => void) => void;
  /** Immediately hide the overlay and clear any queued timers. */
  hide: () => void;
}

/**
 * Create and mount the initializing overlay.
 *
 * @param container - Overlay layer host element.
 * @returns Controller for showing/hiding the boot sequence.
 */
export function createInitializingOverlay(
  container: HTMLElement,
): InitializingOverlayController {
  // Full-screen wrapper for the terminal stage.
  const overlay = document.createElement('section');
  overlay.className = 'overlay overlay--initializing';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // Main faux-terminal panel.
  const terminal = document.createElement('div');
  terminal.className = 'terminal';

  // Terminal header keeps the state readable at a glance.
  const header = document.createElement('div');
  header.className = 'terminal__header';
  header.innerHTML = `
    <div class="terminal__header-left">
      <span class="terminal__dot"></span>
      <span class="terminal__header-label">UNIVERSE_ENGINE_v9.5.1</span>
    </div>
    <div class="terminal__header-right">
      <span class="terminal__header-meta terminal__load">LOAD: 0%</span>
    </div>
  `;

  const loadReadout = header.querySelector('.terminal__load') as HTMLSpanElement;

  // Scrollable container where boot lines are appended over time.
  const log = document.createElement('div');
  log.className = 'terminal__log';

  terminal.appendChild(header);
  terminal.appendChild(log);
  overlay.appendChild(terminal);
  container.appendChild(overlay);

  // Timers are tracked so mode changes can cancel the faux boot sequence
  // cleanly instead of allowing orphaned callbacks to fire later.
  let timers: number[] = [];
  let sequenceToken = 0;

  /**
   * Cancel every queued timeout and clear timer bookkeeping.
   *
   * @returns void
   */
  function clearTimers() {
    // Cancel every queued timeout so mode switches cannot leak delayed callbacks.
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    timers = [];
  }

  /**
   * Wait for `ms` while still respecting cancellation via `sequenceToken`.
   *
   * @param ms - Delay duration in milliseconds.
   * @param token - Token captured at sequence start; used for cancellation.
   * @returns Promise that resolves when the wait completes without cancellation.
   */
  function wait(ms: number, token: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        if (token === sequenceToken) {
          resolve();
        }
      }, ms);
      timers.push(timer);
    });
  }

  /**
   * Update the header load indicator.
   *
   * @param progress - Normalized progress 0..1.
   * @returns void
   */
  function setLoad(progress: number) {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    loadReadout.textContent = `LOAD: ${percent}%`;
  }

  /**
   * Render a short spinner line for `durationSeconds`.
   *
   * @param token - Token captured at sequence start; used for cancellation.
   * @param durationSeconds - How long to spin for.
   * @returns Promise that resolves once the throbber completes.
   */
  async function showThrobber(token: number, durationSeconds: number) {
    // The throbber sits on its own line between boot messages so the terminal
    // still feels active while waiting for the next output line.
    const row = document.createElement('div');
    row.className = 'terminal__throbber';

    const spinner = document.createElement('span');
    spinner.className = 'terminal__spinner';

    const spacer = document.createElement('span');
    spacer.textContent = ' ';

    const cursor = createCursor();

    row.appendChild(spinner);
    row.appendChild(spacer);
    row.appendChild(cursor);
    log.appendChild(row);

    const frames = ['-', '\\', '|', '/'];
    let frameIndex = 0;
    const stepMs = 120;
    const endAt = performance.now() + durationSeconds * 1000;

    while (performance.now() < endAt) {
      if (token !== sequenceToken) {
        row.remove();
        return;
      }

      spinner.textContent = frames[frameIndex % frames.length];
      frameIndex += 1;
      log.scrollTop = log.scrollHeight;
      await wait(stepMs, token);
    }

    row.remove();
  }

  /**
   * Type one line character-by-character, then show the throbber.
   *
   * @param line - Full line to type.
   * @param token - Token captured at sequence start; used for cancellation.
   * @param durationSeconds - Dwell time after typing before continuing.
   * @returns Promise that resolves once typing + dwell completes.
   */
  async function typeLine(line: string, token: number, durationSeconds: number) {
    // Each terminal line gets its own row and characters are appended one by one
    // so the result feels like live terminal output rather than instant text insertion.
    const row = document.createElement('div');
    row.className = 'terminal__line';

    const cursor = createCursor();
    row.appendChild(cursor);
    log.appendChild(row);

    for (const character of line) {
      if (token !== sequenceToken) {
        return;
      }

      row.insertBefore(document.createTextNode(character), cursor);
      log.scrollTop = log.scrollHeight;

      // Add a tiny irregular rhythm so the output feels more terminal-like.
      const delay = character === ' ' ? 12 : 18;
      await wait(delay, token);
    }

    cursor.remove();
    await showThrobber(token, durationSeconds);
  }

  /**
   * Create a block cursor element.
   *
   * @returns Cursor span element.
   */
  function createCursor(): HTMLSpanElement {
    const cursor = document.createElement('span');
    cursor.className = 'terminal__cursor';
    cursor.textContent = '█';
    return cursor;
  }

  return {
    async show(lines: InitializationLine[], onComplete: () => void) {
      // Start from a completely clean terminal each time.
      clearTimers();
      sequenceToken += 1;
      const token = sequenceToken;
      log.innerHTML = '';
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
      setLoad(0);

      const totalDuration = lines.reduce((sum, line) => sum + line.durationSeconds, 0);
      let elapsedDuration = 0;

      // Print the boot sequence sequentially, one line at a time.
      for (const [index, line] of lines.entries()) {
        const stampedLine = `${formatTimestamp(index)} ${line.text}`;
        await typeLine(stampedLine, token, line.durationSeconds);
        elapsedDuration += line.durationSeconds;
        if (totalDuration > 0) {
          setLoad(elapsedDuration / totalDuration);
        }
      }

      setLoad(1);
      if (token === sequenceToken) {
        onComplete();
      }
    },
    hide() {
      // Hiding also resets internal state so the next run starts fresh.
      clearTimers();
      sequenceToken += 1;
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
      log.innerHTML = '';
      setLoad(0);
    },
  };
}

/**
 * Format an integer second count as a terminal timestamp.
 *
 * @param totalSeconds - Whole seconds since sequence start.
 * @returns Timestamp string in `[hh:mm:ss]` format.
 */
function formatTimestamp(totalSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  return `[${pad(hours)}:${pad(minutes)}:${pad(seconds)}]`;
}

/**
 * Left-pad a number to two digits.
 *
 * @param value - Number to pad.
 * @returns Two-character string.
 */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}
