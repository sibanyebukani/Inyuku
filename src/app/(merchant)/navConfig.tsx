import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  MessageCircle,
  Users,
  Boxes,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Presentational grouping only — the flat item order (Dashboard, Products, Orders,
 * WhatsApp, Customers, Inventory, Onboarding) matches the pre-redesign nav exactly and
 * is asserted by layout.test.tsx. WhatsApp stays ungrouped/prominent as the MVP's
 * flagship surface, not folded under a generic label.
 */
export const navGroups: NavGroup[] = [
  { label: null, items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Sell',
    items: [
      { href: '/products', label: 'Products', icon: Package },
      { href: '/orders', label: 'Orders', icon: ShoppingCart },
    ],
  },
  { label: null, items: [{ href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle }] },
  { label: 'Customers', items: [{ href: '/customers', label: 'Customers', icon: Users }] },
  { label: 'Stock', items: [{ href: '/inventory', label: 'Inventory', icon: Boxes }] },
  { label: 'Setup', items: [{ href: '/onboarding', label: 'Onboarding', icon: ClipboardList }] },
];
