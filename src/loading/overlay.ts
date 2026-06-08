/**
 * Loading overlay (faux terminal boot sequence).
 *
 * This overlay is shown immediately after pressing Run. It prints a sequence of
 * terminal-like lines over time, then calls `onComplete` so the app can reveal
 * the viewport and transition to display mode.
 */

import type { InitializationLine } from './init-text.ts';
import { INITIALIZATION } from '../shared/constants.ts';

/** Terminal-style loading overlay shown between config and display mode. */
export interface LoadingOverlayController {
  /** Start streaming terminal lines and call `onComplete` when finished. */
  show: (lines: InitializationLine[], onComplete: () => void) => void;
  /** Immediately hide the overlay and clear any queued timers. */
  hide: () => void;
}

/**
 * Create and mount the loading overlay.
 *
 * @param container - Overlay layer host element.
 * @returns Controller for showing/hiding the boot sequence.
 */
export function createLoadingOverlay(
  container: HTMLElement,
): LoadingOverlayController {
  const { TYPING_MS_PER_CHAR, FINAL_PAUSE_MS } = INITIALIZATION;

  const overlay = document.createElement('section');
  overlay.className = 'overlay overlay--initializing';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  const terminal = document.createElement('div');
  terminal.className = 'terminal';

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
  const log = document.createElement('div');
  log.className = 'terminal__log';

  terminal.appendChild(header);
  terminal.appendChild(log);
  overlay.appendChild(terminal);
  container.appendChild(overlay);

  let timers: number[] = [];
  let sequenceToken = 0;

  function clearTimers() {
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    timers = [];
  }

  function wait(ms: number, token: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(
        () => {
          if (token === sequenceToken) {
            resolve();
          }
        },
        Math.max(0, ms),
      );
      timers.push(timer);
    });
  }

  function setLoad(progress: number) {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    loadReadout.textContent = `LOAD: ${percent}%`;
  }

  async function typeLine(line: string, token: number): Promise<void> {
    const row = document.createElement('div');
    row.className = 'terminal__line';

    const cursor = createCursor();
    row.appendChild(cursor);
    log.appendChild(row);

    for (let index = 0; index < line.length; index += 1) {
      if (token !== sequenceToken) {
        return;
      }

      const character = line[index];
      row.insertBefore(document.createTextNode(character), cursor);
      log.scrollTop = log.scrollHeight;
      await wait(TYPING_MS_PER_CHAR, token);
    }

    cursor.remove();
  }

  function createCursor(): HTMLSpanElement {
    const cursor = document.createElement('span');
    cursor.className = 'terminal__cursor';
    cursor.textContent = '█';
    return cursor;
  }

  return {
    async show(lines: InitializationLine[], onComplete: () => void) {
      clearTimers();
      sequenceToken += 1;
      const token = sequenceToken;
      log.innerHTML = '';
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');
      setLoad(0);

      for (const [index, line] of lines.entries()) {
        if (token !== sequenceToken) {
          return;
        }

        const stampedLine = `${formatTimestamp(index)} ${line.text}`;
        await typeLine(stampedLine, token);
        setLoad((index + 1) / Math.max(1, lines.length));
      }

      setLoad(1);
      if (token === sequenceToken) {
        await wait(FINAL_PAUSE_MS, token);
        onComplete();
      }
    },
    hide() {
      clearTimers();
      sequenceToken += 1;
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
      log.innerHTML = '';
      setLoad(0);
    },
  };
}

function formatTimestamp(totalSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  return `[${pad(hours)}:${pad(minutes)}:${pad(seconds)}]`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
