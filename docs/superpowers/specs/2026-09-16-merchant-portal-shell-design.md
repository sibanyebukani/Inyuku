# Merchant Portal Shell Redesign — Phase 0: Foundation (Design)

> **Status:** Design / approved shape, pending spec review
> **Date:** 2026-09-16
> **Scope decision:** This is Phase 0 of a 5-phase merchant-portal redesign (design system +
> shell + auth pages only). Phases 1–4 (restyling page content: Dashboard/Products/Inventory,
> Orders/Customers, WhatsApp inbox, Onboarding) are separate future brainstorm → spec → plan
> cycles and are explicitly **not** designed here. A second, independent subsystem — a
> platform-admin portal for `ADMIN`/`SUPPORT` roles (lead triage, cross-tenant business
> oversight) — was flagged during scoping and is also deferred to its own future brainstorm.
> **Reference:** visual/structural reference is `/home/sibnaye/QA/shopSmart` (a separate,
> unrelated project) — its layout *structure* is reused; its brand identity (colors, fonts) is
> not. Inyuku's own existing design tokens are used throughout.

## 1. Why this document exists

The merchant portal (`src/app/(merchant)/`) currently has a bare, flat horizontal nav with no
visual hierarchy, no dark mode, and a login page that is functional but unpolished. This was
adequate while M3-B (WhatsApp commerce) was the build priority, but the founder now wants a
proper branded shell — collapsible grouped sidebar, dark mode, user menu, mobile-first
navigation — before further merchant-facing work continues. `shopSmart` (a separate reference
project) was inspected as a structural/interaction reference: it demonstrates a mature version
of exactly this shell pattern (React + shadcn/ui + Tailwind), built for a directly comparable
domain (South African informal-economy shop management).

This phase builds the **foundation only**: reusable UI primitives, the shell itself, and the
two auth-entry pages (login, and a net-new signup page — currently API-only, no frontend
exists). No existing merchant page's *content* changes. This keeps the highest-risk surface —
the WhatsApp inbox, which received 15+ correctness fixes and full browser-verified testing this
session — untouched until Phase 3, built against primitives that are proven by then.

## 2. Non-goals (explicit)

- Restyling the content of Dashboard, Products, Orders, WhatsApp inbox/thread/auto-replies,
  Customers, Inventory, or Onboarding. (Phases 1–4.)
- A business/multi-tenant switcher. Today `SessionProvider` always uses `memberships[0]` as the
  active business; that behavior is unchanged. Flagged as a real gap for a future phase, not
  solved here.
- The platform-admin portal (`ADMIN`/`SUPPORT` roles). Separate future brainstorm.
- Any backend/API change. This is a pure frontend phase — the existing `/v1/auth/login`,
  `/v1/auth/signup`, `/v1/auth/me` contracts are consumed as-is (including the `/v1/auth/me`
  effective-permissions fix made earlier this session).
- A `Settings` page. The user menu therefore has no Settings link in this phase (it has nowhere
  to point) — just the user identity display and Logout.

## 3. Component stack decision

Inyuku's `tailwind.config.js` and `globals.css` already carry a full shadcn/ui-shaped token
scaffold (`border`/`input`/`ring`/`background`/`foreground`/`primary`/`secondary`/`muted`/
`accent`/`popover`/`card`/`sidebar`, with light **and dark** HSL variable pairs) — vestigial
from whatever starter scaffolded this repo, currently unused by any component. `lucide-react`
and `framer-motion` are already dependencies, used by the marketing site
(`src/components/Navbar.tsx`, `Footer.tsx`). No Radix, no shadcn CLI, no
`class-variance-authority` exist in this repo.

**Decision:** match the marketing site's actual stack, not shopSmart's. Hand-rolled Tailwind
components using `lucide-react` for icons and `framer-motion` for interactive motion (sidebar
collapse, mobile sheet slide-in, dropdown open/close) — no Radix primitives. The only new
dependencies added are `clsx` and `tailwind-merge`, for a `cn()` className-merging utility
(the idiomatic small pattern, independent of shadcn).

## 4. Design tokens

No new brand colors and no new font. Reuse `tailwind.config.js`'s existing custom tokens
(`cream #F6F2EC`, `accent-orange #E86A34`, `accent-orange-dark #D15A28`, `accent-green`,
`accent-teal`, `text-primary #1A1A1A`, `text-secondary #444444`, `text-muted #78716C`,
`border-light #E7E5E4`) and `Inter` (`var(--font-inter)`), matching `Navbar.tsx`'s existing
usage exactly. Headings differentiate by weight/tracking (as the marketing nav already does:
`font-extrabold tracking-[-0.02em]`), not a second display font.

**Dark mode is additive and isolated.** The `:root`/`.dark` HSL variable pairs in `globals.css`
already exist and are unused — they stay unused by the marketing site. Dark-mode support is
added via explicit `dark:` Tailwind variants (e.g. `bg-cream dark:bg-neutral-900`,
`text-text-primary dark:text-neutral-100`) written **only** inside `(merchant)/` files, the new
`src/components/ui/*` primitives, and `src/app/login/page.tsx` / the new signup page. The shared
token definitions in `tailwind.config.js` are not modified, so marketing pages are provably
unaffected — a page outside those paths cannot pick up a `dark:` class that was never toggled on
`<html>` by anything it renders.

