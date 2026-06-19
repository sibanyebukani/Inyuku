import { prisma } from '../src/db.js';

const PLATFORM_BUSINESS_ID = 'platform';

const PERMISSIONS = [
  { key: 'business:read', description: 'Read business profile' },
  { key: 'business:update', description: 'Update business profile' },
  { key: 'business:delete', description: 'Delete business' },
  { key: 'member:invite', description: 'Invite a member' },
  { key: 'member:read', description: 'List/read members' },
  { key: 'member:update', description: "Change a member's role/permissions" },
  { key: 'member:remove', description: 'Remove a member' },
  { key: 'settings:read', description: 'Read settings (secrets masked)' },
  { key: 'settings:update', description: 'Write settings' },
  { key: 'settings:read_secret', description: 'Read secret setting values in plaintext' },
  { key: 'audit:read', description: 'Read the audit log' },
  { key: 'consent:read', description: 'Read consents' },
  { key: 'consent:write', description: 'Create / revoke consents' },
  { key: 'lead:read', description: 'Read leads (platform)' },
  { key: 'lead:update', description: 'Triage leads (platform)' },
  { key: 'platform:business:read', description: 'Cross-tenant business read (platform)' },
  { key: 'platform:business:suspend', description: 'Suspend a business (platform)' },
  { key: 'ai:invoke', description: 'Invoke the AI gateway' },
  { key: 'ai:usage:read', description: 'Read AI usage/cost' },
];

async function main() {
  await prisma.business.upsert({
    where: { id: PLATFORM_BUSINESS_ID },
    create: {
      id: PLATFORM_BUSINESS_ID,
      name: 'Inyuku Platform',
      slug: PLATFORM_BUSINESS_ID,
    },
    update: {
      slug: PLATFORM_BUSINESS_ID,
    },
  });
  console.log('[seed] platform-sentinel business ready');

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      create: {
        key: perm.key,
        description: perm.description,
      },
      update: {
        description: perm.description,
      },
    });
  }

  console.log(`[seed] upserted ${PERMISSIONS.length} permissions`);
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
