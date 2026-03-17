/**
 * Theme toggle — dropdown in the top-center bar.
 *
 * Switches between themes:
 *  - Glass: frosted translucent panels, blue accents
 *  - Matrix: green phosphor on black, scanlines, CRT glow
 *  - HAL 9000: clinical black, red eye glow, calm menace
 *  - Nostromo: amber phosphor terminal, retro Alien aesthetic
 *  - Tron: cyan neon wireframe glow on pure black
 *
 * Selection is persisted to localStorage.
 */

const STORAGE_KEY = 'universe-engine-theme';

interface ThemeOption {
  id: string;
  label: string;
  icon: string;
}

const THEMES: ThemeOption[] = [
  { id: 'glass', label: 'Glass', icon: '◻' },
  { id: 'matrix', label: 'Matrix', icon: '▣' },
  { id: 'hal', label: 'HAL 9000', icon: '◉' },
  { id: 'nostromo', label: 'Nostromo', icon: '▦' },
  { id: 'tron', label: 'Tron', icon: '◈' },
];

export function createThemeToggle(container: HTMLElement): void {
  // Restore saved theme or default to glass
  const saved = localStorage.getItem(STORAGE_KEY);
  const initial = THEMES.find((t) => t.id === saved) ? saved! : 'glass';
  applyTheme(initial);

  // Build DOM
  const wrapper = document.createElement('div');
  wrapper.className = 'theme-toggle';

  const btn = document.createElement('button');
  btn.className = 'theme-toggle__btn';
  btn.type = 'button';
  btn.innerHTML = `<span class="theme-label">${getThemeLabel(initial)}</span> <span class="caret">▼</span>`;
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');

  const dropdown = document.createElement('div');
  dropdown.className = 'theme-toggle__dropdown';
  dropdown.setAttribute('role', 'listbox');

  for (const theme of THEMES) {
    const option = document.createElement('button');
    option.className = 'theme-toggle__option';
    option.type = 'button';
    option.setAttribute('role', 'option');
    option.setAttribute('data-theme-id', theme.id);

    if (theme.id === initial) option.classList.add('active');

    option.innerHTML = `<span class="check">${theme.id === initial ? '✓' : ''}</span> ${theme.icon} ${theme.label}`;

    option.addEventListener('click', () => {
      selectTheme(theme.id);
    });

    dropdown.appendChild(option);
  }

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  container.appendChild(wrapper);

  // Toggle open/close
  btn.addEventListener('click', () => {
    const isOpen = wrapper.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      wrapper.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  function selectTheme(id: string) {
    applyTheme(id);
    localStorage.setItem(STORAGE_KEY, id);

    // Update button label
    const label = btn.querySelector('.theme-label')!;
    label.textContent = getThemeLabel(id);

    // Update active states
    dropdown.querySelectorAll('.theme-toggle__option').forEach((opt) => {
      const optId = opt.getAttribute('data-theme-id');
      const isActive = optId === id;
      opt.classList.toggle('active', isActive);
      const check = opt.querySelector('.check')!;
      check.textContent = isActive ? '✓' : '';
    });

    // Close dropdown
    wrapper.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
}

function applyTheme(id: string) {
  document.documentElement.setAttribute('data-theme', id);
}

function getThemeLabel(id: string): string {
  return THEMES.find((t) => t.id === id)?.label ?? id;
}
