'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Sun, Moon, ChevronDown, LogOut, PanelLeftClose, PanelLeft } from 'lucide-react';
import { SessionProvider, useSession } from '@/lib/session/SessionProvider';
import { registerSyncTriggers } from '@/lib/offline/triggers';
import { useOnline } from '@/lib/offline/useOnline';
import { useWhatsAppUnread } from '@/lib/whatsapp/useUnread';
import { logout } from '@/lib/auth';
import { useDarkMode } from '@/lib/theme/useDarkMode';
import { useSidebarExpanded } from '@/lib/layout/useSidebarExpanded';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { navGroups, type NavItem } from './navConfig';

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  badge,
  expanded,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={!expanded ? item.label : undefined}
      className={cn(
        'flex items-center h-11 rounded-lg transition-colors',
        expanded ? 'px-3 gap-3' : 'justify-center px-0',
        active
          ? 'bg-accent-orange/10 dark:bg-accent-orange/20 text-accent-orange-dark dark:text-accent-orange'
          : 'text-text-secondary dark:text-neutral-400 hover:bg-cream dark:hover:bg-neutral-800',
      )}
    >
      <span className="relative flex-shrink-0">
        <Icon className="h-5 w-5" />
        {!expanded && badge != null && badge > 0 && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent-orange" />
        )}
      </span>
      {expanded && (
        <span className="text-sm font-medium flex items-center gap-1.5 truncate">
          {item.label}
          {badge != null && badge > 0 && (
            <span
              aria-label={`${badge} waiting for reply`}
              className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-accent-orange px-1.5 text-xs font-semibold text-white"
            >
              {badge}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

function NavGroups({
  expanded,
  whatsAppUnread,
  onNavigate,
}: {
  expanded: boolean;
  whatsAppUnread: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <>
      {navGroups.map((group, i) => (
        <div key={group.label ?? `g${i}`}>
          {group.label && expanded && (
            <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {group.label}
            </p>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActivePath(pathname, item.href)}
              badge={item.href === '/whatsapp' ? whatsAppUnread : undefined}
              expanded={expanded}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function UserMenu({
  name,
  email,
  onLogout,
}: {
  name: string;
  email: string;
  onLogout: () => void | Promise<void>;
}) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <DropdownMenu
      side="up"
      trigger={
        <button className="flex w-full items-center gap-3 px-3 h-14 hover:bg-cream dark:hover:bg-neutral-800 transition-colors">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-orange/10 dark:bg-accent-orange/20 text-sm font-medium text-accent-orange-dark dark:text-accent-orange">
            {initials}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium text-text-primary dark:text-neutral-100">{name}</span>
            <span className="block truncate text-xs text-text-muted">{email}</span>
          </span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-text-muted" />
        </button>
      }
    >
      <button
        onClick={() => {
          // handleLogout always redirects (see its own try/finally), but its
          // promise still rejects on failure — swallow here so a fire-and-forget
          // click handler never surfaces an unhandled promise rejection.
          Promise.resolve(onLogout()).catch(() => {});
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>
    </DropdownMenu>
  );
}

function MerchantShell({ children }: { children: React.ReactNode }) {
  const { activeBusinessId, user } = useSession();
  const router = useRouter();
  const online = useOnline();
  const whatsAppUnread = useWhatsAppUnread();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const { expanded, toggle: toggleExpanded } = useSidebarExpanded();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!activeBusinessId) return;
    return registerSyncTriggers(activeBusinessId);
  }, [activeBusinessId]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      router.push('/login');
    }
  }, [router]);

  const mobileTabItems = navGroups.flatMap((g) => g.items).slice(0, 4);

  return (
    <div className="min-h-screen bg-cream dark:bg-neutral-950">
      <div
        className={cn(
          'px-3 py-1 text-center text-xs transition-all duration-300',
          expanded ? 'lg:ml-64' : 'lg:ml-16',
          online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
        )}
      >
        {online ? 'Online' : 'Offline — changes will sync when you reconnect'}
      </div>

      {/* Mobile top bar */}
      <nav
        aria-label="Merchant mobile top"
        className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border-light dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur px-4"
      >
        <span className="text-lg font-extrabold tracking-tight text-text-primary dark:text-neutral-100">Inyuku</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-md hover:bg-cream dark:hover:bg-neutral-800"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="p-2 rounded-md hover:bg-cream dark:hover:bg-neutral-800"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </nav>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed top-0 left-0 h-screen z-30 border-r border-border-light dark:border-neutral-800 bg-white dark:bg-neutral-900 transition-all duration-300',
          expanded ? 'w-64' : 'w-16',
        )}
      >
        <div className="flex h-16 items-center px-4 border-b border-border-light dark:border-neutral-800 flex-shrink-0">
          {expanded && <span className="text-xl font-extrabold tracking-tight text-text-primary dark:text-neutral-100">Inyuku</span>}
        </div>

        <button
          onClick={toggleExpanded}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="flex items-center h-10 mx-2 mt-2 rounded-md text-text-muted hover:bg-cream dark:hover:bg-neutral-800 flex-shrink-0"
        >
          {expanded ? <PanelLeftClose className="h-5 w-5 mx-3" /> : <PanelLeft className="h-5 w-5 mx-auto" />}
        </button>

        <nav aria-label="Merchant" className="flex-1 overflow-y-auto mt-2 px-2 space-y-1 min-h-0">
          <NavGroups expanded={expanded} whatsAppUnread={whatsAppUnread} />
        </nav>

        <div className="px-2 mb-2 flex-shrink-0">
          <button
            onClick={toggleDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={cn(
              'flex items-center h-10 w-full rounded-lg text-text-muted hover:bg-cream dark:hover:bg-neutral-800',
              expanded ? 'px-3 gap-3' : 'justify-center px-0',
            )}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {expanded && <span className="text-sm font-medium">{isDark ? 'Light mode' : 'Dark mode'}</span>}
          </button>
        </div>

        <div className="border-t border-border-light dark:border-neutral-800 flex-shrink-0">
          <UserMenu name={user?.name ?? '—'} email={user?.email ?? ''} onLogout={handleLogout} />
        </div>
      </aside>

      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <div className="flex h-14 items-center justify-between px-4 border-b border-border-light dark:border-neutral-800">
          <span className="text-lg font-extrabold tracking-tight text-text-primary dark:text-neutral-100">Inyuku</span>
          <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-2 rounded-md hover:bg-cream dark:hover:bg-neutral-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label="Merchant menu" className="px-2 py-2 space-y-1">
          <NavGroups expanded whatsAppUnread={whatsAppUnread} onNavigate={() => setMobileOpen(false)} />
        </nav>
      </Sheet>

      <div
        className={cn(
          'px-4 py-6 pb-20 lg:pb-8 transition-all duration-300',
          expanded ? 'lg:ml-64' : 'lg:ml-16',
        )}
      >
        {children}
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Merchant mobile tabs"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-border-light dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 backdrop-blur"
      >
        {mobileTabItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-medium',
                active ? 'text-accent-orange-dark dark:text-accent-orange' : 'text-text-muted',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
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
