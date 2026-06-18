# Inyuku Digital — Application Architecture, Backend & IT Systems Gap Analysis

**Focus:** Application Architecture, Backend & IT Systems  
**Project:** Inyuku Digital (React + Vite + TypeScript + Tailwind CSS + shadcn/ui marketing SPA)  
**Audit Date:** 2026-06-18  
**Auditor:** Kimi Code CLI  
**Repository:** `/home/sibnaye/Development/Inyuku`

---

## 1. Executive Summary

The application is a purely static, client-side React marketing SPA. **There is no backend integration, no API client, no environment configuration, no data persistence, and no production-grade IT architecture.** Every interactive form on the site is a visual placeholder that does not transmit data anywhere. While this is acceptable for a brochureware landing experience, the product copy (WhatsApp Commerce, AI Business Agent, Digital Payments, Inventory Management) implies a real platform, which is entirely absent from the codebase.

Build tooling works and the production bundle can be generated, but the project is not architecturally ready for user sign-ups, payments, data capture, or secure deployment at scale.

---

## 2. Scope & Methodology

- Inspected `package.json`, `vite.config.ts`, `tsconfig*.json`, `components.json`, `eslint.config.js`, `index.html`, `src/pages/*`, `src/components/*`, `src/hooks/*`, `src/lib/*`, and `public/`.
- Ran `npm install`, `npm run build`, `npm run lint`, `npm run preview`, and `npm audit`.
- Searched the source for backend-related patterns: `fetch`, `axios`, `import.meta.env`, `process.env`, `localStorage`, `cookie`, API endpoints, service modules, contexts, and form handlers.

> **Note:** The initial `npm install` failed because `node_modules` was in a corrupted state (`ENOTEMPTY` on `@typescript-eslint/typescript-estree/node_modules/semver/classes`). To complete the audit, `node_modules` and `package-lock.json` were removed and regenerated. No source code was modified.

---

## 3. Current State — What Is Implemented

| Area | Implementation |
|------|----------------|
| **Frontend framework** | React 19.2.0 + React Router 7.6.1 (as a library) + Vite 7.3.5 |
| **Routing** | `HashRouter` in `src/main.tsx:7-9` with six routes declared in `src/App.tsx:12-21` |
| **Layout** | `Layout.tsx` wraps `Navbar`, `Outlet`, and `Footer` |
| **Styling** | Tailwind CSS 3.4.19 + custom color tokens in `tailwind.config.js` + shadcn/ui CSS variables |
| **Component library** | 50+ shadcn/ui components under `src/components/ui/*` |
| **Forms** | Two presentational forms exist: story submission (`src/pages/Stories.tsx:419-588`) and impact report download (`src/pages/Impact.tsx:780-833`) |
| **State management** | Local `useState` only; no context, store, or external cache |
| **Backend / API** | **None** |
| **Environment config** | **None** — no `.env`, `.env.example`, or `import.meta.env` references |
| **Tests** | **None** — no test runner, no test files, no `test` script |
| **CI/CD / Infra** | **None** — no Dockerfile, no GitHub Actions, no deployment configs |

---

## 4. Build, Lint & Security Checks

### 4.1 `npm run build`

```text
vite v7.3.5 building client environment for production...
✓ 2126 modules transformed.
dist/assets/index-N8H9VP2A.css   92.00 kB │ gzip:  15.36 kB
dist/assets/index-BDrdCR1y.js   634.68 kB │ gzip: 197.95 kB
✓ built in 15.50s

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
```

**Implication:** The bundle ships as a single 635 kB (198 kB gzipped) JS file because all six pages and 50+ shadcn components are eagerly imported. There is no code-splitting.

### 4.2 `npm run lint`

```text
✖ 10 problems (10 errors, 0 warnings)
```

All errors are inside generated shadcn/ui components or the `use-mobile` hook and are related to React rules of hooks / fast-refresh:

- `src/components/ui/carousel.tsx:96:5` — `setState` synchronously inside `useEffect`
- `src/components/ui/sidebar.tsx:611:26` — `Math.random` called during render
- `src/hooks/use-mobile.ts:14:5` — `setState` synchronously inside `useEffect`
- Several `react-refresh/only-export-components` errors in shadcn files (`badge.tsx`, `button-group.tsx`, `button.tsx`, `form.tsx`, `navigation-menu.tsx`, `sidebar.tsx`, `toggle.tsx`)

**Implication:** These lint failures block CI/CD quality gates and indicate generated component code that does not satisfy the configured ESLint rules.

