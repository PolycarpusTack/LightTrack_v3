// sqlite-db.js - SQLite through sql.js (WebAssembly), LT3-100 spike
//
// sql.js keeps the database in memory; save() writes the whole database to disk.
// Saves are atomic: write a temporary file, flush it to disk, then rename it over
// the database file, so a crash leaves either the old or the new file, never a
// truncated one.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let sqlPromise = null;

/** Load the sql.js WebAssembly module once (works from inside the asar archive). */
function loadSqlJs() {
  if (!sqlPromise) {
    const wasmDir = path.dirname(require.resolve('sql.js'));
    sqlPromise = initSqlJs({ locateFile: file => path.join(wasmDir, file) });
  }
  return sqlPromise;
}

/** Write bytes to filePath atomically. */
function writeFileAtomic(filePath, bytes) {
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

class SqliteDb {
  constructor(SQL, filePath, bytes) {
    this.filePath = filePath;
    this.db = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
  }

  /** Open (or create) a database file. */
  static async open(filePath) {
    const SQL = await loadSqlJs();
    const bytes = fs.existsSync(filePath) ? new Uint8Array(fs.readFileSync(filePath)) : null;
    return new SqliteDb(SQL, filePath, bytes);
  }

  /** Run a statement that returns no rows. */
  run(sql, params = []) {
    this.db.run(sql, params);
  }

  /** Return all rows as plain objects. */
  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** Run fn inside a transaction; roll back if it throws. */
  transaction(fn) {
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

  /** Persist the in-memory database atomically. */
  save() {
    writeFileAtomic(this.filePath, Buffer.from(this.db.export()));
  }

  close() {
    this.db.close();
  }
}

module.exports = { SqliteDb, writeFileAtomic, loadSqlJs };
