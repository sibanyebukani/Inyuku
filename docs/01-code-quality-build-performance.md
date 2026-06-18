# Inyuku Digital — Gap Analysis: Code Quality, Build & Performance

**Project:** Inyuku Digital  
**Path:** `/home/sibnaye/Development/Inyuku`  
**Focus area:** Code Quality, Build & Performance  
**Audited:** 2026-06-18  
**Auditor:** Kimi Code CLI  

---

## 1. Executive Summary

The Inyuku Digital marketing SPA builds successfully (`npm run build` exits 0), but it is **not production-ready** from a code-quality, performance, and maintainability standpoint. The codebase is burdened by a large shadcn/ui scaffold whose components are almost entirely unused, a debug-only Vite plugin that is active in production builds, unresolved ESLint errors, oversized unoptimized image assets, and several logic/quality issues in the page code. The current production bundle is ~635 kB of JavaScript (197 kB gzipped) for a static marketing site, with total deployable assets exceeding 4.5 MB mostly due to images.

**Top-line verdict:** Build passes, lint fails, bundle is heavier than necessary, and dead code/debug tooling is being shipped.

---

## 2. Audit Methodology

- **Environment:** Node.js v24.15.0, npm 11.12.1.
- **Dependency state:** `node_modules` was partially populated on disk but the `.bin` symlinks were missing. Running `npm install` failed with `ENOTFOUND npm.mirrors.msh.team` (network unavailable), but a subsequent attempt partially restored the toolchain. I was then able to run the scripts below. This left `node_modules` in a potentially inconsistent state and created `dist/`.
- **Commands executed:**
  - `npm run build` → succeeded, produced `dist/`.
  - `npm run lint` → failed with 10 ESLint errors.
- **Static review:** All source files under `src/`, `index.html`, `vite.config.ts`, `package.json`, `tsconfig*.json`, `tailwind.config.js`, `eslint.config.js`, `components.json`, and `public/` assets were inspected.

---

## 3. What Is Currently Implemented

- **Toolchain:** Vite 7 + React 19 + TypeScript 5.9 + Tailwind CSS 3.4 + PostCSS + ESLint 9 flat config.
- **Routing:** `react-router` v7 with `HashRouter` and a shared `Layout` (`Navbar`, `Footer`, `Outlet`).
- **Pages (6):** Home, Platform, Impact, Solutions, Stories, About.
- **Animation:** GSAP + `@gsap/react` + Framer Motion scroll-triggered and entrance animations.
- **Styling:** Tailwind utility classes mixed with heavy inline `style={{...}}` usage; custom colour palette in `tailwind.config.js`.
- **Components:** A single hand-written icon file (`src/components/icons.tsx`) and a full shadcn/ui component library under `src/components/ui/` (~50 files).
- **Assets:** 12 JPEG/PNG images in `public/`.

---

## 4. Top 10 Findings

| # | Finding | File(s) / Line(s) | Priority |
|---|---------|-------------------|----------|
| 1 | **ESLint fails with 10 errors** blocking CI/passing quality gates. | `src/components/ui/*`, `src/hooks/use-mobile.ts` | **Critical** |
| 2 | **Debug Vite plugin active in production builds** leaks source structure and bloats the build pipeline. | `vite.config.ts:4,9` | **Critical** |
| 3 | **Massive dead-code dependency tree**: 40+ shadcn/ui Radix dependencies installed but **zero** are imported by pages. | `package.json:12-61`, `src/pages/*` | **High** |
| 4 | **Production JS bundle > 500 kB** with chunk-size warning and no code-splitting. | Build output `dist/assets/index-BDrdCR1y.js` | **High** |
| 5 | **Unoptimized images**: hero pattern PNG is 1.3 MB, hero-bg.jpg is 976 kB; no lazy loading or modern formats. | `public/hero-overlay-pattern.png`, `public/hero-bg.jpg`, page image tags | **High** |
| 6 | **Stories filter logic is broken**: `categoryFilterMap` keys do not match `storyKey` values, so filters only show "All Stories". | `src/pages/Stories.tsx:251-255`, `:612-614`, `:672-684` | **High** |
| 7 | **Forms are non-functional placeholders**: story submission and impact report download only call `e.preventDefault()` / flip local state. | `src/pages/Stories.tsx:427-429`, `src/pages/Impact.tsx:812` | **High** |
| 8 | **Heavy inline-style usage** bypasses Tailwind’s purge/optimisation, duplicates theme tokens, and hurts maintainability. | All page files; e.g. `Home.tsx` 30 inline blocks | **Medium** |
| 9 | **Animation code duplicated** across pages (variants, GSAP registration, `useGSAP` wrappers); no shared animation module. | `src/pages/Home.tsx`, `Platform.tsx`, `Impact.tsx`, `Solutions.tsx`, `Stories.tsx`, `About.tsx` | **Medium** |
| 10 | **No error boundary, no 404 route, no lazy loading/Suspense** for pages; a single runtime error or bad route crashes the whole app. | `src/App.tsx`, `src/main.tsx` | **Medium** |

