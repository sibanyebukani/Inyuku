'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SessionProvider, useSession } from '@/lib/session/SessionProvider';
import { registerSyncTriggers } from '@/lib/offline/triggers';
import { useOnline } from '@/lib/offline/useOnline';

function MerchantShell({ children }: { children: React.ReactNode }) {
  const { activeBusinessId } = useSession();
  const online = useOnline();

  useEffect(() => {
    if (!activeBusinessId) return;
    return registerSyncTriggers(activeBusinessId);
  }, [activeBusinessId]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className={`mb-4 rounded px-3 py-1 text-sm ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
        {online ? 'Online' : 'Offline — changes will sync when you reconnect'}
      </div>
      {children}
    </div>
  );
}

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Stabilise the callback so SessionProvider's getMe() effect does not re-fire
  // on every render (router reference changes each render in Next.js App Router).
  const onUnauthenticated = useCallback(() => router.push('/login'), [router]);
  return (
    <SessionProvider
      onUnauthenticated={onUnauthenticated}
      fallback={<div className="p-8 text-center text-gray-500">Loading…</div>}
    >
      <MerchantShell>{children}</MerchantShell>
    </SessionProvider>
  );
}
