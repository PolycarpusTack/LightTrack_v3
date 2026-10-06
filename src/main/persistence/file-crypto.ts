/**
 * Encryption of the database file (LT3-101, ADR 0004).
 *
 * Installed builds encrypt the bytes sql.js exports before the atomic write, with
 * AES-256-GCM. The key is derived (HKDF-SHA256) from the protected storage key of
 * LT3-008, so the same secret is never used directly for two purposes.
 *
 * File layout: "LTDB" + format version (1 byte) + IV (12) + auth tag (16) + ciphertext.
 * The header is authenticated as additional data. Development runs have no key and
 * write a plain SQLite file.
 */
import crypto from 'crypto';

const MAGIC = Buffer.from('LTDB', 'ascii');
const FORMAT_VERSION = 1;
const HEADER = Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION])]);
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'ascii');

export type FileFormat = 'empty' | 'sqlite' | 'encrypted' | 'unknown';

export function detectFormat(bytes: Uint8Array): FileFormat {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length === 0) return 'empty';
  if (buffer.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) return 'sqlite';
  if (buffer.subarray(0, MAGIC.length).equals(MAGIC)) return 'encrypted';
  return 'unknown';
}

function deriveKey(secret: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), 'lighttrack-sqlite-v1', 32));
}

export function encryptBytes(plain: Uint8Array, secret: string): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(HEADER);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([HEADER, iv, cipher.getAuthTag(), body]);
}

/** Throws when the file is not in this format, was changed, or the key is wrong. */
export function decryptBytes(file: Uint8Array, secret: string): Uint8Array {
  const buffer = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  const header = buffer.subarray(0, HEADER.length);
  if (!header.equals(HEADER)) {
    throw new Error('Not a LightTrack encrypted database (or an unsupported format version)');
  }
  const iv = buffer.subarray(HEADER.length, HEADER.length + IV_LENGTH);
  const tag = buffer.subarray(HEADER.length + IV_LENGTH, HEADER.length + IV_LENGTH + TAG_LENGTH);
  const body = buffer.subarray(HEADER.length + IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  decipher.setAAD(HEADER);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
}
