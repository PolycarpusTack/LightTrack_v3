/**
 * LT3-100 spike: sql.js wrapper with atomic saves.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SqliteDb, writeFileAtomic } = require('../../src/main/persistence/sqlite-db');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt3-100-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

async function seeded(file) {
  const db = await SqliteDb.open(file);
  db.run('CREATE TABLE raw_activity (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, seconds INTEGER NOT NULL)');
  db.run('CREATE INDEX idx_raw_activity_started ON raw_activity(started_at)');
  return db;
}

test('creates, saves and reopens a database file', async () => {
  const file = path.join(dir, 'lighttrack.db');
  const db = await seeded(file);
  db.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['a1', '2026-10-05T09:00:00Z', 3600]);
  db.save();
  db.close();

  const reopened = await SqliteDb.open(file);
  expect(reopened.all('SELECT id, seconds FROM raw_activity')).toEqual([{ id: 'a1', seconds: 3600 }]);
  reopened.close();
});

test('rolls back a failed transaction', async () => {
  const db = await seeded(path.join(dir, 'tx.db'));
  expect(() => db.transaction(t => {
    t.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['a1', '2026-10-05T09:00:00Z', 60]);
    t.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['a1', '2026-10-05T10:00:00Z', 60]); // duplicate key
  })).toThrow();
  expect(db.all('SELECT COUNT(*) AS n FROM raw_activity')).toEqual([{ n: 0 }]);
  db.close();
});

test('enforces foreign keys', async () => {
  const db = await SqliteDb.open(path.join(dir, 'fk.db'));
  db.run('CREATE TABLE project (id TEXT PRIMARY KEY)');
  db.run('CREATE TABLE worklog (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id))');
  expect(() => db.run('INSERT INTO worklog VALUES (?, ?)', ['w1', 'missing'])).toThrow(/FOREIGN KEY/);
  db.close();
});

test('a failed save leaves the previous file intact', async () => {
  const file = path.join(dir, 'durable.db');
  const db = await seeded(file);
  db.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['kept', '2026-10-05T09:00:00Z', 60]);
  db.save();
  const before = fs.readFileSync(file);

  db.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['lost', '2026-10-05T10:00:00Z', 60]);
  const rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('simulated crash'); });
  expect(() => db.save()).toThrow('simulated crash');
  rename.mockRestore();

  expect(fs.readFileSync(file)).toEqual(before);
  const reopened = await SqliteDb.open(file);
  expect(reopened.all('SELECT id FROM raw_activity')).toEqual([{ id: 'kept' }]);
  reopened.close();
  db.close();
});

test('writeFileAtomic replaces the file in one step', () => {
  const file = path.join(dir, 'x.bin');
  fs.writeFileSync(file, 'old');
  writeFileAtomic(file, Buffer.from('new'));
  expect(fs.readFileSync(file, 'utf8')).toBe('new');
  expect(fs.readdirSync(dir)).toEqual(['x.bin']);
});