---

## 5. Detailed Findings & Evidence

### 5.1 Build & Tooling

#### 5.1.1 `npm run lint` fails with 10 errors
- **Evidence:**
  ```
  src/components/ui/badge.tsx:46       react-refresh/only-export-components
  src/components/ui/button-group.tsx:82  react-refresh/only-export-components
  src/components/ui/button.tsx:62      react-refresh/only-export-components
  src/components/ui/carousel.tsx:96    react-hooks/set-state-in-effect
  src/components/ui/form.tsx:159       react-refresh/only-export-components
  src/components/ui/navigation-menu.tsx:167  react-refresh/only-export-components
  src/components/ui/sidebar.tsx:611    react-hooks/purity (Math.random in render)
  src/components/ui/sidebar.tsx:725    react-refresh/only-export-components
  src/components/ui/toggle.tsx:45      react-refresh/only-export-components
  src/hooks/use-mobile.ts:14           react-hooks/set-state-in-effect
  ```
- **Impact:** Any CI pipeline running `npm run lint` will fail. Most errors originate from shadcn/ui boilerplate and the unused `use-mobile` hook.
- **Action:** Either (a) remove the unused shadcn components and hook, or (b) add targeted ESLint disable comments for known-safe shadcn patterns and keep them actively maintained.

#### 5.1.2 `plugin-inspect-react-code` loaded unconditionally in `vite.config.ts`
- **File:** `vite.config.ts:4,9`
- **Evidence:**
  ```ts
  import { inspectAttr } from 'plugin-inspect-react-code'
  plugins: [inspectAttr(), react()]
  ```
- **Impact:** This package injects source-file/line attributes into rendered DOM (a browser-to-editor inspector). It is a **development-only** tool and should never run in production. It exposes absolute source paths, increases transform overhead, and may affect bundle determinism.
- **Action:** Remove it from `vite.config.ts` entirely or gate it behind `process.env.NODE_ENV === 'development'` and keep it in `devDependencies` only.

#### 5.1.3 `components.json` points shadcn to `postcss.config.js` instead of `tailwind.config.js`
- **File:** `components.json:7`
- **Evidence:** `"config": "postcss.config.js"` under the `tailwind` block.
- **Impact:** shadcn CLI commands (`npx shadcn add`, `npx shadcn update`) will fail or write to the wrong file. The actual Tailwind config is `tailwind.config.js`.
- **Action:** Change `"config": "tailwind.config.js"`.

#### 5.1.4 Build succeeds but emits a single oversized chunk
- **Evidence:**
  ```
  dist/assets/index-BDrdCR1y.js   634.68 kB │ gzip: 197.95 kB
  (!) Some chunks are larger than 500 kB after minification.
  ```
- **Impact:** First-load performance on slow South African mobile networks will suffer. The warning also indicates poor code-splitting.
- **Action:** Introduce `React.lazy()` + `Suspense` per page, configure `build.rollupOptions.output.manualChunks` for vendor libraries, and consider route-based splitting.

#### 5.1.5 `node_modules` / `.bin` inconsistency observed during audit
- **Evidence:** Initial `.bin` was empty; `npm install` failed due to `npm.mirrors.msh.team` DNS failure, yet the toolchain binaries eventually became available. `dist/` was created by the audit.
- **Impact:** Reproducible builds cannot be guaranteed until a clean install from `registry.npmjs.org` succeeds.
- **Action:** Run `rm -rf node_modules package-lock.json && npm install` on a machine with clean internet access, commit the updated lockfile, and add CI that runs `npm ci`.

### 5.2 Dependencies & Dead Code

#### 5.2.1 Entire shadcn/ui component library is unused by the application
- **Evidence:**
  - `src/pages/*` imports only `react`, `react-router`, `gsap`, `@gsap/react`, `framer-motion`, `lucide-react`, and `@/components/icons`.
  - A grep for `@/components/ui` across `src/pages/` returns **zero** results.
  - `src/components/ui/*.tsx` files only import each other; none are referenced from the app surface.
