#!/usr/bin/env node
/**
 * LT3-100 spike benchmark: sql.js load, insert, save, reopen and query at
 * increasing sizes of activity-like rows. Results feed ADR 0004.
 *
 * Usage: node scripts/bench-sqljs.js [rows...]   (default: 10000 50000 200000)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SqliteDb } = require('../src/main/persistence/sqlite-db');

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const ROWS = sizes.length ? sizes : [10000, 50000, 200000];

const ms = start => Number(process.hrtime.bigint() - start) / 1e6;
const now = () => process.hrtime.bigint();

async function run(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-sqljs-'));
  const file = path.join(dir, 'bench.db');
  const result = { rows };

  let t = now();
  const db = await SqliteDb.open(file);
  result.openEmptyMs = ms(t);

  db.run(`CREATE TABLE raw_activity (
    id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT NOT NULL, seconds INTEGER NOT NULL,
    app TEXT, title TEXT, project TEXT, tickets TEXT, idle INTEGER NOT NULL DEFAULT 0)`);
  db.run('CREATE INDEX idx_raw_started ON raw_activity(started_at)');
  db.run('CREATE INDEX idx_raw_project ON raw_activity(project)');

  const start = Date.UTC(2024, 0, 1);
  t = now();
  db.transaction(tx => {
    for (let i = 0; i < rows; i++) {
      const s = new Date(start + i * 300000).toISOString();
      const e = new Date(start + i * 300000 + 240000).toISOString();
      tx.run('INSERT INTO raw_activity VALUES (?,?,?,?,?,?,?,?,0)', [
        `act-${i}`, s, e, 240, 'Code.exe',
        `src/main/module-${i % 500}.js - LightTrack - Visual Studio Code (redacted sample ${i})`,
        `Project ${i % 40}`, i % 3 === 0 ? `PRJ-${i % 900}` : null
      ]);
    }
  });
  result.insertMs = ms(t);

  t = now();
  db.save();
  result.saveMs = ms(t);
  result.fileMB = +(fs.statSync(file).size / 1048576).toFixed(1);

  // A single small change still rewrites the whole file: the cost of one save.
  db.run("UPDATE raw_activity SET project = 'Changed' WHERE id = 'act-1'");
  t = now();
  db.save();
  result.saveAfterOneChangeMs = ms(t);
  db.close();

  t = now();
  const reopened = await SqliteDb.open(file);
  result.reopenMs = ms(t);

  const weekStart = new Date(start + (rows / 2) * 300000).toISOString();
  const weekEnd = new Date(start + (rows / 2) * 300000 + 7 * 86400000).toISOString();
  t = now();
  const week = reopened.all('SELECT project, SUM(seconds) AS s FROM raw_activity WHERE started_at BETWEEN ? AND ? GROUP BY project', [weekStart, weekEnd]);
  result.weekQueryMs = ms(t);
  result.weekGroups = week.length;
  reopened.close();

  result.heapMB = +(process.memoryUsage().rss / 1048576).toFixed(0);
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

(async () => {
  const results = [];
  for (const rows of ROWS) results.push(await run(rows));
  const round = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? +v.toFixed(1) : v]));
  console.table(results.map(round));
})();
