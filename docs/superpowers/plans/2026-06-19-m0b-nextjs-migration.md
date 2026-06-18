# M0-B: Vite → Next.js (App Router) Migration + Dead-Code Prune — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Inyuku marketing SPA from Vite + react-router (HashRouter) to Next.js (App Router) on the existing React 19 codebase, prune the entirely-dead shadcn/Radix tree, and establish the lead-capture Route Handler contract — without changing any page's visual design or copy.

**Architecture:** Next.js 15 App Router under `src/app/`, keeping the `@/*` → `./src/*` alias, Tailwind v3 config, GSAP + Framer Motion (in `"use client"` components), and lucide icons. Next is a **pure frontend** (ADR-001): no business logic, no system of record. The 6 pages move largely verbatim — only routing imports, `<img>`, and the `"use client"` directive change. The lead Route Handler is a **thin BFF** that will proxy the Express `/leads` endpoint in M1; until then it validates and forwards only if the backend URL is configured.

**Tech Stack:** Next.js 15, React 19.2 (existing), TypeScript 5.9, Tailwind CSS 3.4 (existing), GSAP 3.15 + @gsap/react, Framer Motion 12, lucide-react, next/font, next/image.

## Global Constraints

- **Do not change visual design, layout, copy, colors, or animations.** This is a framework port, not a redesign. The content bugs (Stories filter, donut chart, banner stat, placeholder team) are **out of scope** — they are fixed in M0-C.
- **Resolved stack only** (EA-ADR-014/015, `docs/DECISIONS.md`): Next.js frontend, in-house JWT later, **no Clerk, no Supabase, no Stripe**. Do not add auth/db/payment code in this phase.
- Node 20 LTS (`.nvmrc`). Package manager: npm.
- Keep the `@/*` path alias working throughout.
- Work on branch `feature/m0b-next-migration`; do not commit to `main` directly. Frequent commits per task.
- After the prune, `npm run lint` must pass — CI lint flips to **blocking** at the end of this phase (Task 15).
- The lead Route Handler must contain **no secrets** and must not become a data store.

---

### Task 1: Branch, install Next.js, and base configuration

**Files:**
- Create: `next.config.ts`, branch `feature/m0b-next-migration`
- Modify: `package.json` (deps + scripts), `tsconfig.json`
- Delete: `vite.config.ts`, `index.html`, `tsconfig.app.json`, `tsconfig.node.json`

**Interfaces:**
- Produces: a Next.js project skeleton that builds (empty app) and the `@/*` alias. Later tasks add `src/app/*`.

- [ ] **Step 1: Create the feature branch**

```bash
cd /home/sibnaye/Development/Inyuku
git checkout -b feature/m0b-next-migration
```

- [ ] **Step 2: Install Next.js and its ESLint config; remove react-router**

```bash
npm install next@15
npm install -D eslint-config-next@15
npm uninstall react-router
```

- [ ] **Step 3: Replace the `scripts` block in `package.json`**

From the Vite scripts to:

```json
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "preview": "next build && next start -p 3000"
  },
```

- [ ] **Step 4: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // local public/ assets only for now; remote patterns added when a CDN/R2 lands (M1+)
    formats: ['image/avif', 'image/webp'],
  },
}