- **Affected dependencies (sample):** `@radix-ui/react-*` (25+ packages), `recharts`, `embla-carousel-react`, `cmdk`, `react-day-picker`, `input-otp`, `vaul`, `sonner`, `next-themes`, `class-variance-authority`, `react-resizable-panels`, `react-hook-form`, `@hookform/resolvers`, `zod`, `date-fns`.
- **Impact:** `npm install` pulls hundreds of megabytes, install times are long, security surface area is huge, and the 2126 transformed modules slow the build.
- **Action:** Remove every dependency not imported by the app or its runtime components. Keep only: `react`, `react-dom`, `react-router`, `lucide-react`, `gsap`, `@gsap/react`, `framer-motion`, `clsx`, `tailwind-merge`, `class-variance-authority` (if any custom components need it), and their peer deps. Delete the unused `src/components/ui/*`, `src/hooks/use-mobile.ts`, and `src/lib/utils.ts` if no longer needed.

#### 5.2.2 `next-themes` imported by an unused component
- **File:** `src/components/ui/sonner.tsx:8`
- **Impact:** A Next.js-oriented dependency is installed solely for a `Toaster` component that is never rendered.
- **Action:** Remove `sonner.tsx`, `sonner` dependency, and `next-themes`.

### 5.3 Performance

#### 5.3.1 Unoptimized public image assets
- **Evidence:**
  | File | Dimensions | Size |
  |---|---|---|
  | `public/hero-overlay-pattern.png` | 1024×1024 | **1.3 MB** |
  | `public/hero-bg.jpg` | 2752×1536 | **976 kB** |
  | `public/impact-hero.jpg` | 1376×768 | 300 kB |
  | `public/solutions-trader.jpg` | 1200×896 | 268 kB |
- **Impact:** The pattern overlay is rendered at 3% opacity and tiled; a 1.3 MB PNG is extreme. hero-bg.jpg is shown behind a dark gradient and does not need 2.7 K width on most devices.
- **Action:**
  - Convert the pattern to a tiny compressed SVG or a 64×64/128×128 PNG.
  - Resize hero-bg.jpg to 1920×1080 max and compress (target < 200 kB).
  - Serve hero images in `srcset`/`<picture>` with WebP/AVIF fallbacks.
  - Add `loading="lazy"` and `decoding="async"` to below-the-fold images.

#### 5.3.2 No lazy loading, preloading, or resource hints
- **Evidence:**
  - No `React.lazy()` / `Suspense` for routes.
  - No `<link rel="preload">` for the hero font or critical CSS.
  - No `loading="lazy"` on any `<img>` tags in pages.
- **Impact:** All pages and images load eagerly on first navigation.
- **Action:** Implement route-based code splitting and add resource hints in `index.html`.

#### 5.3.3 `background-attachment: fixed` on hero background
- **File:** `src/pages/Home.tsx:174`
- **Impact:** Known jank and repaint cost on mobile browsers, especially with a 976 kB background image.
- **Action:** Replace with a static, compressed background or use `transform`-based parallax on a contained element.

### 5.4 Code Quality & Correctness

#### 5.4.1 Stories category filter is wired incorrectly
- **File:** `src/pages/Stories.tsx:251-255`, `:612-614`, `:672-684`
- **Evidence:**
  ```ts
  const categoryFilterMap: Record<string, string[]> = {
    'thabo': ['All Stories', 'Artisans'],
    'nomsa': ['All Stories', 'Catering'],
    'david': ['All Stories', 'Retail'],
  }
  ```
  But each story object uses `storyKey: 'artisans' | 'catering' | 'retail'`. The lookup `categoryFilterMap[storyKey]` therefore always returns `undefined`, and the `?? true` fallback means **every filter shows every story**.
- **Action:** Change map keys to `'artisans'`, `'catering'`, `'retail'` to match `storyKey`.

#### 5.4.2 Multiple buttons/forms have no real action
- **Files:**
  - `src/pages/Stories.tsx:427-429` — story submission only flips `submitted` state; no API call, no validation beyond `required`, no error handling.
  - `src/pages/Impact.tsx:812` — email form only calls `e.preventDefault()`.
  - `src/pages/Platform.tsx:238` — "Watch Demo" button is a no-op.
  - `src/pages/Impact.tsx:428` — "Download Impact Report" button is a no-op.
- **Action:** Wire forms to a backend endpoint or form service (e.g., Formspree, HubSpot, custom API) with loading/error/success states. Disable or remove buttons whose actions are not yet implemented.

#### 5.4.3 Inline styles dominate the page components
- **Evidence:** Count of inline-style blocks per page file:
  - `About.tsx`: 46
  - `Home.tsx`: 30
  - `Impact.tsx`: 14
  - `Platform.tsx`: 14
  - `Solutions.tsx`: 12
  - `Stories.tsx`: 30
