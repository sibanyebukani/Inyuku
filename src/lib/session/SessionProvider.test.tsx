// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from './SessionProvider';
import * as auth from '@/lib/auth';

const ME = {
  user: { id: 'u1', email: 'a@b.c', name: 'Nomsa', phone: null, status: 'ACTIVE' },
  memberships: [{ businessId: 'biz1', role: 'MERCHANT_OWNER', permissions: ['catalog:read', 'catalog:read_cost'] }],
};

function Probe() {
  const { activeBusinessId, hasPerm } = useSession();
  return (
    <div>
      <span>biz:{activeBusinessId}</span>
      <span>cost:{String(hasPerm('catalog:read_cost'))}</span>
      <span>write:{String(hasPerm('catalog:write'))}</span>
    </div>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('loads the session and exposes activeBusinessId + hasPerm', async () => {
    vi.spyOn(auth, 'getMe').mockResolvedValueOnce(ME);
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(screen.getByText('biz:biz1')).toBeInTheDocument());
    expect(screen.getByText('cost:true')).toBeInTheDocument();
    expect(screen.getByText('write:false')).toBeInTheDocument();
  });

  it('invokes onUnauthenticated when getMe fails', async () => {
    vi.spyOn(auth, 'getMe').mockRejectedValueOnce(new Error('401'));
    const onUnauth = vi.fn();
    render(<SessionProvider onUnauthenticated={onUnauth}><Probe /></SessionProvider>);
    await waitFor(() => expect(onUnauth).toHaveBeenCalledTimes(1));
  });
});
