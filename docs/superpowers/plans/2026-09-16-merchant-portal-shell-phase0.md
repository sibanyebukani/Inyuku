# Merchant Portal Shell — Phase 0 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable UI primitives, the redesigned merchant-portal shell (collapsible
grouped sidebar, dark mode, mobile nav, user menu), and the login/signup pages — with zero
changes to any existing merchant page's content and zero backend changes.

**Architecture:** Hand-rolled Tailwind components (no Radix/shadcn CLI) using `lucide-react`
icons and `framer-motion` for interactive motion, built on Inyuku's existing (currently unused)
shadcn-shaped CSS token scaffold. Each primitive is a standalone, independently testable unit
under `src/components/ui/`; two tiny hooks own persisted UI state; the shell composes all of it
in a rewritten `src/app/(merchant)/layout.tsx`.

**Tech Stack:** Next.js 15 (App Router) / React 19 / TypeScript ~5.9 / Tailwind 3.4 /
`lucide-react` (already installed) / `framer-motion` (already installed) / `clsx` +
`tailwind-merge` (new, this phase) / Vitest + Testing Library (already installed).

**Spec:** `docs/superpowers/specs/2026-09-16-merchant-portal-shell-design.md`

## Global Constraints

- No new brand colors, no new font — reuse `tailwind.config.js`'s existing `cream`,
  `accent-orange`, `accent-orange-dark`, `accent-green`, `text-primary`, `text-secondary`,
  `text-muted`, `border-light` tokens and `Inter` only.
- No Radix, no shadcn CLI, no `class-variance-authority`. Only new dependencies: `clsx`,
  `tailwind-merge`.
- Dark-mode `dark:` variants are written **only** inside `src/app/(merchant)/`,
  `src/components/ui/`, `src/app/login/`, and `src/app/signup/`. Never touch
  `tailwind.config.js`'s color token *values* and never add a `dark:` class to any marketing
  page file.
- The 7 nav items keep their exact current relative order: Dashboard, Products, Orders,
  WhatsApp, Customers, Inventory, Onboarding.
- No existing merchant page content file (`(merchant)/{dashboard,products,orders,whatsapp,
  customers,inventory,onboarding}/**`) is created, modified, or imported into in a way that
  changes its behavior. Phase 0 touches only the layout wrapper around them.
- No backend/API changes. Consume `/v1/auth/login`, `/v1/auth/signup`, `/v1/auth/me`,
  `/v1/auth/logout` exactly as they exist today.
- Match each file's existing quote/semicolon convention on sight: `src/app/login/page.tsx` has
  no semicolons (marketing-style) — keep it that way. `src/app/signup/page.tsx` (Task 13) is a
  new file but pairs directly with `login/page.tsx` as the auth-page pair (same composition, same
  directory pattern) and matches its no-semicolon style rather than the rule below. Every other
  new/rewritten file in this plan uses semicolons, matching `(merchant)/`, `src/lib/`, and
  `src/components/PaymentToggle.tsx`.
- New component tests need `// @vitest-environment jsdom` as the first line (project default
  test environment is `node`).

---

## Task 1: `cn()` className utility

**Files:**
- Create: `src/lib/utils.ts`
- Test: `src/lib/utils.test.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` — used by every component in Tasks 2–10.

- [ ] **Step 1: Add dependencies**

```bash
npm install clsx tailwind-merge
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/utils.test.ts
import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins plain class strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c');
  });

  it('lets a later conflicting Tailwind class win', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: FAIL — `Cannot find module './utils'`

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins conditional class names and resolves conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/utils.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/utils.ts src/lib/utils.test.ts
git commit -m "feat(ui): add cn() className utility"
```

---

## Task 2: Button primitive

