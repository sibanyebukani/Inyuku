/**
 * AES-256-GCM encryption utilities for at-rest secrets.
 *
 * Wire format: `enc:v1:<iv_b64url>:<ciphertext_b64url>:<tag_b64url>`
 * (URL-safe base64, no padding).
 *
 * The ENCRYPTION_KEY env var is 32 raw bytes encoded as standard base64.
 * It is read lazily (per call), never at module import time, so this module
 * is safe to import in edge contexts that do not need encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION_PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

const MISSING_KEY_MSG =
  'ENCRYPTION_KEY env var is missing or invalid (must be 32-byte base64)';

function toB64Url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const std = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(std, 'base64');
}

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error(MISSING_KEY_MSG);
  let buf: Buffer;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    throw new Error(MISSING_KEY_MSG);
  }
  if (buf.length !== KEY_BYTES) throw new Error(MISSING_KEY_MSG);
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${toB64Url(iv)}:${toB64Url(ciphertext)}:${toB64Url(tag)}`;
}

export function decrypt(ciphertext: string): string {
  if (!isEncrypted(ciphertext)) {
    throw new Error('decrypt: value is not an enc:v1 string');
  }
  const body = ciphertext.slice(VERSION_PREFIX.length);
  const parts = body.split(':');
  if (parts.length !== 3) {
    throw new Error('decrypt: malformed enc:v1 payload');
  }
  const [ivB64, ctB64, tagB64] = parts;
  const iv = fromB64Url(ivB64!);
  const ct = fromB64Url(ctB64!);
  const tag = fromB64Url(tagB64!);
  if (iv.length !== IV_BYTES) {
    throw new Error('decrypt: invalid IV length');
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error('decrypt: invalid auth tag length');
  }
  const key = loadKey();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString('utf8');
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

export function maskSecret(value: string): string {
  if (!value) return '';
  return '••••••••';
}
