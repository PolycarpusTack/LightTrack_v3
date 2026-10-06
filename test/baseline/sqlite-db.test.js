/**
 * sql.js wrapper (ADR 0004): atomic saves, foreign keys, and file encryption (LT3-101).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SqliteDb, DatabaseError, writeFileAtomic } = require('../../src/main/persistence/sqlite-db');

const KEY = 'a'.repeat(64);
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt3-sqlite-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

async function seeded(file, options) {
  const db = await SqliteDb.open(file, options);
  db.run('CREATE TABLE raw_activity (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, seconds INTEGER NOT NULL)');
  db.run('CREATE INDEX idx_raw_activity_started ON raw_activity(started_at)');
  return db;
}

async function openError(file, options) {
  try {
    (await SqliteDb.open(file, options)).close();
  } catch (error) {
    return error;
  }
  throw new Error('expected open to fail');
}

describe('plain database', () => {
  test('creates, saves and reopens a database file', async () => {
    const file = path.join(dir, 'lighttrack.db');
    const db = await seeded(file);
    expect(db.isNew).toBe(true);
    db.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['a1', '2026-10-05T09:00:00Z', 3600]);
    db.save();
    db.close();

    const reopened = await SqliteDb.open(file);
    expect(reopened.isNew).toBe(false);
    expect(reopened.sourceFormat).toBe('sqlite');
    expect(reopened.all('SELECT id, seconds FROM raw_activity')).toEqual([{ id: 'a1', seconds: 3600 }]);
    reopened.close();
  });

  test('rolls back a failed transaction', async () => {
    const db = await seeded(path.join(dir, 'tx.db'));
    expect(() => db.transaction(t => {
      t.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['a1', '2026-10-05T09:00:00Z', 60]);
      t.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['a1', '2026-10-05T10:00:00Z', 60]); // duplicate key
    })).toThrow();
    expect(db.get('SELECT COUNT(*) AS n FROM raw_activity')).toEqual({ n: 0 });
    db.close();
  });

  test('enforces foreign keys, also after a save', async () => {
    const db = await SqliteDb.open(path.join(dir, 'fk.db'));
    db.run('CREATE TABLE project (id TEXT PRIMARY KEY)');
    db.run('CREATE TABLE worklog (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES project(id))');
    expect(() => db.run('INSERT INTO worklog VALUES (?, ?)', ['w1', 'missing'])).toThrow(/FOREIGN KEY/);
    db.save(); // sql.js export() turns foreign keys off; save() turns them back on
    expect(() => db.run('INSERT INTO worklog VALUES (?, ?)', ['w2', 'missing'])).toThrow(/FOREIGN KEY/);
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

  test('refuses a file that is not a database', async () => {
    const file = path.join(dir, 'junk.db');
    fs.writeFileSync(file, 'not a database at all');
    const error = await openError(file);
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.code).toBe('NOT_A_DATABASE');
  });
});

describe('encrypted database', () => {
  test('writes no SQLite header or content in clear, and reopens with the key', async () => {
    const file = path.join(dir, 'enc.db');
    const db = await seeded(file, { key: KEY });
    db.run('INSERT INTO raw_activity VALUES (?, ?, ?)', ['secret-title-marker', '2026-10-05T09:00:00Z', 60]);
    db.save();
    db.close();

    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('LTDB');
    expect(bytes.includes(Buffer.from('SQLite format 3'))).toBe(false);
    expect(bytes.includes(Buffer.from('secret-title-marker'))).toBe(false);

    const reopened = await SqliteDb.open(file, { key: KEY });
    expect(reopened.sourceFormat).toBe('encrypted');
    expect(reopened.all('SELECT id FROM raw_activity')).toEqual([{ id: 'secret-title-marker' }]);
    reopened.close();
  });

  test('needs the key, the right key and an unchanged file', async () => {
    const file = path.join(dir, 'enc.db');
    const db = await seeded(file, { key: KEY });
    db.save();
    db.close();

    expect((await openError(file)).code).toBe('KEY_REQUIRED');
    expect((await openError(file, { key: 'b'.repeat(64) })).code).toBe('DECRYPT_FAILED');

    const bytes = fs.readFileSync(file);
    bytes[bytes.length - 1] ^= 0xff;
    fs.writeFileSync(file, bytes);
    expect((await openError(file, { key: KEY })).code).toBe('DECRYPT_FAILED');
  });

  test('a plain file opened with a key is encrypted on save', async () => {
    const file = path.join(dir, 'plain.db');
    const plain = await seeded(file);
    plain.save();
    plain.close();

    const db = await SqliteDb.open(file, { key: KEY });
    expect(db.sourceFormat).toBe('sqlite');
    db.save();
    db.close();
    expect(fs.readFileSync(file).subarray(0, 4).toString('ascii')).toBe('LTDB');
  });
});
