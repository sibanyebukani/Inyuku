import { postJson, getJson } from './api-client';

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

export interface MeResponse {
  user: SafeUser;
  memberships: { businessId: string; role: string; permissions: string[] }[];
}

export async function login(input: LoginInput): Promise<{ user: SafeUser }> {
  const data = await postJson<{ user: SafeUser; memberships: MeResponse['memberships'] }>(
    '/v1/auth/login',
    input,
  );
  return { user: data.user };
}

export async function logout(): Promise<void> {
  await postJson('/v1/auth/logout', {});
}

export async function getMe(): Promise<MeResponse> {
  return getJson<MeResponse>('/v1/auth/me');
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  phone?: string;
  businessName: string;
  acceptTerms: boolean;
}

export interface SignupResult {
  user: SafeUser;
  business: { id: string; name: string; slug: string };
  membership: { id: string; role: string };
}

export async function signup(input: SignupInput): Promise<SignupResult> {
  return postJson<SignupResult>('/v1/auth/signup', input);
}