### 4.3 `npm audit`

```text
esbuild  0.27.3 - 0.28.0
esbuild allows arbitrary file read when running the development server on Windows - GHSA-g7r4-m6w7-qqqr
severity: low
```

**Implication:** A transitive dev-dependency vulnerability exists. It only affects the Windows dev server, but should still be patched (`npm audit fix`).

---

## 5. Findings & Gaps

### 5.1 Backend & API Architecture

#### CRITICAL — No backend integration at all
- **File(s):** entire `src/` tree
- **Evidence:** No `fetch`, `axios`, `createServerFn`, tRPC, GraphQL, or WebSocket usage anywhere in application code. Grep for network calls returns only `node_modules`.
- **Impact:** Every feature described on the site (WhatsApp Commerce, AI agent, payments, inventory) is non-functional. User actions cannot be persisted, processed, or tracked.

#### CRITICAL — Forms submit to nowhere
- **File:** `src/pages/Stories.tsx:427-429`
  ```tsx
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }
  ```
- **File:** `src/pages/Impact.tsx:812`
  ```tsx
  onSubmit={(e) => e.preventDefault()}
  ```
- **Impact:** The “Submit Your Story” and “Download Report” forms capture personally identifiable information (name, business name, email) but never transmit it. Users receive fake success states. This damages trust and may violate POPIA/GDPR expectations.

#### CRITICAL — No service/API abstraction layer
- **File(s):** Missing `src/services/`, `src/api/`, `src/lib/api.ts`, or `src/lib/client.ts`
- **Impact:** There is no centralized place for API calls, request/response interceptors, error handling, retries, or auth token injection. Adding backend integration later will require broad refactoring across pages.

#### HIGH — No data model or shared types
- **File:** `info.md:21-23` references `src/types/` and `src/sections/`, but neither directory exists.
- **Impact:** TypeScript types are duplicated inline in components (e.g., `StoryCategory`, `SolutionCategory` inferred from arrays). There is no contract between frontend and backend.

---

### 5.2 Environment & Configuration

#### CRITICAL — No environment configuration
- **File(s):** No `.env`, `.env.example`, or `.env.local` in project root; no `import.meta.env` usage in source.
- **Evidence:** Search for `VITE_`, `import.meta.env`, or `process.env` in `src/` returns nothing.
- **Impact:** API base URLs, analytics IDs, feature flags, and third-party keys are either absent or would have to be hard-coded. This makes multi-stage deployments (dev/staging/prod) impossible without source changes.

#### HIGH — Hard-coded build settings
- **File:** `vite.config.ts:8`
  ```ts
  base: '/',
  ```
- **File:** `vite.config.ts:11`
  ```ts
  server: { port: 3000 }
  ```
- **Impact:** The base path and dev port are not environment-driven. Deploying under a sub-path or running alongside other services requires editing config.

#### MEDIUM — `components.json` tailwind config mismatch
- **File:** `components.json:7`
  ```json
  "config": "postcss.config.js"
  ```
- **Impact:** The shadcn schema expects the path to `tailwind.config.js`. Pointing it at `postcss.config.js` may break future `npx shadcn add` operations or component regeneration.

---

### 5.3 Routing & Navigation Architecture

#### HIGH — `HashRouter` used for a marketing site
- **File:** `src/main.tsx:2, 7-9`
  ```tsx
  import { HashRouter } from 'react-router'
  ...
  <HashRouter>
    <App />
  </HashRouter>
  ```
- **Impact:** URLs become `/#/platform`, `/#/impact`, etc. These are not SEO-friendly, cannot be properly indexed, produce poor social-share previews, and look unprofessional for a public marketing domain. For static hosting, `BrowserRouter` with a server catch-all fallback is preferred.

#### MEDIUM — No route-level metadata or Open Graph tags
- **File:** `index.html:6` sets a single global `<title>`.
- **Impact:** Every page shares the same title and lacks per-route meta descriptions, OG images, Twitter cards, and canonical URLs. Search engines and social platforms see identical metadata.

#### MEDIUM — No `robots.txt` or `sitemap.xml`
- **File(s):** Missing `public/robots.txt`, `public/sitemap.xml`
- **Impact:** Search engine discoverability is unmanaged.

---

### 5.4 State Management & Data Flow

#### HIGH — No global state, cache, or synchronization
- **Evidence:** No React Context, no Zustand/Redux/Jotai, no React Query / SWR, no TanStack Query.
- **Impact:** All content is hard-coded in JSX. Any dynamic data (pricing, stories, team members, reports) requires a code change and redeploy. Future authenticated state (user profiles, carts, transactions) has no place to live.

