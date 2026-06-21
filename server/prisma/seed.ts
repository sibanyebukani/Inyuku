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
  // M2 commerce permissions
  { key: 'catalog:read', description: 'Read products' },
  { key: 'catalog:write', description: 'Create/update/archive products + image' },
  { key: 'catalog:read_cost', description: 'Owner-only — read costPriceCents / margin' },
  { key: 'inventory:read', description: 'Read stock levels' },
  { key: 'inventory:write', description: 'Post stock movements' },
  { key: 'order:read', description: 'Read orders' },
  { key: 'order:write', description: 'Create/complete/void orders, set payment state' },
  { key: 'customer:read', description: 'Read customer directory' },
  { key: 'customer:write', description: 'Create/update customers' },
  { key: 'dashboard:read', description: 'Read the dashboard (non-financial)' },
  { key: 'dashboard:read_financial', description: 'Owner-only — financial dashboard fields' },
  { key: 'sync:write', description: 'Submit batch sync' },
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

  const AI_SETTINGS = [
    { key: 'ai.enabled', value: 'false' },
    { key: 'ai.tier.classify', value: 'claude-3-haiku-20240307' },
    { key: 'ai.tier.agent', value: 'claude-3-5-sonnet-20240620' },
    { key: 'ai.tier.complex', value: 'claude-3-opus-20240229' },
  ];

  for (const s of AI_SETTINGS) {
    await prisma.setting.upsert({
      where: { key_businessId: { key: s.key, businessId: PLATFORM_BUSINESS_ID } },
      create: {
        key: s.key,
        value: s.value,
        isSecret: false,
        businessId: PLATFORM_BUSINESS_ID,
      },
      update: { value: s.value, isSecret: false },
    });
  }
  console.log(`[seed] upserted ${AI_SETTINGS.length} AI governance settings`);
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
