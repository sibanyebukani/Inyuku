// Deterministic test environment — runs as a vitest setupFile BEFORE any module
// (including blob.ts, which fail-fasts at load on a missing BLOB_SIGN_SECRET) is imported.
// Keeps the suite hermetic regardless of the ambient/CI environment. These are
// obviously-fake test values — never real secrets.
process.env.ENCRYPTION_KEY ||= 'MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXY=' // base64 of a 32-byte test key
process.env.BLOB_SIGN_SECRET ||= 'test-blob-sign-secret'
// R2 host allow-list must match the hosts used in blob.test.ts:
process.env.R2_ENDPOINT ||= 'https://abc123.r2.cloudflarestorage.com'
process.env.R2_PUBLIC_BASE_URL ||= 'https://cdn.inyuku.co.za'