#### MEDIUM — Content is embedded directly in page files
- **Examples:**
  - `src/pages/About.tsx` contains team members array and partner logos inline.
  - `src/pages/Stories.tsx` contains hard-coded story objects.
- **Impact:** Marketing/content teams cannot update copy without engineering. A headless CMS or markdown-driven content layer should be introduced.

---

### 5.5 Error Handling & Resilience

#### HIGH — No error boundary
- **File:** `src/main.tsx:6-9`
  ```tsx
  createRoot(document.getElementById('root')!).render(
    <HashRouter>
      <App />
    </HashRouter>,
  )
  ```
- **Impact:** A single runtime error in any page or component will crash the entire SPA and display a blank screen. There is no fallback UI, no error logging to Sentry/DataDog, and no recovery path.

#### HIGH — No loading or fetching states architecture
- **Impact:** Because there are no network requests, there are no skeletons, spinners, or retry flows. When backend integration is added, every page will need these states designed and implemented.

---

### 5.6 Security

#### CRITICAL — PII collected without secure transport or storage
- **File:** `src/pages/Stories.tsx:419-588` and `src/pages/Impact.tsx:780-833`
- **Impact:** Form data is held only in React state and then discarded. Once a backend is added, these forms must use HTTPS-only endpoints, CSRF tokens, rate limiting, server-side validation, and secure storage. Currently none of that architecture exists.

#### HIGH — No Content Security Policy (CSP)
- **File:** `index.html:7-9`
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@...&display=swap" rel="stylesheet" />
  ```
- **Impact:** There is no `<meta http-equiv="Content-Security-Policy">` header or nonce strategy. External font/stylesheet loading is unrestricted. XSS mitigation is absent.

#### HIGH — No security headers strategy
- **Impact:** Missing `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS configuration. These must be set at the hosting/CDN layer (e.g., Netlify `_headers`, Vercel `vercel.json`, nginx, Cloudflare).

#### MEDIUM — Single 635 kB JS bundle increases attack surface
- **Evidence:** `npm run build` produces one `index-BDrdCR1y.js` (634.68 kB). Many shadcn components are installed but unused.
- **Impact:** Larger bundles mean more code exposed to the browser and slower parsing. Code-splitting and tree-shaking audit are needed.

#### LOW — Transitive dev vulnerability
- **Evidence:** `npm audit` reports low-severity `esbuild` arbitrary file read on Windows dev server.
- **Action:** Run `npm audit fix` and keep dependencies updated.

---

### 5.7 Observability, Analytics & IT Operations

#### HIGH — No observability or error tracking
- **Impact:** No Sentry, LogRocket, DataDog, or console error forwarding. No performance monitoring (Web Vitals), no user analytics (Google Analytics, Plausible, Mixpanel), and no conversion tracking for CTAs/forms.

#### HIGH — No IT infrastructure artifacts
- **Missing:**
  - `Dockerfile` / `docker-compose.yml`
  - CI/CD pipeline (`.github/workflows/`, GitLab CI, etc.)
  - Web server config (`nginx.conf`, `_headers`, `vercel.json`, `netlify.toml`)
  - `.nvmrc` or `engines` field in `package.json`
  - Health-check endpoint
- **Impact:** Deployment is a manual `npm run build` + upload. There is no reproducible build environment, no automated tests, no preview deployments, and no rollback strategy.

#### MEDIUM — No image optimization / CDN architecture
- **Evidence:** `public/hero-bg.jpg` is 998 kB, `public/hero-overlay-pattern.png` is 1.3 MB, `public/impact-hero.jpg` is 307 kB. They are copied unchanged into `dist/`.
- **Impact:** Large static assets are served without responsive sizes, modern formats (AVIF/WebP), or CDN caching. A production setup should use an image CDN (Cloudflare Images, Imgix, Vercel Image Optimization) or at least Vite image plugins.

---

### 5.8 Authentication & Authorization

#### MEDIUM — No auth architecture despite platform claims
- **Impact:** The site promotes “Get Started Free”, “Digital Payments”, and “AI Business Agent”. There is no sign-up, sign-in, password reset, OTP, role-based access, or organization/merchant account architecture. If/when a real app is added, auth must be designed from scratch.
- **Recommendation:** Adopt Clerk, Auth0, Supabase Auth, or a custom OAuth/OIDC backend early and route-protect dashboard pages.

---

