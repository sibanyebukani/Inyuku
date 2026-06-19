/**
 * Storage driver — abstracts where uploaded files live.
 *
 * Two drivers, selected by the STORAGE_DRIVER env var:
 *   - 'local' → files on the VPS filesystem under STORAGE_DIR (self-hosted deployments).
 *               The stored reference is the bare pathname (e.g. "documents/u1/123-report.pdf").
 *   - 'r2'    → Cloudflare R2 (EU) via the S3-compatible API (ADR-INY-008).
 *               The stored reference is the full R2 endpoint URL.
 *
 * Reads always go through an authenticated route (blob-proxy / download), never
 * a public path — POPIA-protected files are private-by-default. The only exception
 * is `publicUrlFor`, used for public-CDN objects such as product images.
 *
 * Edge-UNSAFE: uses Node fs/stream and the AWS S3 SDK. Never import into Edge code.
 */

import { createReadStream } from 'fs';
import { mkdir, writeFile, readFile, unlink, stat } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type GetObjectOutput,
} from '@aws-sdk/client-s3';

export type StorageDriver = 'local' | 'r2';
export type StorageAccess = 'public' | 'private';

export interface OpenedObject {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  status: number;
}

export function storageDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === 'local' ? 'local' : 'r2';
}

/** True when the reference is a full http(s) URL (an R2 ref). */
export function isHttpUrl(ref: string): boolean {
  return /^https?:\/\//i.test(ref);
}

// ---------------------------------------------------------------------------
// Local filesystem driver
// ---------------------------------------------------------------------------

function storageRoot(): string {
  const dir = process.env.STORAGE_DIR;
  if (!dir) {
    throw new Error('STORAGE_DIR_MISSING: STORAGE_DIR must be set when STORAGE_DRIVER=local');
  }
  return resolve(dir);
}

/** Resolve a ref to an absolute path, refusing anything that escapes the root. */
function resolveLocalPath(ref: string): string {
  const root = storageRoot();
  const full = resolve(root, ref);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`STORAGE_PATH_INVALID: traversal outside storage root: ${ref}`);
  }
  return full;
}

const metaPath = (full: string): string => `${full}.meta.json`;

function parseRange(
  range: string | null | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!range) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return null;
  const [, startStr, endStr] = m;
  let start: number;
  let end: number;
  if (startStr === '' && endStr === '') return null;
  if (startStr === '') {
    // suffix range: last N bytes
    const n = parseInt(endStr!, 10);
    if (Number.isNaN(n) || n === 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(startStr!, 10);
    end = endStr === '' ? size - 1 : parseInt(endStr!, 10);
  }
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start > end || start >= size) return null;
  if (end >= size) end = size - 1;
  return { start, end };
}

// ---------------------------------------------------------------------------
// R2 driver
// ---------------------------------------------------------------------------

function r2Endpoint(): string {
  const endpoint = process.env.R2_ENDPOINT;
  if (!endpoint) {
    throw new Error('R2_ENDPOINT_MISSING: R2_ENDPOINT env var must be set when STORAGE_DRIVER=r2');
  }
  return endpoint.replace(/\/+$/, '');
}

function r2Bucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new Error('R2_BUCKET_MISSING: R2_BUCKET env var must be set when STORAGE_DRIVER=r2');
  }
  return bucket;
}

function getS3Client(): S3Client {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('R2_CREDENTIALS_MISSING: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set');
  }

  return new S3Client({
    endpoint: r2Endpoint(),
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function r2ObjectUrl(bucket: string, key: string): string {
  return `${r2Endpoint()}/${bucket}/${key}`;
}

function r2ObjectKey(ref: string, bucket: string): string | null {
  const endpoint = r2Endpoint();
  const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  try {
    const url = new URL(ref);
    if (publicBase && ref.startsWith(publicBase)) {
      return url.pathname.replace(/^\/+/, '');
    }
    if (endpoint && ref.startsWith(endpoint)) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === bucket) {
        return parts.slice(1).join('/');
      }
    }
  } catch {
    // fall through
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function putObject(
  pathname: string,
  body: Buffer | string,
  opts: { contentType: string; access: StorageAccess },
): Promise<{ url: string }> {
  if (storageDriver() === 'local') {
    const full = resolveLocalPath(pathname);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    await writeFile(metaPath(full), JSON.stringify({ contentType: opts.contentType }), 'utf8');
    return { url: pathname };
  }

  const bucket = r2Bucket();
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: pathname,
      Body: body,
      ContentType: opts.contentType,
    }),
  );
  return { url: r2ObjectUrl(bucket, pathname) };
}

