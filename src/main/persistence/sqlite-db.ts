/**
 * SQLite through sql.js (WebAssembly), ADR 0004.
 *
 * sql.js keeps the database in memory; save() writes the whole database to disk.
 * Saves are atomic: write a temporary file, flush it to disk, then rename it over
 * the database file, so a crash leaves either the old or the new file, never a
 * truncated one. With a key, the file is encrypted (./file-crypto.ts).
 */
import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic, BindParams, SqlValue } from 'sql.js';
import { detectFormat, encryptBytes, decryptBytes, type FileFormat } from './file-crypto';

export type DatabaseErrorCode =
  | 'KEY_REQUIRED'      // the file is encrypted and no key was given
  | 'DECRYPT_FAILED'    // wrong key, or the file was changed
  | 'NOT_A_DATABASE'    // the file is neither SQLite nor a LightTrack encrypted database
  | 'NEWER_SCHEMA'      // written by a newer LightTrack
  | 'MIGRATION_FAILED'  // a migration failed; the file on disk is unchanged
  | 'INTEGRITY';        // integrity or foreign-key check failed

export class DatabaseError extends Error {
  constructor(readonly code: DatabaseErrorCode, message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export type Row = Record<string, SqlValue>;

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Load the sql.js WebAssembly module once (works from inside the asar archive). */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const wasmDir = path.dirname(require.resolve('sql.js'));
    sqlPromise = initSqlJs({ locateFile: (file: string) => path.join(wasmDir, file) });
  }
  return sqlPromise;
}

/** Write bytes to filePath atomically. */
export function writeFileAtomic(filePath: string, bytes: Uint8Array): void {
  const tmp = `${filePath}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

export interface OpenOptions {
  /** Protected storage key (LT3-008). Without it the file is plain SQLite. */
  key?: string;
}

export class SqliteDb {
  /** True when there was no database before open() (no file, or an empty one). */
  readonly isNew: boolean;
  private readonly db: Database;

  private constructor(
    SQL: SqlJsStatic,
    readonly filePath: string,
    private readonly key: string | undefined,
    bytes: Uint8Array | null,
    /** What was on disk: 'missing', 'empty', plain 'sqlite' or 'encrypted'. */
    readonly sourceFormat: FileFormat | 'missing'
  ) {
    this.isNew = bytes === null;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
  }

  /** Open (or create in memory) a database file. Nothing is written until save(). */
  static async open(filePath: string, options: OpenOptions = {}): Promise<SqliteDb> {
    const SQL = await loadSqlJs();
    const file = fs.existsSync(filePath) ? new Uint8Array(fs.readFileSync(filePath)) : null;
    let bytes: Uint8Array | null = null;
    const format = file ? detectFormat(file) : 'missing';

    if (file) {
      switch (format) {
        case 'empty':
          break;
        case 'sqlite':
          // A plain file opened with a key (for example from a development run) is encrypted on the next save.
          bytes = file;
          break;
        case 'encrypted':
          if (!options.key) {
            throw new DatabaseError('KEY_REQUIRED', 'The database is encrypted and no key is available.');
          }
          try {
            bytes = decryptBytes(file, options.key);
          } catch {
            throw new DatabaseError('DECRYPT_FAILED', 'The database could not be decrypted. The key is wrong or the file was changed.');
          }
          break;
        default:
          throw new DatabaseError('NOT_A_DATABASE', `${path.basename(filePath)} is not a LightTrack database.`);
      }
    }
    return new SqliteDb(SQL, filePath, options.key, bytes, format);
  }

  /** Run one or more statements that return no rows. */
  run(sql: string, params: BindParams = []): void {
    this.db.run(sql, params);
  }

  /** Run a script of several statements (used by migrations). */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /** Return all rows as plain objects. */
  all<T extends Row = Row>(sql: string, params: BindParams = []): T[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** Return the first row, or undefined. */
  get<T extends Row = Row>(sql: string, params: BindParams = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /** Run fn inside a transaction; roll back if it throws. */
  transaction<T>(fn: (db: SqliteDb) => T): T {
    this.db.run('BEGIN');
    try {
      const result = fn(this);
      this.db.run('COMMIT');
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  /** True when save() encrypts. */
  get encrypted(): boolean {
    return Boolean(this.key);
  }

  /** Persist the in-memory database atomically, encrypted when a key was given. */
  save(): void {
    const plain = this.db.export();
    // export() resets the connection's pragmas in sql.js; turn foreign keys back on.
    this.db.run('PRAGMA foreign_keys = ON;');
    writeFileAtomic(this.filePath, this.key ? encryptBytes(plain, this.key) : plain);
  }

  close(): void {
    this.db.close();
  }
}