**Files:**
- Create: `src/components/ui/button.tsx`
- Test: `src/components/ui/button.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils` (Task 1).
- Produces: `Button` — a `React.forwardRef<HTMLButtonElement, ButtonProps>` component.
  `ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>` plus
  `{ variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'; size?: 'sm' | 'md' | 'icon' }`.
  Default `variant='primary'`, `size='md'`. Consumed by Tasks 11–13.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/button.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders children and forwards a click handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the destructive variant class', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-red-600');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('merges a caller className without losing base classes', () => {
    render(<Button className="w-full">Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toContain('w-full');
    expect(btn.className).toContain('rounded-lg');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/button.test.tsx`
Expected: FAIL — `Cannot find module './button'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/button.tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'icon';
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-accent-orange text-white hover:bg-accent-orange-dark',
  secondary:
    'bg-white dark:bg-neutral-800 border border-border-light dark:border-neutral-700 text-text-primary dark:text-neutral-100 hover:bg-cream dark:hover:bg-neutral-700',
  ghost:
    'bg-transparent text-text-primary dark:text-neutral-100 hover:bg-cream dark:hover:bg-neutral-800',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
};

const SIZE_CLASSES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  icon: 'h-10 w-10 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/button.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/button.test.tsx
git commit -m "feat(ui): add Button primitive"
```

---

## Task 3: Card primitive

**Files:**
- Create: `src/components/ui/card.tsx`
- Test: `src/components/ui/card.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Card`, `CardHeader`, `CardTitle`, `CardContent` — each
  `React.HTMLAttributes<HTMLDivElement>` (or `HTMLHeadingElement` for `CardTitle`) plain
  function components accepting `className` + `children`. Consumed by Tasks 11–13.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/card.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardContent } from './card';

describe('Card', () => {
  it('composes header, title, and content', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Shop settings</CardTitle>
        </CardHeader>
        <CardContent>Body text</CardContent>
      </Card>,
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shop settings' })).toBeInTheDocument();
    expect(screen.getByText('Body text')).toBeInTheDocument();
  });

  it('merges a caller className onto Card', () => {
    render(<Card className="mt-4" data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('mt-4');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/card.test.tsx`
Expected: FAIL — `Cannot find module './card'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/card.tsx
import type { HTMLAttributes, HTMLAttributes as HeadingAttrs } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border-light dark:border-neutral-700 bg-white dark:bg-neutral-800',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HeadingAttrs<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-semibold text-text-primary dark:text-neutral-100', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/card.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/card.test.tsx
git commit -m "feat(ui): add Card primitive"
```

---

## Task 4: Input primitive

**Files:**
- Create: `src/components/ui/input.tsx`
- Test: `src/components/ui/input.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Input` — `React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>`.
  Consumed by Tasks 12–13.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/input.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input', () => {
  it('accepts typed input and reports changes', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Email" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Email')).toHaveValue('a@b.com');
  });

  it('forwards a ref to the underlying input element', () => {
    let node: HTMLInputElement | null = null;
    render(
      <Input
        aria-label="Email"
        ref={(el) => {
          node = el;
        }}
      />,
    );
    expect(node).toBeInstanceOf(HTMLInputElement);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/input.test.tsx`
Expected: FAIL — `Cannot find module './input'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/input.tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-12 px-4 rounded-lg text-[15px] bg-cream dark:bg-neutral-900 border border-border-light dark:border-neutral-700 text-text-primary dark:text-neutral-100 outline-none transition-shadow duration-150 focus:ring-2 focus:ring-accent-orange disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/input.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/input.test.tsx
git commit -m "feat(ui): add Input primitive"
```

---

## Task 5: Select primitive

**Files:**
- Create: `src/components/ui/select.tsx`
- Test: `src/components/ui/select.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Select` — `React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>`,
  native `<select>`. Not consumed anywhere in Phase 0 (no page content changes) — built now so
  Phase 1+ has it, and to lock in the regression test below.

**Note:** this session's browser testing of the *existing* order-capture form hit a real bug
class: setting a controlled `<select>`'s value via the plain DOM `.value` setter doesn't notify
React (React tracks the previous value internally and swallows the resulting `change` event).
The test below asserts the primitive works correctly when driven the way Testing Library's
`userEvent.selectOptions` drives it (which goes through the proper input event path), guarding
against ever "fixing" this component in a way that breaks controlled usage.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/select.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './select';

describe('Select', () => {
  it('reports the selected option on change', async () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Product" onChange={onChange}>
        <option value="">Select product</option>
        <option value="p1">White Bread Loaf</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Product'), 'p1');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Product')).toHaveValue('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/select.test.tsx`
Expected: FAIL — `Cannot find module './select'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/select.tsx
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full h-12 px-4 rounded-lg text-[15px] bg-cream dark:bg-neutral-900 border border-border-light dark:border-neutral-700 text-text-primary dark:text-neutral-100 outline-none transition-shadow duration-150 focus:ring-2 focus:ring-accent-orange disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/select.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/select.tsx src/components/ui/select.test.tsx
git commit -m "feat(ui): add Select primitive"
```

---

## Task 6: Badge primitive

**Files:**
- Create: `src/components/ui/badge.tsx`
- Test: `src/components/ui/badge.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`.
- Produces: `Badge` — `React.HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'success' | 'warning' | 'danger' }`.
  Not consumed anywhere in Phase 0. Available for Phase 1+.

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/badge.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Paid</Badge>);
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });

  it('applies the success variant class', () => {
    render(<Badge variant="success">Paid</Badge>);
    expect(screen.getByText('Paid').className).toContain('bg-emerald-100');
  });

  it('defaults to the default variant', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft').className).toContain('bg-cream');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/badge.test.tsx`
Expected: FAIL — `Cannot find module './badge'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/badge.tsx
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const VARIANT_CLASSES: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-cream dark:bg-neutral-800 text-text-secondary dark:text-neutral-300',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
};

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/badge.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/badge.test.tsx
git commit -m "feat(ui): add Badge primitive"
```

---

## Task 7: `useDarkMode` hook

**Files:**
- Create: `src/lib/theme/useDarkMode.ts`
- Test: `src/lib/theme/useDarkMode.test.ts`

**Interfaces:**
- Produces: `useDarkMode(): { isDark: boolean; toggle: () => void }`. Reads/writes
  `localStorage['inyuku_merchant_dark_mode']` (`'true'` / `'false'`), toggles the `dark` class
  on `document.documentElement`. Consumed by Task 11 (Shell).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/theme/useDarkMode.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDarkMode } from './useDarkMode';