Dark mode toggle state persists to `localStorage` (key: `inyuku_merchant_dark_mode`), applied by
toggling a `dark` class on `<html>`, mirroring shopSmart's approach and Inyuku's existing
`sidebar_expanded`-style local-only UI preference pattern (see `usePoll`/`useOnline` for the
codebase's existing tolerance of browser-storage UI state — this is exactly that category:
per-viewer convenience, never state Claude or the server needs to read back).

## 5. UI primitives (`src/components/ui/`)

New files, each a single default export, hand-rolled Tailwind + `cn()`:

- `button.tsx` — variants: `primary` (accent-orange fill), `secondary` (bordered), `ghost`
  (transparent, hover fill), `destructive` (red, for delete/logout-style actions). Sizes: `sm`,
  `md` (default), `icon` (square, for icon-only buttons like sidebar-collapse).
- `card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardContent` — thin composable wrapper
  matching the existing ad-hoc `rounded-2xl border ... bg-white` pattern already used in
  `login/page.tsx` and `whatsapp/auto-replies/AutoReplyRuleForm.tsx`, formalized.
- `input.tsx` — text input matching the existing login page's input styling
  (`h-12 rounded-xl border-...`), extracted so Phase 0's login/signup and any later phase can
  reuse it instead of each page hand-rolling border/focus classes.
- `select.tsx` — native `<select>` wrapped with the same visual treatment as `input.tsx`
  (native, not a custom listbox — matches the existing pattern used throughout
  `(merchant)/orders/OrderForm.tsx` and `auto-replies/AutoReplyRuleForm.tsx`, which this phase
  does not touch but should visually match once Phase 1+ adopts it).
- `badge.tsx` — small pill, variants `default`/`success`/`warning`/`danger` — generalizes the
  ad-hoc `rounded-full px-3 py-1 text-xs` pattern already used by `PaymentToggle` and
  `ConversationRow`'s needs-reply indicator (not retrofitted onto those components in Phase 0 —
  available for Phase 1+ to adopt).
- `dropdown-menu.tsx` — the shell's user menu (identity + Logout). `framer-motion`
  fade/scale-in, closes on outside click and `Escape`, matching shopSmart's interaction but
  built without Radix.
- `sheet.tsx` — the mobile off-canvas nav panel. `framer-motion` slide-in from the left,
  backdrop click / `Escape` to close, focus trapped while open (basic tab-cycle containment,
  not a full focus-trap library — consistent with "no new heavy deps").

Each primitive is a plain, independently understandable unit: props in, JSX out, no fetching, no
business logic, no knowledge of auth/tenancy. They can be unit-tested in isolation and are safe
for Phase 1+ to adopt incrementally.

## 6. Shell (`src/app/(merchant)/layout.tsx` rewrite)

**Preserved contract** (from the existing `layout.test.tsx`, which is updated, not rewritten, to
assert the same things against new markup):

- All 7 nav items render as accessible links, by name: Dashboard, Products, Orders, WhatsApp,
  Customers, Inventory, Onboarding — **in that exact relative order**.
- The active route's link carries `aria-current="page"`; others don't.
- The WhatsApp link's accessible name includes the unread count when > 0
  (`/WhatsApp.*N waiting for reply/i`) and omits it at 0 — unchanged from today.
- The online/offline banner (`useOnline`) is unchanged in content and placement logic.

**New structure**, visually grouped but preserving that exact sequence:

- Dashboard — standalone, top of nav (no group label), matching shopSmart's pattern for the
  single most-visited page.
- "Sell" group — Products, Orders.
- WhatsApp — standalone, *not* folded into a group. It's the MVP's flagship surface (per
  `CLAUDE.md` §1: "MVP = WhatsApp commerce") and deserves the same top-level prominence as
  Dashboard, not burial under a generic label.
- "Customers" group — Customers.
- "Stock" group — Inventory.
- "Setup" group — Onboarding.

Group labels are presentational only (uppercase, small, muted-gray — matching shopSmart's
treatment) and are trivially reordered/renamed later without touching the underlying nav-item
list, order, or any tested behavior.

**Desktop:** fixed-position collapsible sidebar (`w-64` expanded / `w-16` collapsed,
`transition-all duration-300`), collapse state persisted to `localStorage`
(`inyuku_merchant_sidebar_expanded`), collapsed-state items show a hover tooltip with the
item's name (matching shopSmart's `group-hover:opacity-100` tooltip pattern). Logo + wordmark at
top, dark-mode toggle + user identity/menu pinned at the bottom (`border-t`).

