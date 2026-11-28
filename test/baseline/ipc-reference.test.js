/**
 * docs/API_DOCUMENTATION.md is generated from the IPC contract and the preload, so it
 * cannot drift from the code again (it described 40 calls, none of which existed).
 * Regenerate: UPDATE_IPC_REFERENCE=1 npx jest --config jest.baseline.config.js -t "ipc reference"
 */
const fs = require('fs');
const path = require('path');
const { CONTRACT, CHANNELS } = require('../../src/main/ipc/contract');

const ROOT = path.join(__dirname, '..', '..');
const DOC = path.join(ROOT, 'docs', 'API_DOCUMENTATION.md');
const PRELOAD = path.join(ROOT, 'src', 'preload', 'index.ts');

/** Window methods in preload order: { name, channel } for calls, { name, event } for subscriptions. */
function preloadMethods(source) {
  const start = source.indexOf("exposeInMainWorld('lightTrackAPI'");
  const body = source.slice(start);
  // Groups such as `calendar: {` open at two spaces and close with `  },`
  const groups = [];
  const groupPattern = /^ {2}(\w+): \{\s*$/gm;
  let g;
  while ((g = groupPattern.exec(body))) {
    const close = body.indexOf('\n  }', g.index);
    groups.push({ name: g[1], from: g.index, to: close });
  }
  const groupAt = index => groups.find(x => index > x.from && index < x.to)?.name;
  const methods = [];
  const methodPattern = /^ +(\w+):\s*(?:\([^)]*\)\s*=>\s*)?(call|subscribe)\('([^']+)'/gm;
  let m;
  while ((m = methodPattern.exec(body))) {
    const group = groupAt(m.index);
    const name = group ? `${group}.${m[1]}` : m[1];
    methods.push(m[2] === 'call' ? { name, channel: m[3] } : { name, event: m[3] });
  }
  return methods;
}

const cell = text => String(text).replace(/\|/g, '\\|');

function reference() {
  const methods = preloadMethods(fs.readFileSync(PRELOAD, 'utf8'));
  const calls = methods.filter(m => m.channel);
  const events = methods.filter(m => m.event);
  const reached = new Set(calls.map(m => m.channel));
  const unreached = CHANNELS.filter(c => !reached.has(c));
  const unreachedSection = unreached.length
    ? [
      'Registered in main and checked against the contract, but not exposed to the window.',
      '',
      '| Channel | What it does |',
      '|---|---|',
      ...unreached.map(c => `| \`${c}\` | ${cell(CONTRACT[c].doc)} |`)
    ]
    : ['None: every channel in the contract has a window method.'];
  const lines = [
    '# LightTrack IPC reference',
    '',
    'Generated from `src/main/ipc/contract.ts` and `src/preload/index.ts`. Do not edit by hand; regenerate with:',
    '',
    '```',
    'UPDATE_IPC_REFERENCE=1 npx jest --config jest.baseline.config.js -t "ipc reference"',
    '```',
    '',
    'Every request and reply is checked against its schema in the contract. A refused request fails with',
    '`[INVALID_REQUEST]`; other errors carry a code in the same `[CODE] message` form. How to add a channel is in CONTRIBUTING.',
    '',
    '## Window API (`window.lightTrackAPI`)',
    '',
    '| Method | Channel | What it does |',
    '|---|---|---|',
    ...calls.map(m => `| \`${m.name}\` | \`${m.channel}\` | ${cell(CONTRACT[m.channel]?.doc ?? 'Not in the contract')} |`),
    '',
    '## Channels without a window method',
    '',
    ...unreachedSection,
    '',
    '## Events from main',
    '',
    'Each method takes a callback and returns a function that removes it.',
    '',
    '| Method | Event |',
    '|---|---|',
    ...events.map(m => `| \`${m.name}\` | \`${m.event}\` |`),
    ''
  ];
  return lines.join('\n');
}

describe('ipc reference', () => {
  test('ipc reference: every window method calls a channel in the contract', () => {
    const missing = preloadMethods(fs.readFileSync(PRELOAD, 'utf8')).filter(m => m.channel && !CONTRACT[m.channel]);
    expect(missing).toEqual([]);
  });

  test('ipc reference: docs/API_DOCUMENTATION.md matches the contract', () => {
    const expected = reference();
    if (process.env.UPDATE_IPC_REFERENCE === '1') fs.writeFileSync(DOC, expected);
    const actual = fs.readFileSync(DOC, 'utf8').replace(/\r\n/g, '\n');
    expect(actual).toBe(expected);
  });
});