export default nextConfig
```

- [ ] **Step 5: Replace `tsconfig.json` with a Next.js single-project config**

Delete `tsconfig.app.json` and `tsconfig.node.json`, then write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Remove Vite-only files**

```bash
rm -f vite.config.ts index.html
```

> Do NOT delete `src/main.tsx` / `src/App.tsx` yet — they are deleted in Task 11 after pages move, so the tree stays buildable conceptually. (Next ignores them; they just sit unused until then.)

- [ ] **Step 7: Generate Next types and verify a clean (pages-less) build is wired**

Run: `npx next telemetry disable && npm run dev` — let it boot once (it creates `next-env.d.ts`), expect a 404 on `/` (no `app/` yet), then stop it (Ctrl-C).
Expected: dev server starts on :3000 without config errors; `next-env.d.ts` now exists.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "build(m0b): install Next.js 15, drop Vite config, keep @/* alias

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Root layout, global styles, fonts, metadata, error & not-found

**Files:**
- Create: `src/app/layout.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`
- Modify/Move: `src/index.css` → `src/app/globals.css` (and fold `src/App.css` if it holds real styles)
- Reference: `src/components/Layout.tsx` (source of the Navbar+Footer wrapper), `index.html` (deleted — fonts/meta come from here)

**Interfaces:**
- Consumes: Navbar/Footer (migrated in Tasks 3–4 — import paths must match `@/components/Navbar` and `@/components/Footer`).
- Produces: the App Router root that wraps every route with Navbar + Footer, loads Inter via `next/font`, and sets global metadata.

- [ ] **Step 1: Move global CSS**

```bash
git mv src/index.css src/app/globals.css
```
If `src/App.css` contains real rules used app-wide, append them into `src/app/globals.css` and `git rm src/App.css`; if it is empty/unused, `git rm src/App.css`.

- [ ] **Step 2: Create `src/app/layout.tsx`**

Replicates `src/components/Layout.tsx` (Navbar + content + Footer) and replaces the deleted `index.html` `<head>` (Inter font + meta). Inter via `next/font` replaces the Google Fonts `<link>`.

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: 'Inyuku Digital',
  description:
    'Digital commerce platform for South African informal and small businesses — WhatsApp commerce, digital payments, inventory, and an AI business assistant.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
```

> If `tailwind.config.js` `fontFamily.sans` referenced `'Inter'` directly, change it to use `var(--font-inter)` so `next/font` drives it. Confirm with: `grep -n "Inter" tailwind.config.js` and update that entry to `['var(--font-inter)', 'sans-serif']`.

- [ ] **Step 3: Create `src/app/error.tsx`** (root error boundary — must be a client component)

```tsx
'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Something went wrong</h1>
        <p style={{ marginBottom: '1rem', color: '#666' }}>Please try again.</p>
        <button onClick={() => reset()} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#E86A34', color: 'white' }}>
          Try again
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/app/not-found.tsx`**

```tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>404 — Page not found</h1>
        <p style={{ marginBottom: '1rem', color: '#666' }}>The page you’re looking for doesn’t exist.</p>
        <Link href="/" style={{ color: '#E86A34', fontWeight: 600 }}>Back to home</Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify typecheck (Navbar/Footer imports will fail until Tasks 3–4 — that is expected)**

Run: `npm run typecheck 2>&1 | head -20`
Expected: errors ONLY about missing `@/components/Navbar` / `@/components/Footer` (resolved next). No other errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(m0b): root layout, globals, next/font Inter, error & 404 boundaries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Migration Recipe (applies to Navbar, Footer, and all 6 pages — Tasks 3–10)

Apply these exact transforms to each file. They are identical everywhere; per-task notes list which apply.

1. **Client directive:** add `'use client'` as the very first line (every page + Navbar + Footer use state/hooks/animations/Link → all are client components).
2. **Router imports:** replace
   - `import { Link, useLocation } from 'react-router'` → `import Link from 'next/link'` + `import { usePathname } from 'next/navigation'`
   - `import { useNavigate } from 'react-router'` → `import { useRouter } from 'next/navigation'`
3. **Link prop:** `<Link to="/x">` → `<Link href="/x">` (replace every `to=` with `href=` on `Link`).
4. **Active route:** `const location = useLocation()` + `location.pathname` → `const pathname = usePathname()` + `pathname`.
5. **Programmatic nav:** `const navigate = useNavigate(); navigate('/x')` → `const router = useRouter(); router.push('/x')`.
6. **Images:** `<img src="/x.jpg" .../>` → `next/image` (Task 12 does this as a dedicated pass — leave `<img>` in place during the page-move tasks so each move is verifiable in isolation).
7. **GSAP/Framer:** leave as-is; they work in client components. Keep `gsap.registerPlugin(ScrollTrigger)` where it is.

---

### Task 3: Migrate Navbar

**Files:**
- Modify: `src/components/Navbar.tsx`

**Interfaces:**
- Consumes: `next/link`, `next/navigation`.
- Produces: `@/components/Navbar` default export used by `src/app/layout.tsx`.

- [ ] **Step 1: Apply recipe items 1–4** to `src/components/Navbar.tsx` (it uses `Link`, `useLocation`, `useState`; lines per inventory: imports L2, Links L29-118, `useLocation` for active state).

- [ ] **Step 2: Verify the active-link logic** — every `location.pathname` is now `pathname`; every `<Link to=` is `<Link href=`. Grep to confirm none missed:

Run: `grep -nE "useLocation|react-router|<Link to=|navigate\(" src/components/Navbar.tsx || echo "CLEAN"`
Expected: `CLEAN`

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck 2>&1 | grep -i "Navbar" || echo "Navbar OK"`
Expected: `Navbar OK`

