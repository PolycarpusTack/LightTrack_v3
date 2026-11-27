/**
 * Renderer bundle entry (LT3-006).
 *
 * Built by esbuild into js/bundle.js as one classic script that index.html loads
 * before the legacy js/modules/*.js scripts. Modules migrated to TypeScript are
 * published on window.LightTrack under their old names until the legacy scripts
 * that use them are migrated too.
 */
import * as Utils from './utils';
import * as RulePattern from '../../shared/rule-pattern';
import * as Csv from '../../shared/csv';

type LightTrackNamespace = {
  Utils?: typeof Utils;
  RulePattern?: typeof RulePattern;
  Csv?: typeof Csv;
  _loaded?: Record<string, boolean>;
  [key: string]: unknown;
};

declare global {
  interface Window {
    LightTrack: LightTrackNamespace;
  }
}

window.LightTrack = window.LightTrack || {};
// Load flags; legacy modules set their own flag as they load, modules/index.js fills in the rest.
window.LightTrack._loaded = window.LightTrack._loaded || {};
window.LightTrack.Utils = Utils;
// Rule matching shared with tracking, so the rule tester tells the truth (C-4)
window.LightTrack.RulePattern = RulePattern;
// CSV cells shared with the main-process exports (C-6)
window.LightTrack.Csv = Csv;
