/**
 * Theme model, persistence, and picker UI.
 *
 * Responsibilities:
 * - Define the set of supported themes (ids + human labels + tiny ASCII icons).
 * - Persist the active theme to `localStorage`.
 * - Apply the active theme to the document root via `data-theme`.
 * - Render the settings-panel theme picker and keep it in sync.
 *
 * Non-goals:
 * - This module does not define CSS tokens; those live in `src/style.css`.
 * - This module does not own app-level state; callers decide when to apply.
 */

const STORAGE_KEY = 'universe-engine-theme';

export type ThemeId = 'glass' | 'matrix' | 'hal' | 'nostromo' | 'tron';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  icon: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'glass', label: 'Glass', icon: '[ ]' },
  { id: 'matrix', label: 'Matrix', icon: '[#]' },
  { id: 'hal', label: 'HAL 9000', icon: '( )' },
  { id: 'nostromo', label: 'Nostromo', icon: '[=]' },
  { id: 'tron', label: 'Tron', icon: '<>' },
];

export interface ThemePickerController {
  /** Visually mark a theme as active without rebuilding the picker. */
  setActive: (id: ThemeId) => void;
}

/**
 * Read the last persisted theme.
 *
 * @returns The saved theme id, or a reasonable default when missing/invalid.
 */
export function getInitialTheme(): ThemeId {
  const saved = localStorage.getItem(STORAGE_KEY);
  return isThemeId(saved) ? saved : 'tron';
}

/**
 * Apply a theme to the document and persist the choice.
 *
 * @param id - Theme id to activate.
 * @returns void
 */
export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Render the theme picker UI.
 *
 * The picker is a simple list of buttons. It is intentionally state-light:
 * callers own the current theme id and re-apply it to the document.
 *
 * @param container - Host element to mount into.
 * @param initialTheme - Theme id to show as initially active.
 * @param onChange - Callback invoked after a user picks a theme.
 * @returns A controller that can update active styling without rebuilding.
 */
export function createThemePicker(
  container: HTMLElement,
  initialTheme: ThemeId,
  onChange: (theme: ThemeId) => void,
): ThemePickerController {
  // Root wrapper so the parent overlay can position the picker as one block.
  const root = document.createElement('div');
  root.className = 'theme-picker';

  // Keep direct references to each button so we can cheaply toggle active styling later.
  const buttons = new Map<ThemeId, HTMLButtonElement>();

  for (const theme of THEMES) {
    // Each button represents one complete theme preset.
    const button = document.createElement('button');
    button.className = 'theme-picker__option';
    button.type = 'button';
    button.innerHTML = `
      <span class="theme-picker__icon">${theme.icon}</span>
      <span class="theme-picker__label">${theme.label}</span>
    `;
    button.addEventListener('click', () => {
      // Update the local button state immediately for responsiveness.
      setActive(theme.id);

      // Then notify the parent so it can apply the real theme to the document.
      onChange(theme.id);
    });
    root.appendChild(button);
    buttons.set(theme.id, button);
  }

  // Render the picker first, then apply the initial active style.
  container.appendChild(root);
  setActive(initialTheme);

  /**
   * Update active styling for all theme buttons.
   *
   * @param id - Theme id to mark as active.
   * @returns void
   */
  function setActive(id: ThemeId) {
    // Walk every button and mark exactly one as active.
    for (const [themeId, button] of buttons.entries()) {
      const isActive = themeId === id;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    }
  }

  return { setActive };
}

/**
 * Narrow an unknown persisted value to a valid `ThemeId`.
 *
 * @param value - Raw value read from `localStorage`.
 * @returns True when `value` is a known theme id.
 */
function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
