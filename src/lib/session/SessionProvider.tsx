'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMe, type MeResponse } from '@/lib/auth';

interface SessionValue {
  user: MeResponse['user'];
  memberships: MeResponse['memberships'];
  activeBusinessId: string;
  hasPerm: (permission: string) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}

export function SessionProvider({
  children,
  onUnauthenticated,
  fallback = null,
}: {
  children: ReactNode;
  onUnauthenticated?: () => void;
  fallback?: ReactNode;
}) {
  const [value, setValue] = useState<SessionValue | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        const active = me.memberships[0];
        const perms = new Set(active?.permissions ?? []);
        setValue({
          user: me.user,
          memberships: me.memberships,
          activeBusinessId: active?.businessId ?? '',
          hasPerm: (p) => perms.has(p),
        });
      })
      .catch(() => {
        if (!cancelled) onUnauthenticated?.();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onUnauthenticated]);

  if (loading || !value) return <>{fallback}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
