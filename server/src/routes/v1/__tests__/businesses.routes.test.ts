import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';
import {
  createTestUser,
  createTestBusiness,
  createTestMembership,
  mintAccessToken,
  cleanupTestUsers,
  cleanupTestBusinesses,
} from '../../../test-helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterEach(async () => {
  await cleanupTestUsers([
    'owner-a@inyuku.test',
    'owner-b@inyuku.test',
    'staff-a@inyuku.test',
    'me-test@inyuku.test',
    'known-invitee@inyuku.test',
    'unknown-invitee@inyuku.test',
  ]);
  await cleanupTestBusinesses(['Business A', 'Business B']);
});

describe('business routes', () => {
  it('GET /v1/auth/me returns user and memberships', async () => {
    const user = await createTestUser({ email: 'me-test@inyuku.test' });
    const business = await createTestBusiness({ name: 'Business A' });
    await createTestMembership({ userId: user.id, businessId: business.id, role: 'MERCHANT_OWNER' });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: business.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });
    const r = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      cookies: { inyuku_at: token },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.data.user.email).toBe('me-test@inyuku.test');
    expect(body.data.memberships.length).toBe(1);
  });

  it('owner can patch their business', async () => {
    const user = await createTestUser({ email: 'owner-a@inyuku.test' });
    const business = await createTestBusiness({ name: 'Business A' });
    await createTestMembership({ userId: user.id, businessId: business.id, role: 'MERCHANT_OWNER' });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: business.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${business.id}`,
      cookies: { inyuku_at: token },
      payload: { name: 'Business A Updated' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.business.name).toBe('Business A Updated');
  });

  it('owner cannot patch another business (403)', async () => {
    const user = await createTestUser({ email: 'owner-a@inyuku.test' });
    const businessA = await createTestBusiness({ name: 'Business A' });
    const businessB = await createTestBusiness({ name: 'Business B' });
    await createTestMembership({ userId: user.id, businessId: businessA.id, role: 'MERCHANT_OWNER' });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: businessA.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${businessB.id}`,
      cookies: { inyuku_at: token },
      payload: { name: 'Hacked' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('settings secrets are masked unless caller has settings:read_secret', async () => {
    const user = await createTestUser({ email: 'owner-a@inyuku.test' });
    const business = await createTestBusiness({ name: 'Business A' });
    await createTestMembership({ userId: user.id, businessId: business.id, role: 'MERCHANT_OWNER' });
    const token = await mintAccessToken({
      userId: user.id,
      email: user.email,
      memberships: [{ businessId: business.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/businesses/${business.id}/settings`,
      cookies: { inyuku_at: token },
      payload: { settings: [{ key: 'email.resend.apiKey', value: 'secret-key', isSecret: true }] },
    });
    expect(patch.statusCode).toBe(200);

    const read = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${business.id}/settings`,
      cookies: { inyuku_at: token },
    });
    expect(read.statusCode).toBe(200);
    const secret = read.json().data.settings.find((s: { key: string }) => s.key === 'email.resend.apiKey');
    expect(secret.value).not.toBe('secret-key');
    expect(secret.value).not.toBe('secret-key');
    expect(secret.value.length).toBeGreaterThan(0);

    // Grant explicit read_secret permission.
    const staffUser = await createTestUser({ email: 'staff-a@inyuku.test' });
    await createTestMembership({
      userId: staffUser.id,
      businessId: business.id,
      role: 'MERCHANT_STAFF',
      permissions: ['settings:read', 'settings:update', 'settings:read_secret'],
    });
    const staffToken = await mintAccessToken({
      userId: staffUser.id,
      email: staffUser.email,
      memberships: [
        {
          businessId: business.id,
          role: 'MERCHANT_STAFF',
          permissions: ['settings:read', 'settings:update', 'settings:read_secret'],
        },
      ],
    });
    const read2 = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${business.id}/settings`,
      cookies: { inyuku_at: staffToken },
    });
    const secret2 = read2.json().data.settings.find((s: { key: string }) => s.key === 'email.resend.apiKey');
    expect(secret2.value).toBe('secret-key');
  });

  it('member invite returns uniform response and does not enumerate accounts', async () => {
    const owner = await createTestUser({ email: 'owner-a@inyuku.test' });
    const known = await createTestUser({ email: 'known-invitee@inyuku.test' });
    const business = await createTestBusiness({ name: 'Business A' });
    await createTestMembership({ userId: owner.id, businessId: business.id, role: 'MERCHANT_OWNER' });
    const token = await mintAccessToken({
      userId: owner.id,
      email: owner.email,
      memberships: [{ businessId: business.id, role: 'MERCHANT_OWNER', permissions: [] }],
    });

    const knownInvite = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${business.id}/members`,
      cookies: { inyuku_at: token },
      payload: { email: 'known-invitee@inyuku.test', role: 'MERCHANT_STAFF' },
    });
    const unknownInvite = await app.inject({
      method: 'POST',
      url: `/v1/businesses/${business.id}/members`,
      cookies: { inyuku_at: token },
      payload: { email: 'unknown-invitee@inyuku.test', role: 'MERCHANT_STAFF' },
    });

    expect(knownInvite.statusCode).toBe(200);
    expect(unknownInvite.statusCode).toBe(200);
    expect(knownInvite.json()).toMatchObject({ ok: true, data: { invited: true } });
    expect(unknownInvite.json()).toMatchObject({ ok: true, data: { invited: true } });

    const members = await app.inject({
      method: 'GET',
      url: `/v1/businesses/${business.id}/members`,
      cookies: { inyuku_at: token },
    });
    const emails = members.json().data.members.map((m: { user: { email: string } }) => m.user.email);
    expect(emails).toContain('known-invitee@inyuku.test');
    expect(emails).not.toContain('unknown-invitee@inyuku.test');
  });
});
