/**
 * LT3-101: migrations, schema, foreign keys, indexes and recovery.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase, migrate, checkMigrations, schemaVersion } = require('../../src/main/persistence/database');
const { SqliteDb, DatabaseError } = require('../../src/main/persistence/sqlite-db');
const { MIGRATIONS } = require('../../src/main/persistence/schema');

const KEY = 'c'.repeat(64);
const NOW = '2026-10-06T08:00:00.000Z';
let dir;
let file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lt3-101-'));
  file = path.join(dir, 'lighttrack.db');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const V1 = MIGRATIONS[0];
const extra = sql => ({ version: 2, name: 'test change', sql });

async function openError(options) {
  try {
    (await openDatabase(file, options)).db.close();
  } catch (error) {
    return error;
  }
  throw new Error('expected openDatabase to fail');
}

function seed(db) {
  db.run("INSERT INTO project VALUES ('p1', 'LightTrack', 'active', 0, ?, ?)", [NOW, NOW]);
  db.run(`INSERT INTO raw_activity (id, source, source_id, started_at, ended_at, duration_seconds, local_date, time_zone, created_at)
          VALUES ('r1', 'import', 'v3-1', '2026-10-06T07:00:00Z', '2026-10-06T08:00:00Z', 3600, '2026-10-06', 'Europe/Brussels', ?)`, [NOW]);
  db.run(`INSERT INTO worklog (id, started_at, ended_at, local_date, time_zone, project_id, created_at, updated_at)
          VALUES ('w1', '2026-10-06T07:00:00Z', '2026-10-06T08:00:00Z', '2026-10-06', 'Europe/Brussels', 'p1', ?, ?)`, [NOW, NOW]);
  db.run("INSERT INTO allocation VALUES ('w1', 'r1', 3600)");
}

describe('migration list', () => {
  test('the shipped migrations are valid', () => {
    expect(() => checkMigrations(MIGRATIONS)).not.toThrow();
  });

  test('refuses gaps and transaction statements, allows trigger bodies', () => {
    expect(() => checkMigrations([V1, { version: 3, name: 'gap', sql: '' }])).toThrow(/without gaps/);
    expect(() => checkMigrations([V1, extra('BEGIN; CREATE TABLE x (a); COMMIT;')])).toThrow(/transactions/);
    expect(() => checkMigrations([V1, extra(
      'CREATE TRIGGER t AFTER INSERT ON project BEGIN SELECT 1; END;'
    )])).not.toThrow();
  });
});

describe('fresh database', () => {
  test('applies all migrations, records them and saves', async () => {
    const { db, migration } = await openDatabase(file, { now: () => new Date(NOW) });
    expect(migration).toEqual({ from: 0, to: MIGRATIONS.length, applied: MIGRATIONS.map(m => m.version), backupPath: undefined });
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    expect(db.all('SELECT version, name, applied_at FROM schema_migrations')).toEqual(
      MIGRATIONS.map(m => ({ version: m.version, name: m.name, applied_at: NOW }))
    );
    db.close();
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['lighttrack.db']);
  });

  test('reopening an up-to-date database changes nothing', async () => {
    (await openDatabase(file)).db.close();
    const before = fs.readFileSync(file);
    const mtime = fs.statSync(file).mtimeMs;

    const { db, migration } = await openDatabase(file);
    expect(migration.applied).toEqual([]);
    expect(migration.backupPath).toBeUndefined();
    db.close();
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
    expect(fs.readdirSync(dir)).toEqual(['lighttrack.db']);
  });

  test('is encrypted with a key and reopens with it', async () => {
    (await openDatabase(file, { key: KEY })).db.close();
    expect(fs.readFileSync(file).subarray(0, 4).toString('ascii')).toBe('LTDB');
    const { db } = await openDatabase(file, { key: KEY });
    expect(schemaVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  });

  test('a plain database is encrypted once a key is available', async () => {
    (await openDatabase(file)).db.close();
    (await openDatabase(file, { key: KEY })).db.close();
    expect(fs.readFileSync(file).subarray(0, 4).toString('ascii')).toBe('LTDB');
  });
});

describe('upgrades and failures', () => {
  test('an upgrade backs up the old file and keeps the data', async () => {
    const first = await openDatabase(file, { migrations: [V1], key: KEY });
    seed(first.db);
    first.db.save();
    first.db.close();
    const before = fs.readFileSync(file);

    const { db, migration } = await openDatabase(file, {
      key: KEY, migrations: [V1, extra('ALTER TABLE worklog ADD COLUMN rounding_minutes INTEGER')]
    });
    expect(migration).toMatchObject({ from: 1, to: 2, applied: [2] });
    expect(fs.readFileSync(migration.backupPath)).toEqual(before);
    expect(path.basename(migration.backupPath)).toBe('lighttrack.db.pre-v2.bak');
    expect(db.get('SELECT id, rounding_minutes FROM worklog')).toEqual({ id: 'w1', rounding_minutes: null });
    db.close();
  });

  test('a failed migration leaves the file unchanged and usable', async () => {
    const first = await openDatabase(file, { migrations: [V1] });
    seed(first.db);
    first.db.save();
    first.db.close();
    const before = fs.readFileSync(file);

    const error = await openError({
      migrations: [V1, extra('CREATE TABLE half_done (id TEXT); INSERT INTO no_such_table VALUES (1);')]
    });
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.code).toBe('MIGRATION_FAILED');
    expect(error.message).toMatch(/migration 2 \(test change\).*not changed/);
    expect(fs.readFileSync(file)).toEqual(before);

    const { db } = await openDatabase(file, { migrations: [V1] });
    expect(schemaVersion(db)).toBe(1);
    expect(db.all("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toEqual([]);
    expect(db.get('SELECT COUNT(*) AS n FROM allocation')).toEqual({ n: 1 });
    db.close();
  });

  test('refuses a database written by a newer version', async () => {
    (await openDatabase(file, { migrations: [V1, extra('CREATE TABLE later (id TEXT)')] })).db.close();
    const before = fs.readFileSync(file);
    const error = await openError({ migrations: [V1] });
    expect(error.code).toBe('NEWER_SCHEMA');
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readdirSync(dir)).toEqual(['lighttrack.db']);
  });

  test('refuses a database with broken references', async () => {
    const { db } = await openDatabase(file);
    db.run('PRAGMA foreign_keys = OFF');
    db.run("INSERT INTO allocation VALUES ('no-worklog', 'no-activity', 60)");
    db.save();
    db.close();
    const error = await openError();
    expect(error.code).toBe('INTEGRITY');
    expect(error.message).toMatch(/allocation/);
  });
});

describe('schema', () => {
  let db;
  beforeEach(async () => {
    db = await SqliteDb.open(file);
    migrate(db);
  });
  afterEach(() => db.close());

  const tables = () => db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map(r => r.name);
  const indexColumns = table => db.all(`PRAGMA index_list(${table})`)
    .map(index => db.all(`PRAGMA index_info(${index.name})`).map(c => c.name));

  test('has the core tables', () => {
    expect(tables().sort()).toEqual([
      'activity_revision', 'allocation', 'export_profile', 'export_run', 'export_run_worklog', 'mapping_rule',
      'project', 'project_code_version', 'raw_activity', 'schema_migrations', 'worklog', 'worklog_audit'
    ]);
  });

  test('every foreign key is indexed', () => {
    for (const table of tables()) {
      const groups = new Map();
      for (const fk of db.all(`PRAGMA foreign_key_list(${table})`)) {
        groups.set(fk.id, [...(groups.get(fk.id) || []), fk.from]);
      }
      for (const columns of groups.values()) {
        const covered = indexColumns(table).some(index => columns.every((c, i) => index[i] === c));
        expect({ table, columns, covered }).toEqual({ table, columns, covered: true });
      }
    }
  });

  test('has the indexes the plan requires (dates, projects, states, export membership)', () => {
    const has = (table, column) => indexColumns(table).some(index => index[0] === column);
    expect(has('raw_activity', 'local_date')).toBe(true);
    expect(has('raw_activity', 'started_at')).toBe(true);
    expect(has('worklog', 'local_date')).toBe(true);
    expect(has('worklog', 'project_id')).toBe(true);
    expect(has('worklog', 'state')).toBe(true);
    expect(has('export_run_worklog', 'worklog_id')).toBe(true);
  });

  test('foreign keys are enforced', () => {
    seed(db);
    // unknown project
    expect(() => db.run(`INSERT INTO worklog (id, started_at, ended_at, local_date, time_zone, project_id, created_at, updated_at)
      VALUES ('w2', '2026-10-06T09:00:00Z', '2026-10-06T10:00:00Z', '2026-10-06', 'UTC', 'nope', ?, ?)`, [NOW, NOW])).toThrow(/FOREIGN KEY/);
    // a project with worklogs cannot be deleted
    expect(() => db.run("DELETE FROM project WHERE id = 'p1'")).toThrow(/FOREIGN KEY/);
    // evidence allocated to a worklog cannot be deleted
    expect(() => db.run("DELETE FROM raw_activity WHERE id = 'r1'")).toThrow(/FOREIGN KEY/);
    // deleting a worklog removes its allocations
    db.run("DELETE FROM worklog WHERE id = 'w1'");
    expect(db.get('SELECT COUNT(*) AS n FROM allocation')).toEqual({ n: 0 });
    // an export run needs its profile version
    expect(() => db.run(`INSERT INTO export_run VALUES ('e1', 'sap', 1, '2026-10-01', '2026-10-07', 0, 'x', '[]', ?)`, [NOW]))
      .toThrow(/FOREIGN KEY/);
  });

  test('a worklog with audit history cannot be deleted', () => {
    seed(db);
    db.run("INSERT INTO worklog_audit (worklog_id, at, actor, action) VALUES ('w1', ?, 'user', 'create')", [NOW]);
    expect(() => db.run("DELETE FROM worklog WHERE id = 'w1'")).toThrow(/FOREIGN KEY/);
  });

  test('checks values', () => {
    seed(db);
    expect(() => db.run("UPDATE worklog SET ended_at = started_at WHERE id = 'w1'")).toThrow(/CHECK/);
    expect(() => db.run("UPDATE worklog SET state = 'sent' WHERE id = 'w1'")).toThrow(/CHECK/);
    expect(() => db.run("UPDATE allocation SET seconds = 0")).toThrow(/CHECK/);
    expect(() => db.run("INSERT INTO project VALUES ('p2', 'lighttrack', 'active', 0, ?, ?)", [NOW, NOW])).toThrow(/UNIQUE/);
  });

  test('an imported record is stored once', () => {
    seed(db);
    expect(() => db.run(`INSERT INTO raw_activity (id, source, source_id, started_at, ended_at, duration_seconds, local_date, time_zone, created_at)
      VALUES ('r2', 'import', 'v3-1', '2026-10-06T07:00:00Z', '2026-10-06T08:00:00Z', 3600, '2026-10-06', 'UTC', ?)`, [NOW])).toThrow(/UNIQUE/);
  });
});