const KEY = 'inyuku_merchant_dark_mode';

describe('useDarkMode', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to light mode with no stored preference', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reads a stored dark preference on mount', () => {
    localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggle() flips state, the html class, and persists the choice', () => {
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');

    act(() => result.current.toggle());
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/theme/useDarkMode.test.ts`
Expected: FAIL — `Cannot find module './useDarkMode'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/theme/useDarkMode.ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inyuku_merchant_dark_mode';

function readStoredPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === 'true';
}

function applyToDocument(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
}

/** Merchant-portal-only dark mode toggle, persisted per-viewer in localStorage. */
export function useDarkMode(): { isDark: boolean; toggle: () => void } {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = readStoredPreference();
    setIsDark(stored);
    applyToDocument(stored);
  }, []);

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      applyToDocument(next);
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { isDark, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/theme/useDarkMode.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme/useDarkMode.ts src/lib/theme/useDarkMode.test.ts
git commit -m "feat(theme): add useDarkMode hook"
```

---

## Task 8: `useSidebarExpanded` hook

**Files:**
- Create: `src/lib/layout/useSidebarExpanded.ts`
- Test: `src/lib/layout/useSidebarExpanded.test.ts`

**Interfaces:**
- Produces: `useSidebarExpanded(): { expanded: boolean; toggle: () => void }`. Reads/writes
  `localStorage['inyuku_merchant_sidebar_expanded']` (`'true'` / `'false'`), defaults to
  expanded (`true`) with no stored value. Consumed by Task 11 (Shell).

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/layout/useSidebarExpanded.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarExpanded } from './useSidebarExpanded';

const KEY = 'inyuku_merchant_sidebar_expanded';

describe('useSidebarExpanded', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to expanded with no stored preference', () => {
    const { result } = renderHook(() => useSidebarExpanded());
    expect(result.current.expanded).toBe(true);
  });

  it('reads a stored collapsed preference on mount', () => {
    localStorage.setItem(KEY, 'false');
    const { result } = renderHook(() => useSidebarExpanded());
    expect(result.current.expanded).toBe(false);
  });

  it('toggle() flips state and persists across remount', () => {
    const { result, rerender } = renderHook(() => useSidebarExpanded());
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('false');

    rerender();
    expect(result.current.expanded).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/layout/useSidebarExpanded.test.ts`
Expected: FAIL — `Cannot find module './useSidebarExpanded'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/layout/useSidebarExpanded.ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'inyuku_merchant_sidebar_expanded';

/** Desktop sidebar collapse state, persisted per-viewer in localStorage. Defaults open. */
export function useSidebarExpanded(): { expanded: boolean; toggle: () => void } {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setExpanded(stored === 'true');
  }, []);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { expanded, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/layout/useSidebarExpanded.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/layout/useSidebarExpanded.ts src/lib/layout/useSidebarExpanded.test.ts
git commit -m "feat(layout): add useSidebarExpanded hook"
```

---

## Task 9: DropdownMenu primitive

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`
- Test: `src/components/ui/dropdown-menu.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; `motion`, `AnimatePresence` from `framer-motion`.
- Produces: `DropdownMenu({ trigger, children, align? }: { trigger: React.ReactNode; children: React.ReactNode; align?: 'start' | 'end' })`.
  Manages its own open/close state. Closes on outside click and on `Escape`. Consumed by
  Task 11 (Shell user menu).

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/dropdown-menu.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu } from './dropdown-menu';