- [ ] **Step 4: Commit**

```bash
git add src/components/Navbar.tsx
git commit -m "refactor(m0b): migrate Navbar to next/link + usePathname

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migrate Footer

**Files:**
- Modify: `src/components/Footer.tsx`

- [ ] **Step 1: Apply recipe items 1, 2, 3** (Footer uses `Link` only; `new Date().getFullYear()` is fine in a client component).

- [ ] **Step 2: Confirm no react-router residue**

Run: `grep -nE "react-router|<Link to=" src/components/Footer.tsx || echo "CLEAN"`
Expected: `CLEAN`

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck 2>&1 | grep -i "Footer" || echo "Footer OK"` → expect `Footer OK`
```bash
git add src/components/Footer.tsx
git commit -m "refactor(m0b): migrate Footer to next/link

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Migrate Home → `src/app/page.tsx`

**Files:**
- Create: `src/app/page.tsx` (from `src/pages/Home.tsx`)

**Interfaces:**
- Produces: route `/`.

- [ ] **Step 1: Move the file**

```bash
git mv src/pages/Home.tsx src/app/page.tsx
```

- [ ] **Step 2: Apply recipe items 1, 2, 3, 4, 5** to `src/app/page.tsx`. Home uses GSAP (heavy), Framer, `useState` (L261, L565), `useEffect` (L45 in `useCountUp`), `Link` CTAs (L212-231), `<img>` `/hero-bg.jpg` (L644), and `backgroundAttachment: 'fixed'` (L174).
  - Keep `backgroundAttachment: 'fixed'` as-is (it is inline CSS; valid in a client component). Leave the `<img>` for Task 12.

- [ ] **Step 3: Confirm no react-router residue**

Run: `grep -nE "react-router|<Link to=|useLocation|useNavigate" src/app/page.tsx || echo "CLEAN"`
Expected: `CLEAN`

- [ ] **Step 4: Build and render-check the route**

Run: `npm run build 2>&1 | tail -15`
Expected: build succeeds; output lists route `/`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(m0b): migrate Home page to app/page.tsx

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Migrate Platform → `src/app/platform/page.tsx`

- [ ] **Step 1:** `mkdir -p src/app/platform && git mv src/pages/Platform.tsx src/app/platform/page.tsx`
- [ ] **Step 2:** Apply recipe items 1, 2, 3, 5 (GSAP/Framer, `useEffect` L163, `Link` CTAs L226-232 & L720-732, `<img>` `/platform-hero.jpg` L179). Leave `<img>` for Task 12.
- [ ] **Step 3:** `grep -nE "react-router|<Link to=|useLocation|useNavigate" src/app/platform/page.tsx || echo "CLEAN"` → expect `CLEAN`
- [ ] **Step 4:** `npm run build 2>&1 | tail -8` → expect success, route `/platform` listed.
- [ ] **Step 5:** `git add -A && git commit -m "feat(m0b): migrate Platform page" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 7: Migrate Impact → `src/app/impact/page.tsx`

