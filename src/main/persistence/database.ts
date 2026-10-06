/**
 * Opening the LightTrack database and migrating it (LT3-101).
 *
 * - The schema version is SQLite's user_version; schema_migrations keeps a record
 *   of what was applied and when.
 * - All pending migrations run in one transaction. The database lives in memory
 *   (sql.js) and is only written after the migrations and the integrity checks
 *   pass, so a failure leaves the file on disk as it was.
 * - Before migrating an existing file, its bytes are copied to
 *   "<file>.pre-v<N>.bak" (still encrypted), as a second way back.
 * - A database from a newer LightTrack is refused rather than changed.
 */
import fs from 'fs';
import { SqliteDb, DatabaseError, type OpenOptions } from './sqlite-db';
import { MIGRATIONS, type Migration } from './schema';

export interface MigrationResult {
  from: number;
  to: number;
  applied: number[];
  /** Copy of the file taken before migrating, if one was needed. */
  backupPath?: string;
}

export interface OpenDatabaseOptions extends OpenOptions {
  migrations?: readonly Migration[];
  now?: () => Date;
}

/** Versions must run 1, 2, 3 ... with no gaps or repeats. */
export function checkMigrations(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migration ${index + 1} has version ${migration.version}; versions must run 1, 2, 3 ... without gaps`);
    }
    // Trigger bodies use BEGIN ... END, so only transaction statements are refused.
    if (/\bBEGIN(\s+(DEFERRED|IMMEDIATE|EXCLUSIVE))?(\s+TRANSACTION)?\s*;|\b(COMMIT|ROLLBACK)\b/i.test(migration.sql)) {
      throw new Error(`Migration ${migration.version} must not manage transactions`);
    }
  });
}

export function schemaVersion(db: SqliteDb): number {
  return Number(db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0);
}

/** Throws INTEGRITY when SQLite's quick check or the foreign-key check finds a problem. */
export function checkIntegrity(db: SqliteDb): void {
  const quick = db.all('PRAGMA quick_check').map(row => String(row.quick_check));
  if (quick.length !== 1 || quick[0] !== 'ok') {
    throw new DatabaseError('INTEGRITY', `Database integrity check failed: ${quick.slice(0, 3).join('; ')}`);
  }
  const orphans = db.all('PRAGMA foreign_key_check');
  if (orphans.length > 0) {
    const tables = [...new Set(orphans.map(row => String(row.table)))].join(', ');
    throw new DatabaseError('INTEGRITY', `Database has ${orphans.length} broken reference(s) in: ${tables}`);
  }
}

/**
 * Apply pending migrations in memory, in one transaction, then check integrity.
 * Does not save; the caller saves when this returns.
 */
export function migrate(db: SqliteDb, migrations: readonly Migration[] = MIGRATIONS, now: () => Date = () => new Date()): MigrationResult {
  checkMigrations(migrations);
  const from = schemaVersion(db);
  const to = migrations.length;

  if (from > to) {
    throw new DatabaseError('NEWER_SCHEMA',
      `This database was written by a newer version of LightTrack (schema ${from}; this version knows ${to}). Install the newer version.`);
  }

  const pending = migrations.slice(from);
  if (pending.length > 0) {
    let current: Migration | undefined;
    try {
      db.transaction(tx => {
        tx.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
        for (const migration of pending) {
          current = migration;
          tx.exec(migration.sql);
          tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
            [migration.version, migration.name, now().toISOString()]);
        }
        tx.exec(`PRAGMA user_version = ${to}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DatabaseError('MIGRATION_FAILED',
        `Database migration ${current?.version} (${current?.name}) failed: ${message}. The database file was not changed.`);
    }
  }

  checkIntegrity(db);
  return { from, to, applied: pending.map(m => m.version) };
}

/**
 * Open the database at filePath, migrate it and save the result.
 * Throws DatabaseError; on any failure the file on disk is unchanged.
 */
export async function openDatabase(filePath: string, options: OpenDatabaseOptions = {}): Promise<{ db: SqliteDb; migration: MigrationResult }> {
  const db = await SqliteDb.open(filePath, { key: options.key });
  try {
    const migrations = options.migrations ?? MIGRATIONS;
    let backupPath: string | undefined;
    if (!db.isNew && schemaVersion(db) < migrations.length) {
      backupPath = `${filePath}.pre-v${migrations.length}.bak`;
      fs.copyFileSync(filePath, backupPath);
    }

    const migration = migrate(db, migrations, options.now);
    migration.backupPath = backupPath;

    // Write when the schema changed, or to encrypt a plain file now that a key exists.
    if (migration.applied.length > 0 || (db.encrypted && db.sourceFormat === 'sqlite')) {
      db.save();
    }
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}