**Mobile (`< lg`):** sticky top bar (logo, dark-mode toggle, hamburger button opening the
`Sheet` primitive with the full grouped nav) **and** a fixed bottom tab bar showing Dashboard +
up to 3 more nav items — mirroring shopSmart's dual mobile-nav pattern. Given Inyuku's own
stated target persona (mobile-first, intermittent connectivity — see `CLAUDE.md` §1), the mobile
experience gets equal design attention to desktop, not a cut-down afterthought.

User menu (`dropdown-menu.tsx`): avatar with initials (derived from `user.name`, matching
shopSmart's initials logic), name + email, single "Log out" action calling the existing
`logout()` from `src/lib/auth.ts`. No Settings link (§2).

## 7. Auth pages

**`src/app/login/page.tsx` (refinement, not a rebuild).** The existing page already uses
Inyuku's own tokens (cream background, white card, `text-primary`/`text-muted` hex) and is
structurally close to shopSmart's composition already. Changes: extract the form fields to the
new `Input`/`Button` primitives; add an eyebrow label ("Welcome back"), a "Back to home" link,
a "Forgot password?" link (the backend already exposes
`/v1/auth/password/reset-request`/`-confirm` — confirmed present in `auth.routes.ts`), and a
"Don't have a shop yet? Create one" link to the new `/signup` page. The existing `login()` +
`getMe()` cookie-auth call sequence is unchanged.

**`src/app/signup/page.tsx` (new).** Currently API-only
(`POST /v1/auth/signup { email, password (min 8), name, phone?, businessName, acceptTerms }`,
confirmed in `auth.routes.ts`) with zero frontend. Same visual composition as the login page
(cream background, white card, `Input`/`Button` primitives), fields: shop/business name, owner
name, email, password, phone (optional), a required "I accept the Terms" checkbox (the API
rejects `acceptTerms !== true` — the form mirrors that as a client-side guard, not a new rule).
On success, the signup endpoint already sets auth cookies and returns `{ user, business,
membership }` (confirmed by testing it directly this session) — the page redirects straight to
`/dashboard`, no separate login step needed. Rate-limited server-side already (5/min/IP) — the
form surfaces that error via the existing generic error-display pattern, no new client-side rate
limiting.

## 8. File-level change list

**New:**
- `src/lib/utils.ts` — `cn()` helper (or added to an existing shared lib file if one is more
  appropriate — the implementation plan decides the exact location).
- `src/components/ui/{button,card,input,select,badge,dropdown-menu,sheet}.tsx`
- `src/app/signup/page.tsx`
- `src/components/ui/__tests__/*.test.tsx` (primitive unit tests)

**Rewritten:**
- `src/app/(merchant)/layout.tsx`
- `src/app/(merchant)/layout.test.tsx` (updated to new markup, same assertions — see §6)
- `src/app/login/page.tsx`

**Modified:**
- `package.json` / `package-lock.json` — add `clsx`, `tailwind-merge`.
- `tailwind.config.js` — no token changes; may need `content` glob confirmation covers
  `src/components/ui/**` (it already covers `src/**/*.{js,ts,jsx,tsx}`, so no change expected).

**Untouched:** every file under `(merchant)/{dashboard,products,orders,whatsapp,customers,
inventory,onboarding}/` and their tests — Phase 0 does not import or modify page content, only
the layout wrapper around it. The `feat/whatsapp-inbox-ui` branch's 15+ correctness fixes from
this session are load-bearing and are not touched.

## 9. Testing

- `layout.test.tsx`: existing four assertions (all links present, active-route `aria-current`,
  WhatsApp-between-Orders-and-Customers ordering, unread-badge show/hide) updated against the
  new sidebar markup — same queries (`getByRole('link', { name })`), same expected behavior.
  New tests: sidebar-collapse toggle persists across remount (mocking `localStorage`),
  dark-mode toggle applies/removes the `dark` class on `<html>` and persists, mobile `Sheet`
  opens on hamburger click and closes on route change (existing layout already does this for the
  old mobile menu — `location.pathname` effect — behavior carries over).
- New primitive unit tests for `Button`, `Select` (native select still submits the right value —
  regression-relevant given the React-controlled-`<select>` gotcha hit during this session's
  browser testing), `DropdownMenu` (open/close/outside-click), `Sheet` (open/close/backdrop).
- `src/app/login/page.tsx` and `src/app/signup/page.tsx`: form submit → success redirect, form
  submit → server error displayed, client-side required-field validation.
- No backend tests change (§2 — no backend touched).
- Manual/browser verification before calling Phase 0 done: log in through the new shell, confirm
  every nav item still reaches its existing page and every fix verified earlier this session
  (WhatsApp reply → needs-reply clears, order capture, auto-reply management, payment toggle)
  still works unchanged underneath the new shell chrome.

## 10. Open items carried forward (not blockers for Phase 0)

- Business/multi-tenant switcher — real gap, `SessionProvider` hardcodes `memberships[0]`.
  Flagged for a future phase.
- Settings page — the user menu has an empty slot for it once it exists.
- Platform-admin portal (`ADMIN`/`SUPPORT`) — separate future brainstorm, decomposed out of this
  request at the start of scoping.
