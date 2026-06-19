import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { redis } from '../src/redis.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshotPath = join(__dirname, '..', 'openapi.snapshot.json');

async function main() {
  const app = buildApp();
  await app.ready();

  const spec = (app as unknown as { swagger(): object }).swagger();

  if (!existsSync(snapshotPath)) {
    writeFileSync(snapshotPath, JSON.stringify(spec, null, 2) + '\n', 'utf8');
    console.log('[openapi] snapshot seeded at openapi.snapshot.json');
    return;
  }

  const existing = JSON.parse(readFileSync(snapshotPath, 'utf8'));

  const a = JSON.stringify(existing, null, 2);
  const b = JSON.stringify(spec, null, 2);

  if (a !== b) {
    console.error('[openapi] drift detected: run the server and regenerate openapi.snapshot.json');
    process.exit(1);
  }

  console.log('[openapi] snapshot matches');
}

main()
  .catch((err) => {
    console.error('[openapi] check failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
