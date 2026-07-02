/**
 * Navigation stack for managing app mode history.
 *
 * Implements a simple state stack that tracks UI mode transitions, allowing the
 * back button to navigate backward through the app's state rather than exiting
 * the entire application.
 *
 * The stack automatically manages browser history via the History API so that
 * browser back button and popstate events are properly captured.
 */

export type AppMode = 'entry' | 'config' | 'initializing' | 'display';

interface HistoryState {
  mode: AppMode;
  stackDepth: number;
}

/**
 * Manages the navigation stack for back button support.
 *
 * Public interface:
 * - `push(mode)` — add a mode to the stack and update browser history
 * - `pop()` — remove and return the current mode, going back one step
 * - `getCurrentMode()` — retrieve the current mode without changing state
 * - `clear()` — reset to a known starting state
 * - `onPopStateRequested(callback)` — register listener for browser back events
 */
export class NavigationStack {
  private stack: AppMode[] = [];
  private popStateListener: ((mode: AppMode) => void) | null = null;
  private stackDepth = 0;

  constructor() {
    // Listen for browser back button and history back navigation.
    window.addEventListener('popstate', (event) => {
      this.handlePopState(event);
    });
  }

  /**
   * Push a new mode onto the stack and update browser history.
   *
   * Each push increments the stack depth and creates a browser history entry,
   * so the back button will correctly trigger a popstate event to return here.
   *
   * @param mode - The app mode to push.
   * @returns void
   */
  push(mode: AppMode): void {
    this.stack.push(mode);
    this.stackDepth += 1;

    const state: HistoryState = {
      mode,
      stackDepth: this.stackDepth,
    };

    // Use replaceState for the initial entry mode so it doesn't create a
    // spurious history entry. For all subsequent modes, use pushState so
    // back button events are distinct.
    if (this.stack.length === 1) {
      window.history.replaceState(state, '', window.location.href);
    } else {
      window.history.pushState(state, '', window.location.href);
    }
  }

  /**
   * Pop and return the previous mode from the stack.
   *
   * This is called internally when handling popstate events (back button).
   * It does NOT update browser history — that's already been done by the
   * back button itself.
   *
   * @returns The previous mode if available, null if stack is empty.
   */
  pop(): AppMode | null {
    if (this.stack.length <= 1) {
      return null;
    }

    this.stack.pop();

    return this.stack[this.stack.length - 1] ?? null;
  }

  /**
   * Retrieve the current mode without mutating the stack.
   *
   * @returns The current mode, or null if stack is empty.
   */
  getCurrentMode(): AppMode | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  /**
   * Reset the stack to a single initial mode.
   *
   * Used when returning to the entry screen or resetting the app state.
   *
   * @param initialMode - Mode to initialize the stack with (default: 'entry').
   * @returns void
   */
  clear(initialMode: AppMode = 'entry'): void {
    this.stack = [initialMode];
    this.stackDepth += 1;

    const state: HistoryState = {
      mode: initialMode,
      stackDepth: this.stackDepth,
    };

    window.history.replaceState(state, '', window.location.href);
  }

  /**
   * Register a callback to fire when the user presses the back button.
   *
   * The callback receives the mode we're navigating back TO (after the pop).
   * This allows the app shell to reactively update its UI based on the
   * navigation event.
   *
   * @param callback - Function to call with the previous mode.
   * @returns void
   */
  onPopStateRequested(callback: (mode: AppMode) => void): void {
    this.popStateListener = callback;
  }

  /**
   * Internal handler for browser popstate events (back button).
   *
   * When the user clicks back, the browser fires popstate before the History
   * API updates. We peek at the state to determine which mode to navigate to,
   * pop our stack, and notify listeners.
   *
   * @param event - The popstate event from the browser.
   * @returns void
   */
  private handlePopState(event: PopStateEvent): void {
    const state = event.state as HistoryState | null;

    // Guard: if no state (e.g. user navigated to a URL directly), ignore.
    if (!state || !state.mode) {
      return;
    }

    // If our stack depth is greater than the incoming state's depth,
    // we're going backward. Pop from the stack and notify listeners.
    if (state.stackDepth < this.stackDepth) {
      const previousMode = this.pop();

      if (previousMode && this.popStateListener) {
        this.popStateListener(previousMode);
      }
    }
  }
}
