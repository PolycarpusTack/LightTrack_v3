/**
 * Design tokens (#44): text and status colours meet WCAG contrast in both themes,
 * and billable and non-billable segments differ by more than hue.
 * Reads the tokens straight from app.css, so a colour change that breaks contrast fails here.
 */
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../../src/renderer/styles/app.css'), 'utf8');

function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('\n}', start));
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\b/gi)) out[m[1]] = m[2];
  return out;
}

const light = tokens(':root');
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum]: 4.5 for text, 3 for bars and other meaningful graphics.
const PAIRS = [
  ['ink-muted', 'paper', 4.5], ['ink-muted', 'raised', 4.5], ['ink-muted', 'bg', 4.5], ['ink-muted', 'active-bg', 4.5],
  ['accent', 'paper', 4.5], ['accent', 'active-bg', 4.5],
  ['added-ink', 'added-bg', 4.5], ['changed-ink', 'changed-bg', 4.5], ['risk-ink', 'risk-bg', 4.5],
  ['added-ink', 'paper', 4.5], ['risk-ink', 'paper', 4.5],
  ['seg-billable', 'paper', 3], ['seg-nb', 'paper', 3], ['seg-billable', 'raised', 3], ['seg-nb', 'raised', 3]
];

describe.each([['light', light], ['dark', dark]])('%s theme', (_name, t) => {
  test.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(t[fg]).toBeDefined();
    expect(t[bg]).toBeDefined();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });

  test('billable and non-billable segments differ in lightness, not only hue', () => {
    expect(contrast(t['seg-billable'], t['seg-nb'])).toBeGreaterThanOrEqual(1.5);
  });
});