- **Impact:** Inline styles bypass Tailwind compilation, make theming harder, duplicate colour hex codes (e.g., `#E86A34`, `#F6F2EC`), and increase JSX noise.
- **Action:** Convert colour/typography/spacing tokens to Tailwind utility classes or CSS custom properties, and reserve inline styles for truly dynamic values.

#### 5.4.4 Animation code duplicated across every page
- **Evidence:** Each page re-declares `fadeUpStagger`, `fadeUpItem`, `cardStagger`, `cardItem`, `easeSmooth`, and calls `gsap.registerPlugin(ScrollTrigger)`.
- **Impact:** Inconsistency risk, larger bundles, harder maintenance.
- **Action:** Create `src/lib/animations.ts` exporting shared Framer Motion variants and a single GSAP plugin registration module.

#### 5.4.5 No error boundary and no 404 route
- **Files:** `src/App.tsx`, `src/main.tsx`
- **Impact:** Any runtime exception unmounts the entire app; unknown paths fall through silently.
- **Action:** Add a React class-based error boundary and a catch-all `<Route path="*" element={<NotFound />} />`.

#### 5.4.6 Accessibility gaps
- **Evidence:**
  - Active nav links do not set `aria-current="page"` (`src/components/Navbar.tsx:38-64`).
  - Hamburger button has `aria-label` (good), but the mobile overlay has no `role="dialog"` or focus trap.
  - Form labels in `Stories.tsx` are not explicitly associated with inputs via `htmlFor`+`id`.
  - The impact report email input has no visible label (`src/pages/Impact.tsx:814-824`).
  - Many motion elements use `whileInView` but lack `prefers-reduced-motion` media-query respect.
- **Action:** Add ARIA attributes, visible labels, focus management, and respect `prefers-reduced-motion`.

### 5.5 TypeScript / Configuration

#### 5.5.1 TypeScript build passes but strict flags catch little
- `tsconfig.app.json` enables `strict`, `noUnusedLocals`, `noUnusedParameters`. The build succeeded, so no unused-parameter/local errors are present in source.
- **Caveat:** Because the dead shadcn components are in `src/`, they are type-checked and any future update to React/Radix types could break the build even though the components are unused.

#### 5.5.2 Vite `base: '/'` may need adjustment for static hosts
- **File:** `vite.config.ts:8`
- **Impact:** Works for root-domain deploys but breaks if the site is ever served under a sub-path.
- **Action:** Consider making `base` configurable via environment variable for non-root deployments.

---

## 6. Priority Action Plan

### Critical (do before any production deploy)
1. Fix or suppress the 10 ESLint errors; ensure `npm run lint` passes.
2. Remove `plugin-inspect-react-code` from `vite.config.ts` (or gate it to development only).
3. Clean install dependencies from `registry.npmjs.org` and commit a fresh `package-lock.json`.

### High (near-term, blocks production readiness)
4. Remove the entire unused shadcn/ui component tree and all associated unused dependencies.
5. Implement route-based lazy loading and vendor chunking to get the main JS bundle under ~250 kB gzipped.
6. Optimize/resize/compress images; target total image payload < 1 MB.
7. Fix the `Stories.tsx` category filter key mismatch.
8. Wire or remove non-functional forms and buttons.

### Medium (quality & maintainability)
9. Refactor inline styles into Tailwind utilities / CSS custom properties.
10. Create a shared animation library and centralise GSAP plugin registration.
11. Add an error boundary and a 404 route.
12. Improve accessibility: `aria-current`, focus trapping, form labels, reduced motion.
13. Fix `components.json` Tailwind config path.

### Low (polish)
14. Add `<meta name="description">`, Open Graph tags, favicon, and resource preloads.
15. Add unit/E2E tests (currently none).
16. Introduce Prettier and/or stricter ESLint rules (e.g., `jsx-a11y`).

---

## 7. Files Modified During This Audit

- `node_modules/` — partially refreshed by failed/partial `npm install` attempts.
- `dist/` — created by running `npm run build`.

No source files were edited.

---

## 8. Metrics Snapshot

| Metric | Value |
|---|---|
| `npm run build` | ✅ Succeeded |
| `npm run lint` | ❌ 10 errors |
| Production JS bundle (minified) | 634.68 kB |
| Production JS bundle (gzipped) | 197.95 kB |
| Production CSS bundle (minified) | 92.00 kB |
| Total image payload in `public/` | ~3.9 MB |
| Total `dist/` size | ~4.5 MB |
| Source LOC (`.tsx`/`.ts` in `src/`) | ~11,236 lines |
| shadcn/ui components imported by pages | 0 |