## 6. Priority Action Plan

| Priority | Action | Rationale |
|----------|--------|-----------|
| **Critical** | Add a real backend or serverless API for form submissions, user accounts, and platform features. | Currently no user action is persisted; product claims are unsupported. |
| **Critical** | Create `src/services/` or `src/lib/api.ts` with typed HTTP client, interceptors, retries, and error normalization. | Prevents scattered `fetch` calls and establishes a backend contract. |
| **Critical** | Implement environment configuration (`.env.example`, `import.meta.env`, validation with Zod). | Required for dev/staging/prod separation and secret management. |
| **High** | Replace `HashRouter` with `BrowserRouter` and configure server catch-all + static hosting rewrite rules. | SEO-friendly URLs and professional appearance. |
| **High** | Add a React Error Boundary at the root and route level. | Prevents total blank-screen failures. |
| **High** | Add per-route `<title>`/`<meta>`/Open Graph tags (e.g., `react-helmet-async`) and `robots.txt` + `sitemap.xml`. | Marketing discoverability and social sharing. |
| **High** | Introduce a lightweight state/cache layer (TanStack Query / React Query) for server state and a store (Zustand/Jotai) for client state. | Needed as soon as any backend data is consumed. |
| **High** | Wire up forms to real endpoints with validation, loading/error states, CSRF protection, rate limiting, and privacy consent. | Current forms give fake success feedback. |
| **Medium** | Add observability: Sentry for errors, Web Vitals reporting, and analytics (Plausible/GA/Mixpanel). | Required to understand production health and conversions. |
| **Medium** | Add infrastructure as code: CI/CD pipeline, `Dockerfile` or platform config, deployment headers/CSP, `.nvmrc`, `engines`. | Enables repeatable, secure deployments. |
| **Medium** | Audit and remove unused shadcn/ui components; implement Vite code-splitting (`React.lazy` + `manualChunks`). | Reduces bundle size and attack surface. |
| **Low** | Run `npm audit fix`, fix the 10 ESLint errors in shadcn/ui generated code, and add a `test` script + smoke tests. | Clean quality gates and CI readiness. |

---

## 7. Architecture Recommendation

For a production-ready marketing + onboarding SPA, the recommended target architecture is:

```text
┌─────────────────────────────────────────────────────────────┐
│  CDN / Edge (Cloudflare / Vercel / Netlify)                 │
│  ├── HTTPS + HSTS + security headers                        │
│  ├── Image optimization / caching                           │
│  └── Static fallback to index.html (BrowserRouter)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  React SPA (Vite)                                           │
│  ├── BrowserRouter + route guards (future)                  │
│  ├── Error Boundary + Suspense boundaries                   │
│  ├── TanStack Query / SWR for server state                  │
│  ├── Zustand / Jotai for client state                       │
│  ├── API client in src/services/api.ts                      │
│  └── Environment-driven config (import.meta.env + Zod)      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS / JSON
┌──────────────────────▼──────────────────────────────────────┐
│  Backend / BaaS                                             │
│  ├── Auth service (Clerk / Supabase Auth / custom OIDC)     │
│  ├── Forms & leads API                                      │
│  ├── CMS or database for stories, content, team             │
│  └── Payments / WhatsApp / AI integrations                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Notes on Changes Made During Audit

- Removed the corrupted `node_modules` directory and regenerated `package-lock.json` so that `npm run build`, `npm run lint`, and `npm run preview` could be executed. No application source files were modified.

---

## 9. Top 10 Findings Summary

1. **No backend or API layer exists** — the entire app is a static SPA with no network client.
2. **All forms are non-functional** — story submission and report-download forms only set local state and display fake success messages.
3. **No environment configuration** — missing `.env`, `.env.example`, and `import.meta.env` usage.
4. **`HashRouter` harms SEO** — marketing URLs will contain `#` fragments and cannot be indexed effectively.
5. **No error boundary** — any runtime error will blank the entire page.
6. **No global state or caching layer** — only local `useState`; no context, TanStack Query, or store.
7. **No observability/analytics** — no error tracking, performance monitoring, or conversion analytics.
8. **No production IT artifacts** — no CI/CD, Docker, server config, `robots.txt`, `sitemap.xml`, or `.nvmrc`.
9. **Security headers & CSP absent** — external fonts loaded without CSP; no `X-Frame-Options`, HSTS, etc.
10. **Lint and dependency hygiene issues** — 10 ESLint errors (mostly in generated shadcn components) and one low-severity `esbuild` audit finding.