- [ ] **Step 1:** `mkdir -p src/app/impact && git mv src/pages/Impact.tsx src/app/impact/page.tsx`
- [ ] **Step 2:** Apply recipe items 1, 2, 3, 5 (GSAP/Framer, `useState` L59/L360/L781, `useEffect` L360, `Link` L226-232, `<img>` L376 `/impact-hero.jpg` & L572, email form L814-833 — leave the form behaviour unchanged; M0-C wires it). Leave `<img>` for Task 12.
- [ ] **Step 3:** `grep -nE "react-router|<Link to=|useLocation|useNavigate" src/app/impact/page.tsx || echo "CLEAN"` → expect `CLEAN`
- [ ] **Step 4:** `npm run build 2>&1 | tail -8` → expect success, route `/impact`.
- [ ] **Step 5:** `git add -A && git commit -m "feat(m0b): migrate Impact page" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 8: Migrate Solutions → `src/app/solutions/page.tsx`

- [ ] **Step 1:** `mkdir -p src/app/solutions && git mv src/pages/Solutions.tsx src/app/solutions/page.tsx`
- [ ] **Step 2:** Apply recipe items 1, 2, 3, 4 (GSAP/Framer + AnimatePresence L329-437, `useState` `activeFilter` L263, `Link` L220-228, `<img>` L230-233 the four solutions images). Leave `<img>` for Task 12.
- [ ] **Step 3:** `grep -nE "react-router|<Link to=|useLocation|useNavigate" src/app/solutions/page.tsx || echo "CLEAN"` → expect `CLEAN`
- [ ] **Step 4:** `npm run build 2>&1 | tail -8` → expect success, route `/solutions`.
- [ ] **Step 5:** `git add -A && git commit -m "feat(m0b): migrate Solutions page" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 9: Migrate Stories → `src/app/stories/page.tsx`

- [ ] **Step 1:** `mkdir -p src/app/stories && git mv src/pages/Stories.tsx src/app/stories/page.tsx`
- [ ] **Step 2:** Apply recipe items 1, 2, 3 (GSAP/Framer, `useState` L419-425 form + active filter, story submission form L478-589, `<img>` L200/L221/L242 testimonials + L632 `/hero-overlay-pattern.png`). **Do NOT fix the broken category filter — that is M0-C.** Leave `<img>` for Task 12.
- [ ] **Step 3:** `grep -nE "react-router|<Link to=|useLocation|useNavigate" src/app/stories/page.tsx || echo "CLEAN"` → expect `CLEAN`
- [ ] **Step 4:** `npm run build 2>&1 | tail -8` → expect success, route `/stories`.
- [ ] **Step 5:** `git add -A && git commit -m "feat(m0b): migrate Stories page" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 10: Migrate About → `src/app/about/page.tsx`

- [ ] **Step 1:** `mkdir -p src/app/about && git mv src/pages/About.tsx src/app/about/page.tsx`
- [ ] **Step 2:** Apply recipe items 1, 2, 3 (GSAP/Framer, no `useState`, `Link` CTAs L880-938, `<img>` L79 `/about-team.jpg`). **Do NOT replace the placeholder team — that is M0-C.** Leave `<img>` for Task 12.
- [ ] **Step 3:** `grep -nE "react-router|<Link to=|useLocation|useNavigate" src/app/about/page.tsx || echo "CLEAN"` → expect `CLEAN`
- [ ] **Step 4:** `npm run build 2>&1 | tail -8` → expect success, route `/about`.
- [ ] **Step 5:** `git add -A && git commit -m "feat(m0b): migrate About page" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 11: Delete dead routing entrypoints and confirm react-router is gone

**Files:**
- Delete: `src/App.tsx`, `src/main.tsx`, `src/pages/` (now empty)

- [ ] **Step 1: Remove the old SPA entrypoints**

```bash
git rm src/App.tsx src/main.tsx
rmdir src/pages 2>/dev/null || true
```

