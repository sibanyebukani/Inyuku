import { randomBytes, createHash } from 'node:crypto';
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
  RateLimitError,
  ValidationError,
} from '../utils/errors.js';
import { auditLog } from '../utils/audit-logger.js';
import { getClientIpFromHeaders } from '../utils/client-ip.js';
import { sendSms } from '../utils/sms.js';
import { checkRateLimit } from '../utils/rate-limit.js';
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

export interface RefreshResult {
  user: SafeUser;
  memberships: AccessMembershipClaim[];
  tokens: AuthTokens;
}

export interface OtpRequestInput {
  phone: string;
  purpose?: string;
}

export interface OtpVerifyInput {
  phone: string;
  code: string;
  purpose?: string;
}

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export async function requestOtp(
  input: OtpRequestInput,
  auditCtx: AuditContext,
): Promise<{ requested: true; expiresInSec: number }> {
  let e164: string;
  try {
    const { toE164ZA } = await import('../utils/sms.js');
    e164 = toE164ZA(input.phone);
  } catch {
    throw new ValidationError('Invalid phone number format');
  }

  // Rate limit: 3 OTP requests per phone per 5 minutes.
  const rate = await checkRateLimit(`otp:${e164}`, 3, 5 * 60 * 1000);
  if (!rate.allowed) {
    throw new RateLimitError('Too many OTP requests');
  }

  const code = generateOtpCode();
  const codeHash = hashOtp(code);
  const user = await prisma.user.findFirst({ where: { phone: e164 } });

  await prisma.phoneOtp.create({
    data: {
      userId: user?.id,
      phone: e164,
      purpose: input.purpose ?? null,
      codeHash,
      expiresAt: nowPlus(OTP_TTL_MS),
    },
  });

  // Best-effort SMS; failure is logged but does not fail the request.
  void sendSms(
    e164,
    `Your Inyuku code is ${code}. It is valid for 5 minutes.`,
  );

  await auditLog({
    ...auditCtx,
    userId: user?.id ?? null,
    entity: 'auth',
    action: 'CREATE',
    entityId: e164,
  });

  return { requested: true, expiresInSec: OTP_TTL_MS / 1000 };
}

export async function verifyOtp(
  input: OtpVerifyInput,
  auditCtx: AuditContext,
): Promise<{ verified: true; tokens?: AuthTokens; user?: SafeUser; memberships?: AccessMembershipClaim[] }> {
  let e164: string;
  try {
    const { toE164ZA } = await import('../utils/sms.js');
    e164 = toE164ZA(input.phone);
  } catch {
    throw new ValidationError('Invalid phone number format');
  }

  const otp = await prisma.phoneOtp.findFirst({
    where: {
      phone: e164,
      purpose: input.purpose ?? null,
      verifiedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new AuthError('AUTH_OTP_INVALID', 'Invalid or expired OTP', 400);
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AuthError('AUTH_OTP_ATTEMPTS', 'Too many OTP attempts', 429);
  }

  if (otp.expiresAt < new Date()) {
    throw new AuthError('AUTH_OTP_EXPIRED', 'OTP expired', 400);
  }

  const valid = hashOtp(input.code) === otp.codeHash;
  if (!valid) {
    await prisma.phoneOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const updated = await prisma.phoneOtp.findUnique({ where: { id: otp.id } });
    if ((updated?.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      throw new AuthError('AUTH_OTP_ATTEMPTS', 'Too many OTP attempts', 429);
    }
    throw new AuthError('AUTH_OTP_INVALID', 'Invalid OTP', 400);
  }

  await prisma.phoneOtp.update({
    where: { id: otp.id },
    data: { verifiedAt: new Date() },
  });

  await auditLog({
    ...auditCtx,
    userId: otp.userId ?? null,
    entity: 'auth',
    action: 'UPDATE',
    entityId: otp.id,
  });

  const authPurpose = input.purpose ?? '';
  if (authPurpose === 'login' || authPurpose === 'signup') {
    if (!otp.userId) {
      throw new AuthError('AUTH_OTP_INVALID', 'No account linked to this phone', 400);
    }
    const user = await prisma.user.findUnique({ where: { id: otp.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw new AuthError('AUTH_ACCOUNT_INACTIVE', 'Account is not active', 403);
    }
    const familyId = `fam_${randomBytes(8).toString('hex')}`;
    const refresh = await createRefreshToken(user.id, familyId);
    const { accessToken, memberships } = await buildAccessToken(
      user.id,
      user.email,
      user.status,
    );
    return {
      verified: true,
      tokens: { accessToken, refreshToken: refresh.token },
      user: toSafeUser(user),
      memberships,
    };
  }

  return { verified: true };
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

export async function refresh(
  rawRefreshToken: string,
  auditCtx: AuditContext,
): Promise<RefreshResult> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!existing) {
    throw new AuthError('AUTH_INVALID_TOKEN', 'Invalid refresh token');
  }

  const now = new Date();

  // Reuse detection: presenting a revoked/rotated token kills the whole family.
  if (existing.revokedAt) {
    await revokeFamily(existing.familyId);
    await auditLog({
      ...auditCtx,
      userId: existing.userId,
      entity: 'refresh_tokens',
      action: 'REVOKE',
      entityId: existing.familyId,
    });
    throw new AuthError(
      'AUTH_REFRESH_REUSE',
      'Refresh token reuse detected; family revoked',
    );
  }

  if (existing.expiresAt < now) {
    // Expired but not yet revoked — revoke it to be tidy.
    await prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    });
    throw new AuthError('AUTH_INVALID_TOKEN', 'Refresh token expired');
  }

  // Rotate: create a new token in the same family and invalidate the old one.
  const { token: newToken, tokenHash: newHash } = generateRefreshToken();
  const newTokenRecord = await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        tokenHash: newHash,
        userId: existing.userId,
        familyId: existing.familyId,
        expiresAt: nowPlus(REFRESH_TTL_MS),
      },
      include: { user: true },
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now, replacedById: created.id },
    });
    return created;
  });

  const { accessToken, memberships } = await buildAccessToken(
    newTokenRecord.userId,
    newTokenRecord.user.email,
    newTokenRecord.user.status,
  );

  await auditLog({
    ...auditCtx,
    userId: newTokenRecord.userId,
    entity: 'auth',
    action: 'REFRESH',
    entityId: newTokenRecord.id,
  });

  return {
    user: toSafeUser(newTokenRecord.user),
    memberships,
    tokens: { accessToken, refreshToken: newToken },
  };
}

export async function logout(
  rawRefreshToken: string,
  auditCtx: AuditContext,
): Promise<void> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  if (existing) {
    await revokeFamily(existing.familyId);
    await auditLog({
      ...auditCtx,
      userId: existing.userId,
      entity: 'auth',
      action: 'LOGOUT',
      entityId: existing.userId,
    });
  }
}

async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      familyId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export function buildAuditContext(req: FastifyRequest): AuditContext {
  return {
    userId: req.user?.sub,
    ipAddress: getClientIpFromHeaders(req.headers),
    userAgent: req.headers['user-agent'] ?? null,
    requestId: req.id,
  };
}
