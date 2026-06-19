import { describe, it, expect } from 'vitest';
import { getSignedBlobUrl, verifySignedBlobUrl } from '../blob.js';

describe('blob signed URLs', () => {
  it('round-trips for an R2 endpoint URL and caps TTL', () => {
    const blobUrl = 'https://abc123.r2.cloudflarestorage.com/inyuku-bucket/products/1.jpg';
    const signed = getSignedBlobUrl(blobUrl, 7200);
    const url = new URL(signed, 'http://localhost');
    const encoded = url.searchParams.get('b')!;
    const expiry = Number(url.searchParams.get('e'));
    const sig = url.searchParams.get('s')!;

    const ttl = expiry - Math.floor(Date.now() / 1000);
    expect(ttl).toBeLessThanOrEqual(3600);

    const decoded = verifySignedBlobUrl(encoded, expiry, sig);
    expect(decoded).toBe(blobUrl);
  });

  it('round-trips for the public R2 base URL', () => {
    const blobUrl = 'https://cdn.inyuku.co.za/products/2.jpg';
    const signed = getSignedBlobUrl(blobUrl, 60);
    const url = new URL(signed, 'http://localhost');
    const decoded = verifySignedBlobUrl(
      url.searchParams.get('b')!,
      Number(url.searchParams.get('e')),
      url.searchParams.get('s')!,
    );
    expect(decoded).toBe(blobUrl);
  });

  it('rejects a non-allow-listed host', () => {
    const blobUrl = 'https://evil.com/bucket/products/3.jpg';
    expect(() => getSignedBlobUrl(blobUrl, 60)).toThrow('BLOB_URL_DISALLOWED_HOST');
  });
});