describe('DropdownMenu', () => {
  it('opens on trigger click and shows its content', async () => {
    render(
      <DropdownMenu trigger={<button>Open menu</button>}>
        <button>Log out</button>
      </DropdownMenu>,
    );
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('closes on outside click', async () => {
    render(
      <div>
        <DropdownMenu trigger={<button>Open menu</button>}>
          <button>Log out</button>
        </DropdownMenu>
        <button>Elsewhere</button>
      </div>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(
      <DropdownMenu trigger={<button>Open menu</button>}>
        <button>Log out</button>
      </DropdownMenu>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/dropdown-menu.test.tsx`
Expected: FAIL — `Cannot find module './dropdown-menu'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/dropdown-menu.tsx
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  /** Where the panel opens relative to the trigger. Shell uses 'up' (trigger sits at the bottom of the sidebar). */
  side?: 'up' | 'down';
}

export function DropdownMenu({ trigger, children, align = 'start', side = 'down' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: side === 'up' ? 4 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute z-50 w-56 rounded-xl border border-border-light dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg py-1',
              side === 'up' ? 'bottom-full mb-2' : 'top-full mt-2',
              align === 'end' ? 'right-0' : 'left-0',
            )}
            onClick={() => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/dropdown-menu.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/ui/dropdown-menu.test.tsx
git commit -m "feat(ui): add DropdownMenu primitive"
```

---

## Task 10: Sheet primitive (mobile off-canvas panel)

**Files:**
- Create: `src/components/ui/sheet.tsx`
- Test: `src/components/ui/sheet.test.tsx`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`; `motion`, `AnimatePresence` from `framer-motion`.
- Produces: `Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode })`.
  Renders nothing (not even a hidden node) when `open` is `false` — content only mounts while
  open, so it never contributes duplicate accessible names when closed. Backdrop click and
  `Escape` both call `onClose`. Consumed by Task 11 (Shell mobile nav).

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/sheet.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from './sheet';

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={vi.fn()}>
        <p>Menu content</p>
      </Sheet>,
    );
    expect(screen.queryByText('Menu content')).not.toBeInTheDocument();
  });

  it('renders its content when open', () => {
    render(
      <Sheet open onClose={vi.fn()}>
        <p>Menu content</p>
      </Sheet>,
    );
    expect(screen.getByText('Menu content')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>Menu content</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose}>
        <p>Menu content</p>
      </Sheet>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/sheet.test.tsx`
Expected: FAIL — `Cannot find module './sheet'`

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/ui/sheet.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ open, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            data-testid="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-neutral-800 shadow-xl overflow-y-auto"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ui/sheet.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/sheet.tsx src/components/ui/sheet.test.tsx
git commit -m "feat(ui): add Sheet primitive"
```

---

## Task 11: The Shell — rewrite `(merchant)/layout.tsx`

**Files:**
- Create: `src/app/(merchant)/navConfig.tsx`
- Modify: `src/app/(merchant)/layout.tsx` (full rewrite)
- Modify: `src/app/(merchant)/layout.test.tsx` (update to new markup, same behavioral assertions)

**Interfaces:**
- Consumes: `useDarkMode` (Task 7), `useSidebarExpanded` (Task 8), `DropdownMenu` (Task 9),
  `Sheet` (Task 10), `cn` (Task 1); existing `useSession`/`SessionProvider`
  (`@/lib/session/SessionProvider`), `useOnline` (`@/lib/offline/useOnline`),
  `useWhatsAppUnread` (`@/lib/whatsapp/useUnread`), `registerSyncTriggers`
  (`@/lib/offline/triggers`), `logout` (`@/lib/auth`).
- Produces: `default function MerchantLayout({ children }: { children: React.ReactNode })` —
  the route group's layout, unchanged export shape from today.

**Why this design avoids ambiguous test queries:** the desktop sidebar, the mobile bottom tab
bar, and the mobile Sheet panel each render their own `<nav>` with a distinct `aria-label`
(`"Merchant"`, `"Merchant mobile"`, `"Merchant menu"`). The Sheet's nav only exists in the DOM
while the sheet is open (Task 10's `Sheet` renders nothing when closed), so it never collides
with the always-mounted desktop/mobile-bottom-bar nav landmarks. `layout.test.tsx`'s primary
assertions are scoped with `within(...)` to the desktop sidebar's `"Merchant"` landmark, exactly
as today's single-nav test implicitly was (there was only one `<nav>` before).

- [ ] **Step 1: Write the nav config module**

```tsx
// src/app/(merchant)/navConfig.tsx
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
```

- [ ] **Step 2: Update the layout test to the new structure**

```tsx
// src/app/(merchant)/layout.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import MerchantLayout from './layout';
import { useConversationStore } from '@/lib/whatsapp/store';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/orders',
}));

vi.mock('@/lib/offline/useOnline', () => ({ useOnline: () => true }));

vi.mock('@/lib/session/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({
    user: { id: 'u', email: 'e', name: 'n', phone: null, status: 'ACTIVE' },
    memberships: [],
    activeBusinessId: 'biz1',
    hasPerm: () => true,
  }),
}));

vi.mock('@/lib/offline/triggers', () => ({
  registerSyncTriggers: () => () => {},
}));

function desktopNav() {
  return within(screen.getByRole('navigation', { name: 'Merchant' }));
}

describe('MerchantLayout', () => {
  beforeEach(() => {
    useConversationStore.setState({ conversations: [], stale: false, loading: false, loaded: false, lastFetchedAt: null });
  });

  it('renders nav links including WhatsApp and highlights the active route', () => {
    render(
      <MerchantLayout>
        <div data-testid="page">Page</div>
      </MerchantLayout>,
    );

    for (const label of ['Dashboard', 'Products', 'Orders', 'WhatsApp', 'Customers', 'Inventory', 'Onboarding']) {
      expect(desktopNav().getByRole('link', { name: label })).toBeInTheDocument();
    }

    const ordersLink = desktopNav().getByRole('link', { name: 'Orders' });
    expect(ordersLink).toHaveAttribute('aria-current', 'page');
    expect(desktopNav().getByRole('link', { name: 'Products' })).not.toHaveAttribute('aria-current');
  });

  it('places WhatsApp between Orders and Customers', () => {
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    const labels = desktopNav().getAllByRole('link').map((l) => l.textContent?.trim());
    const orders = labels.indexOf('Orders');
    const whatsapp = labels.indexOf('WhatsApp');
    const customers = labels.indexOf('Customers');
    expect(orders).toBeLessThan(whatsapp);
    expect(whatsapp).toBeLessThan(customers);
  });

  it('hides the unread pill at 0 and shows the count when > 0', () => {
    const { rerender } = render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    expect(desktopNav().getByRole('link', { name: 'WhatsApp' })).toBeInTheDocument();

    useConversationStore.setState({
      conversations: [
        {
          id: 'c1', businessId: 'biz1', channelId: 'ch1', customerId: null, waContactId: '27821234567',
          lastInboundAt: '2026-06-21T12:00:00Z', lastOutboundAt: null, status: 'OPEN',
          createdAt: '2026-06-21T08:00:00Z', updatedAt: '2026-06-21T12:00:00Z',
        },
      ],
    });
    rerender(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    expect(desktopNav().getByRole('link', { name: /WhatsApp.*1 waiting for reply/i })).toBeInTheDocument();
  });

  it('persists the sidebar collapse toggle to localStorage', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    localStorage.clear();
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    await userEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(localStorage.getItem('inyuku_merchant_sidebar_expanded')).toBe('false');
  });

  it('toggles the dark class on <html> and persists it', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    const toggles = screen.getAllByRole('button', { name: /switch to dark mode/i });
    await userEvent.click(toggles[0]);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('inyuku_merchant_dark_mode')).toBe('true');
  });

  it('opens the mobile menu sheet on hamburger click and closes it on backdrop click', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(
      <MerchantLayout>
        <div>Page</div>
      </MerchantLayout>,
    );
    expect(screen.queryByRole('navigation', { name: 'Merchant menu' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('navigation', { name: 'Merchant menu' })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(screen.queryByRole('navigation', { name: 'Merchant menu' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run "src/app/(merchant)/layout.test.tsx"`
Expected: FAIL — the current `layout.tsx` has no collapse button, no dark-mode toggle, no
`aria-label="Merchant menu"` sheet, so the new assertions fail (existing 3 tests still pass
against the old markup, new ones don't exist yet to satisfy).

- [ ] **Step 4: Write the shell implementation**

```tsx
// src/app/(merchant)/layout.tsx
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
      <Icon className="h-5 w-5 flex-shrink-0" />
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

function UserMenu({ name, email, onLogout }: { name: string; email: string; onLogout: () => void }) {
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
        onClick={onLogout}
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
    await logout();
    router.push('/login');
  }, [router]);

  const mobileTabItems = [navGroups[0].items[0], ...navGroups.slice(1).flatMap((g) => g.items)].slice(0, 4);

  return (
    <div className="min-h-screen bg-cream dark:bg-neutral-950">
      <div
        className={cn(
          'px-3 py-1 text-center text-xs',
          online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
        )}
      >
        {online ? 'Online' : 'Offline — changes will sync when you reconnect'}
      </div>

      {/* Mobile top bar */}
      <nav
        aria-label="Merchant mobile"
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

      <main
        className={cn(
          'px-4 py-6 pb-20 lg:pb-8 transition-all duration-300',
          expanded ? 'lg:ml-64' : 'lg:ml-16',
        )}
      >
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Merchant mobile"
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
```

**Note on the duplicate `aria-label="Merchant mobile"`:** both the mobile top bar and the mobile
bottom tab bar use that label deliberately — they're two halves of the same "mobile navigation"
landmark region in the accessibility tree (top bar has the hamburger/dark-mode controls, bottom
bar has quick links), matching shopSmart's own split. Nothing in `layout.test.tsx` queries
`"Merchant mobile"` by role text content across both — the test only asserts against `"Merchant"`
(desktop) and `"Merchant menu"` (open sheet).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run "src/app/(merchant)/layout.test.tsx"`
Expected: PASS (6 tests)

- [ ] **Step 6: Run the full frontend test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS, same total-or-higher count as before this task, no new failures in any file
outside `layout.test.tsx`.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(merchant)/navConfig.tsx" "src/app/(merchant)/layout.tsx" "src/app/(merchant)/layout.test.tsx"
git commit -m "feat(merchant): rebuild portal shell — sidebar, dark mode, mobile nav, user menu"
```

---

## Task 12: Login page refinement

**Files:**
- Modify: `src/app/login/page.tsx`
- Create: `src/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `Input`, `Button` (Tasks 2, 4); existing `login`, `getMe` from `@/lib/auth`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/login/page.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import * as auth from '@/lib/auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockClear();
    vi.restoreAllMocks();
  });

  it('submits credentials and redirects to the dashboard on success', async () => {
    vi.spyOn(auth, 'login').mockResolvedValue({ user: { id: 'u', email: 'a@b.com', name: 'A', phone: null, status: 'ACTIVE' } });
    vi.spyOn(auth, 'getMe').mockResolvedValue({
      user: { id: 'u', email: 'a@b.com', name: 'A', phone: null, status: 'ACTIVE' },
      memberships: [],
    });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(auth.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'password123' });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows a plain-language error on failed login', async () => {
    vi.spyOn(auth, 'login').mockRejectedValue(new Error('Invalid credentials'));
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });

  it('links to the new signup page', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/signup');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/login/page.test.tsx`
Expected: FAIL — no `Email`/`Password` labeled fields with those exact `htmlFor` associations
tied to accessible names yet (current inputs have labels but the test itself doesn't exist
until this step, so this just confirms the harness runs against the *current* file and the
"create one" link assertion fails since it doesn't exist).

- [ ] **Step 3: Write the implementation**

```tsx
// src/app/login/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { login, getMe } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(form)
      await getMe()
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-cream dark:bg-neutral-950">
      <div className="px-6 pt-8 flex items-center justify-between">
        <Link href="/" className="text-[16px] font-bold tracking-tight text-text-primary dark:text-neutral-100">
          Inyuku
        </Link>
        <Link href="/" className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted hover:text-text-primary">
          ← Back to home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <p className="text-accent-orange text-xs font-medium uppercase tracking-[0.15em] mb-3">Welcome back</p>
            <h1 className="text-[32px] font-bold text-text-primary dark:text-neutral-100">Sign in to your shop</h1>
          </div>

          <div className="rounded-2xl border border-border-light dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-xs font-medium text-accent-orange hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                  required
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-text-muted mt-6">
            Don&apos;t have a shop yet?{' '}
            <Link href="/signup" className="font-medium text-accent-orange hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/login/page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/app/login/page.test.tsx
git commit -m "feat(auth): refine login page with new primitives"
```

---

## Task 13: Signup page (new)

**Files:**
- Create: `src/app/signup/page.tsx`
- Create: `src/app/signup/page.test.tsx`
- Modify: `src/lib/auth.ts` (add `signup` export)

**Interfaces:**
- Consumes: `Input`, `Button` (Tasks 2, 4).
- Produces: `signup(input: SignupInput): Promise<{ user: SafeUser; business: { id: string; name: string; slug: string }; membership: { id: string; role: string } }>`
  added to `src/lib/auth.ts`, calling `POST /v1/auth/signup` (confirmed contract:
  `{ email, password, name, phone?, businessName, acceptTerms }` → sets auth cookies,
  returns `{ user, business, membership }` — verified directly against the running backend
  earlier this session).

- [ ] **Step 1: Add the `signup` API function**

`src/lib/auth.ts` already imports `postJson<T>(path, body)` from `./api-client` and uses it in
`login` — reuse it exactly the same way. Add this below the existing `login` function (the file's
existing `import { postJson, getJson } from './api-client';` at the top needs no change):

```typescript
// src/lib/auth.ts — add below the existing `login` function
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
```

- [ ] **Step 2: Write the failing test**

```tsx
// src/app/signup/page.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SignupPage from './page';
import * as auth from '@/lib/auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('SignupPage', () => {
  beforeEach(() => {
    push.mockClear();
    vi.restoreAllMocks();
  });

  it('submits the form and redirects to the dashboard on success', async () => {
    vi.spyOn(auth, 'signup').mockResolvedValue({
      user: { id: 'u', email: 'a@b.com', name: 'Nomsa', phone: null, status: 'ACTIVE' },
      business: { id: 'biz1', name: 'Nomsa Spaza', slug: 'nomsa-spaza' },
      membership: { id: 'm1', role: 'MERCHANT_OWNER' },
    });
    render(<SignupPage />);
    await userEvent.type(screen.getByLabelText('Shop name'), 'Nomsa Spaza');
    await userEvent.type(screen.getByLabelText('Your name'), 'Nomsa');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByLabelText(/accept the terms/i));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(auth.signup).toHaveBeenCalledWith({
      businessName: 'Nomsa Spaza',
      name: 'Nomsa',
      email: 'a@b.com',
      password: 'password123',
      phone: undefined,
      acceptTerms: true,
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('requires the terms checkbox before submitting', async () => {
    render(<SignupPage />);
    await userEvent.type(screen.getByLabelText('Shop name'), 'Nomsa Spaza');
    await userEvent.type(screen.getByLabelText('Your name'), 'Nomsa');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(auth.signup).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/accept the terms/i);
  });

  it('shows a plain-language error on a failed signup', async () => {
    vi.spyOn(auth, 'signup').mockRejectedValue(new Error('Email already in use'));
    render(<SignupPage />);
    await userEvent.type(screen.getByLabelText('Shop name'), 'Nomsa Spaza');
    await userEvent.type(screen.getByLabelText('Your name'), 'Nomsa');
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByLabelText(/accept the terms/i));
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/signup/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 4: Write the implementation**

```tsx
// src/app/signup/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signup } from '@/lib/auth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface SignupForm {
  businessName: string
  name: string
  email: string
  password: string
  phone: string
  acceptTerms: boolean
}

const EMPTY_FORM: SignupForm = {
  businessName: '',
  name: '',
  email: '',
  password: '',
  phone: '',
  acceptTerms: false,
}

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState<SignupForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.acceptTerms) {
      setError('Please accept the terms to create your shop.')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await signup({
        businessName: form.businessName,
        name: form.name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
        acceptTerms: form.acceptTerms,
      })
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your shop')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-cream dark:bg-neutral-950">
      <div className="px-6 pt-8 flex items-center justify-between">
        <Link href="/" className="text-[16px] font-bold tracking-tight text-text-primary dark:text-neutral-100">
          Inyuku
        </Link>
        <Link href="/" className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted hover:text-text-primary">
          ← Back to home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <p className="text-accent-orange text-xs font-medium uppercase tracking-[0.15em] mb-3">Get started</p>
            <h1 className="text-[32px] font-bold text-text-primary dark:text-neutral-100">Create your shop</h1>
          </div>

          <div className="rounded-2xl border border-border-light dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8 sm:p-10">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <label htmlFor="businessName" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Shop name
                </label>
                <Input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => setForm((s) => ({ ...s, businessName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="name" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Your name
                </label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="block text-xs font-medium uppercase tracking-[0.08em] text-text-primary dark:text-neutral-100">
                  Phone (optional)
                </label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-text-secondary dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={(e) => setForm((s) => ({ ...s, acceptTerms: e.target.checked }))}
                  className="mt-0.5"
                />
                I accept the Terms of Service
              </label>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating your shop…' : 'Create account'}
              </Button>
            </form>
          </div>

          <p className="text-center text-sm text-text-muted mt-6">
            Already have a shop?{' '}
            <Link href="/login" className="font-medium text-accent-orange hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/signup/page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/app/signup/page.tsx src/app/signup/page.test.tsx
git commit -m "feat(auth): add signup page"
```

---

## Task 14: Full-suite verification and manual browser walkthrough

**Files:** none created — verification only.

- [ ] **Step 1: Run the full frontend test suite**

Run: `npm test`
Expected: 100% pass, no skipped assertions, count is (previous total) + roughly 30 new tests
across Tasks 1–13.

- [ ] **Step 2: Typecheck, lint, and production build**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three clean. The build step in particular catches any server/client component
boundary mistakes (e.g. a hook used in a file missing `'use client'`).

- [ ] **Step 3: Start the dev server and log in through the real UI**

If not already running: `npx next dev -p 3001` (see [[inyuku-frontend-routing]] memory — port
3000 conflicts with a stale service worker). Confirm the backend + test Postgres/Redis from this
session are still up (`docker ps | grep inyuku`); if not, restart per the
`inyuku-local-test-infra` memory (Postgres on 5433, `npm run db:seed`).

Using browser-harness, walk through:
1. `/login` — new composition renders, sign in with the seeded `merchant.e2e@inyuku.test` /
   `TestPass123!` account from this session, confirm redirect to `/dashboard`.
2. Confirm the new sidebar renders with all 7 grouped nav items, WhatsApp badge shows the
   correct needs-reply count from the seeded conversations.
3. Click every nav item; confirm each existing page still renders its existing content
   unchanged (this is the regression check that Phase 0 touched nothing but the shell).
4. Toggle dark mode; confirm the shell and login/signup pages render legibly in both modes;
   reload the page and confirm the preference persisted.
5. Collapse the sidebar; reload; confirm the collapsed state persisted.
6. Resize (or use `resize_page`/mobile emulation) to a narrow viewport; confirm the hamburger
   opens the Sheet with the full grouped nav, and the bottom tab bar shows Dashboard + 3 more.
7. Open the WhatsApp thread that has `lastOutboundAt` already set from this session's testing;
   confirm the needs-reply indicator state still matches what the database has (no shell-caused
   regression to the ADR-INY-025 fix from earlier this session).
8. Log out via the new user menu; confirm redirect to `/login` and that the session is actually
   cleared (reloading `/dashboard` redirects back to `/login`).
9. Navigate to `/signup`, create a second throwaway test business, confirm redirect to
   `/dashboard` under the new account.

- [ ] **Step 4: Record findings**

If any step in Step 3 surfaces a regression, stop and fix it before proceeding — do not commit
a broken shell. If everything passes, no commit is needed for this task (verification only);
note completion in the task tracker.