export async function deleteObject(ref: string): Promise<void> {
  if (storageDriver() === 'local' && !isHttpUrl(ref)) {
    const full = resolveLocalPath(ref);
    await unlink(full).catch(() => {});
    await unlink(metaPath(full)).catch(() => {});
    return;
  }

  const bucket = r2Bucket();
  const client = getS3Client();
  const key = r2ObjectKey(ref, bucket) ?? ref;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function readObjectBuffer(ref: string): Promise<Buffer> {
  if (storageDriver() === 'local' && !isHttpUrl(ref)) {
    const full = resolveLocalPath(ref);
    return readFile(full);
  }

  const bucket = r2Bucket();
  const client = getS3Client();
  const key = r2ObjectKey(ref, bucket) ?? ref;
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return bufferFromGetObject(res);
}

export async function openObject(
  ref: string,
  opts?: { range?: string | null },
): Promise<OpenedObject> {
  if (storageDriver() === 'local' && !isHttpUrl(ref)) {
    const full = resolveLocalPath(ref);
    const st = await stat(full);
    const size = st.size;

    let contentType = 'application/octet-stream';
    try {
      const meta = JSON.parse(await readFile(metaPath(full), 'utf8')) as { contentType?: string };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // No sidecar — fall back to octet-stream.
    }

    const r = parseRange(opts?.range, size);
    if (r) {
      const node = createReadStream(full, { start: r.start, end: r.end });
      return {
        body: Readable.toWeb(node) as ReadableStream<Uint8Array>,
        contentType,
        contentLength: r.end - r.start + 1,
        contentRange: `bytes ${r.start}-${r.end}/${size}`,
        status: 206,
      };
    }

    const node = createReadStream(full);
    return {
      body: Readable.toWeb(node) as ReadableStream<Uint8Array>,
      contentType,
      contentLength: size,
      status: 200,
    };
  }

  const bucket = r2Bucket();
  const client = getS3Client();
  const key = r2ObjectKey(ref, bucket) ?? ref;
  const res = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(opts?.range ? { Range: opts.range } : {}),
    }),
  );

  const contentType = res.ContentType ?? 'application/octet-stream';
  const contentLength = res.ContentLength;
  const contentRange = res.ContentRange;
  const status = opts?.range ? 206 : 200;

  return {
    body: streamFromGetObject(res),
    contentType,
    contentLength,
    contentRange,
    status,
  };
}

/**
 * The publicly servable URL for an object that is embedded directly in markup
 * (e.g. a product image). Local refs are served by the unsigned /api/files route;
 * R2 refs are transformed to R2_PUBLIC_BASE_URL when configured.
 */
export function publicUrlFor(ref: string): string {
  if (storageDriver() === 'r2' && isHttpUrl(ref)) {
    const publicBase = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
    if (!publicBase) return ref;
    const key = r2ObjectKey(ref, r2Bucket());
    if (!key) return ref;
    return `${publicBase}/${key}`;
  }

  // local driver
  return `/api/files/${ref.replace(/^\/+/, '')}`;
}

/** Resolve a local ref to its absolute path (for the public file route). */
export function localFilePath(ref: string): string {
  return resolveLocalPath(ref);
}

// ---------------------------------------------------------------------------
// S3 body helpers
// ---------------------------------------------------------------------------

async function bufferFromGetObject(res: GetObjectOutput): Promise<Buffer> {
  const body = res.Body;
  if (!body) throw new Error('R2_BODY_EMPTY');
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof (body as ReadableStream<Uint8Array>).getReader === 'function') {
    return Buffer.from(await new Response(body as ReadableStream<Uint8Array>).arrayBuffer());
  }
  if (body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  throw new Error('R2_BODY_UNSUPPORTED');
}

function streamFromGetObject(res: GetObjectOutput): ReadableStream<Uint8Array> {
  const body = res.Body;
  if (!body) throw new Error('R2_BODY_EMPTY');
  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  }
  if (typeof (body as ReadableStream<Uint8Array>).getReader === 'function') {
    return body as ReadableStream<Uint8Array>;
  }
  throw new Error('R2_BODY_UNSUPPORTED');
}
