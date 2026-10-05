/**
 * Colour mode (light/dark).
 * Loaded in <head> so the stored mode applies before first paint.
 * Light is the default; the choice is made in Settings > Appearance.
 */
(function () {
  const STORAGE_KEY = 'lighttrack:color-mode';
  const MODES = ['light', 'dark'];

  function readMode() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return MODES.includes(stored) ? stored : 'light';
    } catch {
      return 'light';
    }
  }

  function apply(mode) {
    document.documentElement.dataset.theme = mode;
    document.querySelectorAll('[data-color-mode]').forEach(btn => {
      const active = btn.dataset.colorMode === mode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function setMode(mode) {
    if (!MODES.includes(mode)) return;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage unavailable: the mode still applies for this session.
    }
    // Switch colours in one step instead of letting every hover transition animate.
    const root = document.documentElement;
    root.classList.add('theme-switching');
    apply(mode);
    void root.offsetHeight;
    setTimeout(() => root.classList.remove('theme-switching'), 0);
    window.dispatchEvent(new CustomEvent('lighttrack:themechange', { detail: { mode } }));
  }

  /** Read a design token from :root, e.g. token('--ink-muted'). */
  function token(name, fallback = '') {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  apply(readMode());

  document.addEventListener('DOMContentLoaded', () => {
    apply(readMode());
    document.querySelectorAll('[data-color-mode]').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.colorMode));
    });
  });

  window.LightTrackTheme = { getMode: readMode, setMode, token };
})();
