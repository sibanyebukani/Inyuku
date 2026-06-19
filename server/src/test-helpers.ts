import { prisma } from './db.js';
import { hashPassword } from './utils/password.js';
import { signAccessToken } from './utils/jwt.js';
import type { MembershipRole } from '@prisma/client';

export async function createTestUser(input: {
  email: string;
  name?: string;
  password?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
}) {
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : await hashPassword('Password123!');
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name ?? 'Test User',
      passwordHash,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function createTestBusiness(input: { name: string; slug?: string }) {
  return prisma.business.create({
    data: {
      name: input.name,
      slug: input.slug,
    },
  });
}

export async function createTestMembership(input: {
  userId: string;
  businessId: string;
  role: MembershipRole;
  permissions?: string[];
}) {
  return prisma.membership.create({
    data: {
      userId: input.userId,
      businessId: input.businessId,
      role: input.role,
      permissions: input.permissions ?? [],
    },
    include: { business: true },
  });
}

export async function mintAccessToken(input: {
  userId: string;
  email: string;
  status?: string;
  memberships: { businessId: string; role: string; permissions: string[] }[];
}) {
  return signAccessToken({
    sub: input.userId,
    email: input.email,
    status: input.status ?? 'ACTIVE',
    memberships: input.memberships,
  });
}

export async function cleanupTestUsers(emails: string[]) {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

export async function cleanupTestBusinesses(names: string[]) {
  await prisma.business.deleteMany({ where: { name: { in: names } } });
}
