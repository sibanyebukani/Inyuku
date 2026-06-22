'use client';

import { useCallback, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SessionProvider, useSession } from '@/lib/session/SessionProvider';
import { registerSyncTriggers } from '@/lib/offline/triggers';
import { useOnline } from '@/lib/offline/useOnline';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/products', label: 'Products' },
  { href: '/orders', label: 'Orders' },
  { href: '/customers', label: 'Customers' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/onboarding', label: 'Onboarding' },
];

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`block rounded px-3 py-2 text-sm font-medium ${
        active ? 'bg-emerald-100 text-emerald-800' : 'text-gray-700 hover:bg-gray-100'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

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
      <nav aria-label="Merchant" className="mb-6">
        <ul className="flex flex-wrap gap-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <NavLink href={item.href} label={item.label} />
            </li>
          ))}
        </ul>
      </nav>
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
