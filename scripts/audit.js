#!/usr/bin/env node
/**
 * Dependency audit gate (npm run security:audit).
 *
 * Runs `npm audit` and fails on any advisory of moderate severity or higher, except
 * advisories accepted in docs/security/dependency-exceptions.json. An exception covers
 * one advisory in one package, and stops counting after its expiry date, so the build
 * fails again once it lapses. The reasons are recorded in dependency-exceptions.md.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];
const MIN_LEVEL = LEVELS.indexOf('moderate');

const exceptions = JSON.parse(
  fs.readFileSync(path.join(root, 'docs', 'security', 'dependency-exceptions.json'), 'utf8')
).exceptions;

const run = spawnSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('npm audit did not return JSON:', run.stderr || run.stdout);
  process.exit(1);
}
if (report.error) {
  console.error('npm audit failed:', report.error.summary || report.error);
  process.exit(1);
}

// Advisories are the `via` entries that are objects; string entries point at other packages.
const advisories = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities || {})) {
  for (const via of vuln.via) {
    if (typeof via !== 'object' || LEVELS.indexOf(via.severity) < MIN_LEVEL) continue;
    const id = (via.url || '').split('/').pop() || String(via.source);
    advisories.set(`${id} ${pkg}`, { id, pkg, title: via.title, severity: via.severity, url: via.url });
  }
}

const today = new Date().toISOString().slice(0, 10);
const failures = [];
const used = new Set();

for (const advisory of advisories.values()) {
  const exception = exceptions.find(e => e.advisory === advisory.id && e.package === advisory.pkg);
  if (!exception) {
    failures.push(`${advisory.severity}: ${advisory.pkg} - ${advisory.title} (${advisory.url})`);
  } else if (exception.expires < today) {
    failures.push(`exception expired on ${exception.expires}: ${advisory.pkg} ${advisory.id}`);
  } else {
    used.add(exception);
    console.log(`Accepted until ${exception.expires}: ${advisory.pkg} ${advisory.id} (${advisory.severity})`);
  }
}

for (const exception of exceptions.filter(e => !used.has(e))) {
  console.log(`Exception no longer needed, remove it: ${exception.package} ${exception.advisory}`);
}

if (failures.length > 0) {
  console.error(`\nDependency audit failed (${failures.length}):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('Dependency audit passed.');
