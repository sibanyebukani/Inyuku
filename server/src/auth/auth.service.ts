import { randomBytes } from 'node:crypto';
import { Prisma, MembershipRole } from '@prisma/client';
import { prisma } from '../db.js';
import { comparePassword, hashPassword, validatePasswordStrength } from '../utils/password.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  type AccessMembershipClaim,
} from '../utils/jwt.js';
import {
  AuthError,
  ConflictError,
  ValidationError,
} from '../utils/errors.js';
import { auditLog } from '../utils/audit-logger.js';
import { getClientIpFromHeaders } from '../utils/client-ip.js';
import type { AuditContext } from '../types/fastify.d.js';
import type { FastifyRequest } from 'fastify';

// Pre-computed dummy hash so unknown-email login performs a bcrypt compare.
const DUMMY_HASH = await hashPassword('dummy-password-constant-time-compare');

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  phone?: string | null;
  businessName: string;
  acceptTerms: boolean;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SignupResult {
  user: SafeUser;
  business: { id: string; name: string; slug: string | null };
  membership: { id: string; role: MembershipRole };
  tokens: AuthTokens;
}

export interface LoginResult {
  user: SafeUser;
  memberships: AccessMembershipClaim[];
  tokens: AuthTokens;
}

function toSafeUser(user: { id: string; email: string; name: string; phone: string | null; status: string }): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    status: user.status,
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base}-${randomBytes(4).toString('hex')}`;
}

function nowPlus(ms: number): Date {
  return new Date(Date.now() + ms);
}

function lockoutDuration(attempts: number): number {
  if (attempts >= 20) return 24 * 60 * 60 * 1000;
  if (attempts >= 10) return 60 * 60 * 1000;
  if (attempts >= 5) return 15 * 60 * 1000;
  return 0;
}

async function createRefreshToken(
  userId: string,
  familyId: string,
): Promise<{ token: string; tokenHash: string }> {
  const { token, tokenHash } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId,
      familyId,
      expiresAt: nowPlus(REFRESH_TTL_MS),
    },
  });
  return { token, tokenHash };
}

async function buildAccessToken(userId: string, email: string, status: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { business: { select: { id: true } } },
  });
  const claims: AccessMembershipClaim[] = memberships.map((m) => ({
    businessId: m.businessId,
    role: m.role,
    permissions: m.permissions ?? [],
  }));
  const accessToken = await signAccessToken({
    sub: userId,
    email,
    status,
    memberships: claims,
  });
  return { accessToken, memberships: claims };
}

export async function signup(
  input: SignupInput,
  auditCtx: AuditContext,
): Promise<SignupResult> {
  if (!input.acceptTerms) {
    throw new ValidationError('Terms must be accepted');
  }
  const passwordCheck = validatePasswordStrength(input.password);
  if (!passwordCheck.valid) {
    throw new ValidationError('Password does not meet requirements', {
      errors: passwordCheck.errors,
    });
  }

  const passwordHash = await hashPassword(input.password);
  const slug = slugify(input.businessName);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase().trim(),
          name: input.name.trim(),
          phone: input.phone?.trim() ?? null,
          passwordHash,
        },
      });
      const business = await tx.business.create({
        data: {
          name: input.businessName.trim(),
          slug,
        },
      });
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          businessId: business.id,
          role: 'MERCHANT_OWNER',
          permissions: [],
        },
      });
      return { user, business, membership };
    });

    const familyId = `fam_${randomBytes(8).toString('hex')}`;
    const refresh = await createRefreshToken(result.user.id, familyId);
    const { accessToken } = await buildAccessToken(
      result.user.id,
      result.user.email,
      result.user.status,
    );

    await auditLog({
      ...auditCtx,
      userId: result.user.id,
      businessId: result.business.id,
      entity: 'auth',
      action: 'SIGNUP',
      entityId: result.user.id,
    });
    await auditLog({
      ...auditCtx,
      userId: result.user.id,
      businessId: result.business.id,
      entity: 'users',
      action: 'CREATE',
      entityId: result.user.id,
      changes: {
        email: { old: null, new: result.user.email },
        name: { old: null, new: result.user.name },
      },
    });
    await auditLog({
      ...auditCtx,
      userId: result.user.id,
      businessId: result.business.id,
      entity: 'auth',
      action: 'LOGIN',
      entityId: result.user.id,
    });

    return {
      user: toSafeUser(result.user),
      business: {
        id: result.business.id,
        name: result.business.name,
        slug: result.business.slug,
      },
      membership: { id: result.membership.id, role: result.membership.role },
      tokens: { accessToken, refreshToken: refresh.token },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('Email already registered');
    }
    throw err;
  }
}

export async function login(
  input: LoginInput,
  auditCtx: AuditContext,
): Promise<LoginResult> {
  const email = input.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-time path: always perform a bcrypt compare, even for unknown emails.
  const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
  const passwordValid = await comparePassword(input.password, hashToCompare);

  if (!user || !passwordValid) {
    if (user) {
      const attempts = user.failedAttempts + 1;
      const lockMs = lockoutDuration(attempts);
      const lockedUntil = lockMs > 0 ? nowPlus(lockMs) : user.lockedUntil;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: attempts,
          lockedUntil,
        },
      });
      await auditLog({
        ...auditCtx,
        userId: user.id,
        entity: 'auth',
        action: 'LOGIN_FAILED',
        entityId: user.id,
      });
      if (lockedUntil && lockedUntil > new Date()) {
        throw new AuthError(
          'AUTH_ACCOUNT_LOCKED',
          'Account is temporarily locked',
          403,
        );
      }
    }
    throw new AuthError('AUTH_INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AuthError(
      'AUTH_ACCOUNT_LOCKED',
      'Account is temporarily locked',
      403,
    );
  }

  if (user.status !== 'ACTIVE') {
    throw new AuthError(
      'AUTH_ACCOUNT_INACTIVE',
      'Account is not active',
      403,
    );
  }

  // Successful login: clear failed attempts.
  if (user.failedAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }

  const familyId = `fam_${randomBytes(8).toString('hex')}`;
  const refresh = await createRefreshToken(user.id, familyId);
  const { accessToken, memberships } = await buildAccessToken(
    user.id,
    user.email,
    user.status,
  );

  await auditLog({
    ...auditCtx,
    userId: user.id,
    entity: 'auth',
    action: 'LOGIN',
    entityId: user.id,
  });

  return {
    user: toSafeUser(user),
    memberships,
    tokens: { accessToken, refreshToken: refresh.token },
  };
}

export function buildAuditContext(req: FastifyRequest): AuditContext {
  return {
    userId: req.user?.sub,
    ipAddress: getClientIpFromHeaders(req.headers),
    userAgent: req.headers['user-agent'] ?? null,
    requestId: req.id,
  };
}
