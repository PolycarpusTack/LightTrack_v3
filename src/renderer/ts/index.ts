/**
 * Renderer bundle entry (LT3-006).
 *
 * Built by esbuild into js/bundle.js as one classic script that index.html loads
 * before the legacy js/modules/*.js scripts. Modules migrated to TypeScript are
 * published on window.LightTrack under their old names until the legacy scripts
 * that use them are migrated too.
 */
import * as Utils from './utils';

type LightTrackNamespace = {
  Utils?: typeof Utils;
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
