import { prisma } from '../db.js';
import { encrypt, decrypt, isEncrypted, maskSecret } from '../utils/crypto.js';
import { auditLog } from '../utils/audit-logger.js';

/** Reserved business scope for platform-wide bootstrap settings. */
export const PLATFORM_BUSINESS_ID = 'platform';

export interface SetSettingOptions {
  isSecret?: boolean;
  businessId?: string;
  updatedById?: string;
}

function resolveBusinessId(businessId?: string): string {
  return businessId ?? PLATFORM_BUSINESS_ID;
}

export async function getSetting(
  key: string,
  businessId?: string,
): Promise<string | null> {
  const row = await prisma.setting.findUnique({
    where: { key_businessId: { key, businessId: resolveBusinessId(businessId) } },
  });
  if (!row) return null;

  if (row.isSecret) {
    // Service-level default: never expose plaintext unless caller explicitly
    // requests it via getSecretSetting. The route layer gates `settings:read_secret`.
    const plain = isEncrypted(row.value) ? decrypt(row.value) : row.value;
    return maskSecret(plain);
  }

  return row.value;
}

export async function getSecretSetting(
  key: string,
  businessId?: string,
): Promise<string | null> {
  const row = await prisma.setting.findUnique({
    where: { key_businessId: { key, businessId: resolveBusinessId(businessId) } },
  });
  if (!row) return null;

  if (row.isSecret && isEncrypted(row.value)) {
    return decrypt(row.value);
  }

  return row.value;
}

export async function setSetting(
  key: string,
  value: string,
  opts: SetSettingOptions = {},
) {
  const businessId = resolveBusinessId(opts.businessId);
  const isSecret = opts.isSecret ?? false;

  const existing = await prisma.setting.findUnique({
    where: { key_businessId: { key, businessId } },
  });

  const oldValue = existing
    ? existing.isSecret
      ? maskSecret(isEncrypted(existing.value) ? decrypt(existing.value) : existing.value)
      : existing.value
    : null;

  const storedValue = isSecret && !isEncrypted(value) ? encrypt(value) : value;

  const setting = await prisma.setting.upsert({
    where: { key_businessId: { key, businessId } },
    create: {
      key,
      value: storedValue,
      isSecret,
      businessId,
    },
    update: {
      value: storedValue,
      isSecret,
    },
  });

  void auditLog({
    userId: opts.updatedById ?? null,
    businessId,
    entity: 'settings',
    action: 'UPDATE',
    entityId: key,
    changes: {
      value: { old: oldValue, new: isSecret ? maskSecret(value) : value },
      isSecret: { old: existing?.isSecret ?? null, new: isSecret },
    },
  });

  return setting;
}