- [ ] **Step 2: Repo-wide react-router sweep**

Run: `grep -rnE "react-router|<Link to=|useLocation|useNavigate" src/ || echo "NO REACT-ROUTER RESIDUE"`
Expected: `NO REACT-ROUTER RESIDUE`

- [ ] **Step 3: Confirm react-router is not in package.json**

Run: `grep -i "react-router" package.json || echo "react-router removed"`
Expected: `react-router removed`

- [ ] **Step 4: Full build**

Run: `npm run build 2>&1 | tail -15`
Expected: success; routes `/`, `/platform`, `/impact`, `/solutions`, `/stories`, `/about` all listed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(m0b): remove Vite SPA entrypoints (App/main); routing now file-based

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Convert `<img>` to `next/image`

**Files:**
- Modify: all 6 `src/app/**/page.tsx`

**Interfaces:**
- Produces: optimized images (AVIF/WebP, lazy by default).

- [ ] **Step 1: Add the import + convert, per the two patterns below**

For full-bleed / `object-cover` hero & section images, use `fill` inside a positioned parent:
```tsx
import Image from 'next/image'
// <img src="/hero-bg.jpg" alt="" className="w-full h-full object-cover" />  becomes:
<Image src="/hero-bg.jpg" alt="" fill sizes="100vw" className="object-cover" priority />
// ensure the wrapping element has `position: relative` (Tailwind `relative`) and a defined size.
```
For inline images with known box size, use explicit dimensions:
```tsx
<Image src="/story-furniture.jpg" alt="…" width={600} height={400} className="…" />
```

Apply to the exact images from the inventory: `hero-bg.jpg` (Home L644, Impact hero), `platform-hero.jpg` (Platform L179), `impact-hero.jpg` (Impact L376), `about-team.jpg` (About L79), `solutions-*.jpg` (Solutions L230-233), `story-*.jpg` (Stories L200/L221/L242), `hero-overlay-pattern.png` (Stories L632, decorative — `fill` + `aria-hidden`).

- [ ] **Step 2: Fallback rule (no guessing).** If a specific hero fights `fill` (layout breaks) and the correct intrinsic size isn't obvious, leave that one as a plain `<img>` with a `// TODO(M0-C): next/image` comment rather than shipping a broken layout. Note which were deferred in the commit body.

- [ ] **Step 3: Build + visually verify each route**

Run: `npm run build && npm run start &` then load each route at `http://localhost:3000` and confirm images render and layout is unchanged. Stop the server after.
Expected: all routes render; heroes fill correctly; no console image errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "perf(m0b): convert <img> to next/image (AVIF/WebP, lazy)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Prune the dead shadcn/Radix tree and unused dependencies

**Files:**
- Delete: `src/components/ui/` (entire dir), `src/hooks/use-mobile.ts`, `components.json`, and `src/lib/utils.ts` **if** confirmed unused.

- [ ] **Step 1: Confirm the entire `ui/` tree and helpers are unimported by live code**

Run:
```bash
grep -rnE "@/components/ui|use-mobile|@/lib/utils|from ['\"].*utils['\"]" src/app src/components 2>/dev/null || echo "ALL DEAD — safe to remove"
```
Expected: `ALL DEAD — safe to remove`. If anything prints, that file is live — stop and reconcile before deleting.

- [ ] **Step 2: Delete the dead source**

```bash
git rm -r src/components/ui
git rm src/hooks/use-mobile.ts components.json
git rm src/lib/utils.ts   # only if Step 1 showed utils is unimported
rmdir src/hooks 2>/dev/null || true
```

- [ ] **Step 3: Uninstall the dead dependencies**

