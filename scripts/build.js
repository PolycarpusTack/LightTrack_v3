#!/usr/bin/env node
/**
 * Build LightTrack into out/ (LT3-006).
 *
 *   out/main, out/shared                  - tsc (TypeScript and JavaScript side by side)
 *   out/preload.js                        - esbuild bundle of src/preload (sandboxed preloads cannot require local files)
 *   out/renderer                          - static renderer files copied as they are
 *   out/renderer/js/bundle.js             - esbuild bundle of src/renderer/ts (one classic script)
 *
 * out/ sits at the same depth as src/, so paths such as ../../assets keep working.
 * Type errors fail the build. Usage: node scripts/build.js [--production]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'out');
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';

function step(label, fn) {
  const start = Date.now();
  fn();
  console.log(`  ${label} (${Date.now() - start} ms)`);
}

function runBin(bin, args) {
  const exe = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${bin}.cmd` : bin);
  execFileSync(exe, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
}

/** Copy src/renderer to out/renderer, skipping TypeScript sources (bundled separately). */
function copyRenderer() {
  const from = path.join(root, 'src', 'renderer');
  const to = path.join(outDir, 'renderer');
  fs.cpSync(from, to, {
    recursive: true,
    filter: src => !src.startsWith(path.join(from, 'ts')) && !src.endsWith('.ts')
  });
}

function bundlePreload() {
  require('esbuild').buildSync({
    entryPoints: [path.join(root, 'src', 'preload', 'index.ts')],
    outfile: path.join(outDir, 'preload.js'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    external: ['electron'],
    sourcemap: production ? false : 'linked',
    logLevel: 'warning'
  });
}

function bundleRenderer() {
  require('esbuild').buildSync({
    entryPoints: [path.join(root, 'src', 'renderer', 'ts', 'index.ts')],
    outfile: path.join(outDir, 'renderer', 'js', 'bundle.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome130',
    sourcemap: production ? false : 'linked',
    minify: production,
    logLevel: 'warning'
  });
}

console.log(`Building LightTrack (${production ? 'production' : 'development'})`);
step('clean out/', () => fs.rmSync(outDir, { recursive: true, force: true }));
step('compile main process (tsc)', () => runBin('tsc', ['-p', 'tsconfig.main.json']));
step('type-check preload (tsc)', () => runBin('tsc', ['-p', 'tsconfig.preload.json']));
step('type-check renderer (tsc)', () => runBin('tsc', ['-p', 'tsconfig.renderer.json']));
step('bundle preload (esbuild)', bundlePreload);
step('copy renderer files', copyRenderer);
step('bundle renderer TypeScript (esbuild)', bundleRenderer);
console.log('Build complete: out/');
