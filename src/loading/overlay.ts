/**
 * Loading overlay (faux terminal boot sequence).
 *
 * This overlay is shown immediately after pressing Run. It prints a sequence of
 * terminal-like lines over time, then calls `onComplete` so the app can reveal
 * the viewport and transition to display mode.
 */

import type { InitializationLine } from './init-text.ts';
import { INITIALIZATION } from '../shared/constants.ts';

/** Terminal-style loading overlay shown between config and display mode.
 *
 * The overlay types a script of terminal lines and, if a `ready` promise is
 * supplied, stays visible with a progress animation until that promise
 * resolves.  This lets the app hide the full active-video download and
 * progressive buffer build-up behind the terminal without risking a "frozen"
 * screen when the network is slow. */
export interface LoadingOverlayController {
  /** Start streaming terminal lines and call `onComplete` when the overlay
   *  has been shown for long enough AND `ready` (if supplied) has resolved. */
  show: (lines: InitializationLine[], onComplete: () => void, ready?: Promise<void>) => void;
  /** Immediately hide the overlay and clear any queued timers. */
  hide: () => void;
}

/**
 * Create and mount the loading overlay.
 *
 * @param container - Overlay layer host element.
 * @returns Controller for showing/hiding the boot sequence.
 */
export function createLoadingOverlay(container: HTMLElement): LoadingOverlayController {
  const { TYPING_MS_PER_CHAR, FINAL_PAUSE_MS } = INITIALIZATION;

  // Full-screen shell that blocks interaction while the faux boot sequence is
  // printing. CSS handles the visual treatment; this module handles sequencing.
  const overlay = document.createElement('section');

  overlay.className = 'overlay overlay--initializing';
  overlay.hidden = true;
  overlay.classList.add('is-hidden');

  // Everything inside the loading overlay is framed like a terminal window so
  // the user gets a clear transition from parameter selection into "simulation
  // startup" even though we are really just pacing text lines.
  const terminal = document.createElement('div');

  terminal.className = 'terminal';

  const header = document.createElement('div');

  header.className = 'terminal__header';
  header.innerHTML = `
    <div class="terminal__header-left">
      <span class="terminal__dot"></span>
      <span class="terminal__header-label">UNIVERSE_ENGINE_v9.5.1</span>
    </div>
  `;

  const log = document.createElement('div');

  log.className = 'terminal__log';

  const fastForwardButton = document.createElement('button');

  fastForwardButton.className = 'terminal__fast-forward';
  fastForwardButton.type = 'button';
  fastForwardButton.textContent = '>>';
  fastForwardButton.setAttribute('aria-label', 'Fast forward terminal output');
  fastForwardButton.setAttribute('aria-pressed', 'false');

  terminal.appendChild(header);
  terminal.appendChild(log);
  terminal.appendChild(fastForwardButton);
  overlay.appendChild(terminal);
  container.appendChild(overlay);

  let timers: number[] = [];
  let sequenceToken = 0;
  let isFastForwarding = false;

  function setFastForwarding(active: boolean): void {
    isFastForwarding = active;
    fastForwardButton.classList.toggle('is-active', isFastForwarding);
    fastForwardButton.setAttribute('aria-pressed', String(isFastForwarding));
  }

  fastForwardButton.addEventListener('pointerdown', () => {
    setFastForwarding(true);
  });
  fastForwardButton.addEventListener('pointerup', () => {
    setFastForwarding(false);
  });
  fastForwardButton.addEventListener('pointerleave', () => {
    setFastForwarding(false);
  });
  fastForwardButton.addEventListener('pointercancel', () => {
    setFastForwarding(false);
  });
  fastForwardButton.addEventListener('blur', () => {
    setFastForwarding(false);
  });
  fastForwardButton.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      setFastForwarding(true);
    }
  });
  fastForwardButton.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      setFastForwarding(false);
    }
  });

  function clearTimers() {
    for (const timer of timers) {
      window.clearTimeout(timer);
    }

    timers = [];
  }

  function wait(ms: number, token: number): Promise<void> {
    // Every wait is token-aware so a new `show()` or `hide()` call can cancel an
    // in-flight sequence without us needing to thread abort controllers around.
    return new Promise((resolve) => {
      const timer = window.setTimeout(
        () => {
          if (token === sequenceToken) {
            resolve();
          }
        },
        isFastForwarding ? 0 : Math.max(0, ms),
      );

      timers.push(timer);
    });
  }


  async function typeLine(line: string, token: number): Promise<void> {
    // Each line gets its own cursor so the typing effect feels like a real shell
    // prompt rather than one global cursor teleporting around the log.
    const row = document.createElement('div');

    row.className = 'terminal__line';

    const cursor = createCursor();

    row.appendChild(cursor);
    log.appendChild(row);

    const batchSize = isFastForwarding ? 2 : 1;

    for (let index = 0; index < line.length; index += batchSize) {
      if (token !== sequenceToken) {
        return;
      }

      const chunk = line.slice(index, index + batchSize);

      // Insert before the cursor so the block character always stays at the end
      // of the visible line while text streams in.
      row.insertBefore(document.createTextNode(chunk), cursor);
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
    async show(lines: InitializationLine[], onComplete: () => void, ready?: Promise<void>) {
      // Starting a new show() always invalidates any prior sequence first.
      clearTimers();
      sequenceToken += 1;
      const token = sequenceToken;
      setFastForwarding(false);

      log.innerHTML = '';
      overlay.hidden = false;
      overlay.classList.remove('is-hidden');

      for (const [index, line] of lines.entries()) {
        if (token !== sequenceToken) {
          return;
        }

        // Prefix with a synthetic timestamp so even static YAML lines feel like
        // a coherent boot log rather than unrelated status messages.
        const stampedLine = `${formatTimestamp(index)} ${line.text}`;

        await typeLine(stampedLine, token);
      }

      // When the caller supplies a `ready` promise the terminal stays visible
      // with a syncing animation rather than showing a frozen screen.
      if (ready) {
        const syncingRow = document.createElement('div');

        syncingRow.className = 'terminal__line terminal__line--syncing';
        syncingRow.textContent = `${formatTimestamp(lines.length)} STARTING SIMULATION`;
        log.appendChild(syncingRow);

        let dotCount = 0;
        const dotInterval = window.setInterval(() => {
          dotCount = (dotCount + 1) % 4;
          const dots = '.'.repeat(dotCount);

          syncingRow.textContent = `${formatTimestamp(lines.length)} STARTING SIMULATION${dots}`;
          log.scrollTop = log.scrollHeight;
        }, 400);

        timers.push(dotInterval);

        try {
          await ready;
        } catch {
          // The ready promise rejected — carry on.
        }

        window.clearInterval(dotInterval);
        syncingRow.textContent = `${formatTimestamp(lines.length)} STARTING SIMULATION...`;
        log.scrollTop = log.scrollHeight;
      }

      if (token === sequenceToken) {
        // Hold briefly so the user perceives completion before the app swaps
        // into display mode.
        await wait(FINAL_PAUSE_MS, token);
        onComplete();
      }
    },
    hide() {
      clearTimers();
      sequenceToken += 1;
      setFastForwarding(false);
      overlay.hidden = true;
      overlay.classList.add('is-hidden');
      log.innerHTML = '';
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