```bash
npm uninstall \
  @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-aspect-ratio \
  @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible \
  @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar \
  @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress \
  @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select \
  @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot \
  @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toggle \
  @radix-ui/react-toggle-group @radix-ui/react-tooltip \
  @hookform/resolvers react-hook-form zod recharts embla-carousel-react vaul sonner \
  date-fns react-day-picker react-resizable-panels input-otp cmdk class-variance-authority \
  next-themes plugin-inspect-react-code
```
> Also remove `clsx` and `tailwind-merge` **only if** `src/lib/utils.ts` was deleted in Step 2 (they exist solely for `cn()`): `npm uninstall clsx tailwind-merge`.
> Keep: `react`, `react-dom`, `next`, `gsap`, `@gsap/react`, `framer-motion`, `lucide-react`.

- [ ] **Step 4: Verify nothing broke**

Run: `npm run typecheck && npm run build 2>&1 | tail -8`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(m0b): remove dead shadcn/Radix tree and unused deps

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Lead-capture Route Handler (thin BFF contract)

**Files:**
- Create: `src/app/api/leads/route.ts`

**Interfaces:**
- Produces: `POST /api/leads` accepting `{ name?, email, source }`, returning the standard envelope `{ ok, data }` / `{ ok, error }`. In M1 this proxies the Express `/leads`; until `NEXT_PUBLIC_API_BASE_URL` is set it returns a clear "not yet wired" response. **Not a data store.**

- [ ] **Step 1: Write the route handler**

```ts
import { NextRequest, NextResponse } from 'next/server'

type LeadBody = { name?: string; email?: string; source?: string }

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let body: LeadBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'BAD_JSON', message: 'Invalid JSON body' } }, { status: 400 })
  }

  if (!body.email || !emailRe.test(body.email)) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_EMAIL', message: 'A valid email is required' } },
      { status: 422 },
    )
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!apiBase) {
    // M1 wires this to the Express /leads endpoint. Until then, accept-and-acknowledge
    // WITHOUT persisting (Next is not a data store — ADR-001).
    return NextResponse.json(
      { ok: false, error: { code: 'BACKEND_NOT_WIRED', message: 'Lead capture goes live with the M1 backend' } },
      { status: 503 },
    )
  }

  const res = await fetch(`${apiBase}/leads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: body.name ?? null, email: body.email, source: body.source ?? 'web' }),
  })
  const data = await res.json().catch(() => null)
  return NextResponse.json(data ?? { ok: false, error: { code: 'UPSTREAM', message: 'Lead service error' } }, { status: res.status })
}
```

- [ ] **Step 2: Write a test of the validation contract** (no backend configured)

Create `src/app/api/leads/route.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

function req(body: unknown) {
  return new NextRequest('http://localhost/api/leads', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/leads', () => {
  it('rejects a missing/invalid email with 422', async () => {
    const res = await POST(req({ name: 'A' }))
    expect(res.status).toBe(422)
  })
  it('accepts a valid email but reports backend-not-wired (503) until M1', async () => {
    const res = await POST(req({ email: 'merchant@example.co.za', source: 'contact' }))
    expect(res.status).toBe(503)
  })
})
```

- [ ] **Step 3: Install + configure Vitest, run the test**

```bash
npm install -D vitest
```
Add to `package.json` scripts: `"test": "vitest run"`. Then:
Run: `npx vitest run src/app/api/leads/route.test.ts`
Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(m0b): add /api/leads thin BFF route handler + contract test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Flip CI lint to blocking, ESLint for Next, README scripts

**Files:**
- Modify: `.github/workflows/ci.yml`, `README.md`
- Create: `eslint.config.js` or `.eslintrc.json` (Next ESLint)

**Interfaces:**
- Produces: a CI that runs `lint` as a blocking step (the shadcn errors that forced non-blocking are gone).

- [ ] **Step 1: Initialize Next ESLint (if not already configured by `next lint`)**

Run: `npx next lint` — choose the **Strict** config when prompted; it writes the ESLint config. Then:
Run: `npm run lint`
Expected: passes (0 errors). Fix any real issues it surfaces in migrated files.

- [ ] **Step 2: Make lint + test blocking and add the test step in `ci.yml`**

Replace the lint/audit steps so lint and test are blocking:
```yaml
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm run test
      - name: Build
        run: npm run build
      - name: Audit (non-blocking)
        run: npm audit --audit-level=moderate || true
```
(Keep `npm ci` and `npm run typecheck` steps above as they were.)

- [ ] **Step 3: Update README scripts table**

In `README.md`, change the lint row from "currently fails on vendored shadcn code; resolved in M0-B" to "Lint (Next.js ESLint, blocking in CI)", and change the Setup `npm run dev` comment to note Next.js, and `Status` line to "Next.js (App Router) — migrated from the Vite baseline in M0-B."

- [ ] **Step 4: Verify the full local gate**

Run: `npm ci && npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci(m0b): lint + test now blocking; Next ESLint; README scripts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Final verification, route smoke check, push & PR

- [ ] **Step 1: Clean install + full gate (mirrors CI)**

```bash
rm -rf node_modules .next
npm ci && npm run typecheck && npm run lint && npm run test && npm run build
```
Expected: all green; build lists all 6 routes + `/api/leads`.

- [ ] **Step 2: Manual route smoke check**

Run `npm run start`, then load `/`, `/platform`, `/impact`, `/solutions`, `/stories`, `/about` and confirm: clean URLs (no `#`), navbar/footer present, active-link highlighting works, GSAP/Framer animations run, images render, no console errors. Stop the server.

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin feature/m0b-next-migration
gh pr create --title "M0-B: Vite → Next.js migration + dead-code prune" \
  --body "Framework port to Next.js App Router; dead shadcn/Radix prune; /api/leads BFF contract. No design/copy changes. Content bugs deferred to M0-C." \
  --base main
```

- [ ] **Step 4: STOP for validation.** Do not merge or start M0-C. The PR returns to Claude Code for `/code-review` + `verify` against this plan's acceptance criteria.

---

## Acceptance Criteria (validated in Claude Code before merge)

- [ ] App runs on Next.js App Router; all 6 routes serve at clean URLs (no hash).
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all pass; CI lint + test are blocking.
- [ ] Zero `react-router` references in `src/` and in `package.json`.
- [ ] `src/components/ui/`, `use-mobile.ts`, `components.json` removed; dead deps uninstalled; `next build` bundle no longer ships them.
- [ ] Navbar/Footer/pages are `"use client"`; GSAP + Framer animations work; active-nav highlighting works via `usePathname`.
- [ ] Images use `next/image` (or carry an explicit `TODO(M0-C)` if a hero was deferred per Task 12 Step 2).
- [ ] `/api/leads` validates input and returns the standard envelope; it is not a data store; contains no secrets.
- [ ] No visual/copy/design changes vs the Vite baseline; the 4 known content bugs are still present (they are M0-C).

## Self-Review

**Spec coverage** (vs manifest §8 frontend M0-B + roadmap §6 "free wins"): Next migration (Tasks 1–11) ✅; `error.tsx`/`not-found.tsx` (Task 2) ✅; `next/image` (Task 12) ✅; dead-code prune (Task 13) ✅; lead BFF (Task 14) ✅; CI lint blocking (Task 15) ✅. Per-page SEO Metadata API: root metadata done (Task 2); per-route metadata is light here and completed in M0-C with the legal pages — noted, not a gap. i18n/PWA are M1 per the roadmap, not M0-B.

**Placeholder scan:** No "TODO/implement later" in executable steps except the deliberate, bounded `TODO(M0-C)` fallback in Task 12 Step 2 (a named deferral with a rule), and the `BACKEND_NOT_WIRED` 503 in Task 14 (the explicit M1 contract). No vague "add error handling."

**Type/name consistency:** `@/components/Navbar`/`Footer` default exports (Tasks 3–4) match the imports in `layout.tsx` (Task 2). `typecheck` script (M0-A) reused in CI. `NEXT_PUBLIC_API_BASE_URL` matches the var documented in the M0-A `.env.example`. Envelope shape `{ ok, data | error }` matches the chassis standard cited in DECISIONS.md.
