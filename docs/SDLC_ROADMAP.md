> ⚠️ **SUPERSEDED — see `docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md`
> + `docs/DECISIONS.md` (EA-ADR-014/015).** The stack and sequencing have changed:
> **Clerk and Supabase no longer apply** — the platform is a Next.js client + Express/Prisma backend on
> Railway (Postgres 16 EU-pinned, Redis 7, Cloudflare R2), in-house JWT auth, TradeSafe escrow, 360dialog,
> Claude via `lib/ai.js`. This document is **retained as the technical-debt inventory of the original
> marketing site** — do not use it as the build plan.

# Inyuku Digital — Full SDLC Roadmap to Production

> **Purpose:** Move the current static marketing SPA to a fully functioning, deployable, maintainable application with all the IT, architecture, and engineering practices required for production.
>
> **Based on:**
> - `docs/01-code-quality-build-performance.md`
> - `docs/02-frontend-ux-content-gaps.md`
> - `docs/03-architecture-backend-it.md`
> - `docs/04-devops-deployment-sdlc.md`

---

## Before You Start: Decisions & Preconditions

Do not start implementation until these are settled. Each decision blocks at least one phase.

| # | Decision | Why it matters | Default recommendation |
|---|----------|----------------|------------------------|
| D1 | **Hosting target** | Determines whether you need a backend server, Docker, and a database. | Vercel/Netlify for the SPA; Railway/Render/Fly for a custom backend. |
| D2 | **Backend stack** | Affects hiring, speed, and vendor lock-in. | Supabase (fastest) or Node.js + PostgreSQL (most flexible). |
| D3 | **Auth provider** | Impacts onboarding UX, compliance, and cost. | Clerk or Supabase Auth. |
| D4 | **WhatsApp vendor** | Meta WABA approval can take days or weeks. | Start Meta Business verification immediately; keep Twilio sandbox as fallback. |
| D5 | **Payment vendor** | KYC/onboarding delays are common. | Yoco or Paystack for South Africa; use Stripe test mode for early UI work. |
| D6 | **Budget ceiling** | Paid services (Sentry, Clerk, Twilio, OpenAI) scale quickly. | Set monthly limits before enabling integrations. |
| D7 | **Team roles** | Prevents blocked hand-offs. | Assign owner for frontend, backend, DevOps, QA, content/legal. |

**If any of D1–D3 is undecided, treat Phase 1 (Backend) as blocked.**

---

## 1. Current State Snapshot

The codebase is a **React + Vite + TypeScript + Tailwind CSS marketing SPA** with six pages: `Home`, `Platform`, `Impact`, `Solutions`, `Stories`, and `About`. It looks visually complete but is still a brochureware frontend with no backend, no deployment automation, and several broken or placeholder features.

| Health Check | Result |
|--------------|--------|
| `npm run build` | ✅ Succeeds (~635 kB JS, ~92 kB CSS) |
| `npm run lint` | ❌ 10 errors (mostly unused shadcn/ui boilerplate) |
| `npm audit` | ⚠️ 1 low-severity `esbuild` finding |
| Git repository | ❌ Not initialized |
| CI/CD pipeline | ❌ None |
| Automated tests | ❌ None |
| Backend / API | ❌ None |
| Environment config | ❌ None (no `.env`, no `import.meta.env`) |
| Error boundary / 404 | ❌ None |
| Functional CTAs / forms | ❌ Mostly no-ops |

### Top 10 Blockers

1. No Git repo or version control.
2. No CI/CD or deployment configuration.
3. Lint failures blocking quality gates.
4. No backend — forms and product features are non-functional.
5. No environment / secret management.
6. No automated tests.
7. Broken UX: Stories filter, incorrect data visualizations, placeholder team.
8. Oversized bundle + unoptimized images (>4 MB assets).
9. No error boundary, no 404 route, no lazy loading.
10. Missing security headers, CSP, observability, and analytics.

---

## 2. SDLC Phases

### Phase 0 — Foundation & Tooling (Week 1)

Get the repository into a clean, reproducible, professional state before any feature work.

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 0.1 | Initialize Git repository and push to remote | `git log`, `.gitignore`, `main` branch, remote configured |
| 0.2 | Update project metadata | `package.json` name=`inyuku-digital`, version=`0.1.0`, description, author, license |
| 0.3 | Add runtime/tooling constraints | `.nvmrc`, `engines` in `package.json` |
| 0.4 | Refresh dependencies | Clean `npm install` from `registry.npmjs.org`, committed `package-lock.json` |
| 0.5 | Fix lint errors | `npm run lint` exits 0 (either fix shadcn boilerplate or configure ignores) |
| 0.6 | Remove dev-only plugin from production | `plugin-inspect-react-code` gated to dev or removed |
| 0.7 | Audit & remove dead dependencies | Unused shadcn/Radix deps removed; bundle warning resolved |
| 0.8 | Add formatter & pre-commit hooks | Prettier/Biome config, `format` script, Husky + lint-staged |
| 0.9 | Add environment scaffolding | `.env.example`, `.env*.local` in `.gitignore`, Zod env validation |
| 0.10 | Define branching strategy | `CONTRIBUTING.md` with `main`/`develop`/`feature/*` flow |
| 0.11 | Re-organize source folders | Add `src/types/`, `src/services/`, `src/lib/animations.ts`, `src/sections/` |
| 0.12 | Update README | Setup, scripts, architecture diagram, deploy instructions |
| 0.13 | Add CI skeleton | GitHub Actions workflow runs lint/typecheck/build on every PR/push to `main` |

### Phase 1 — Architecture & Backend Design (Weeks 2–4)

Design and start building the real platform that the marketing copy describes.

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 1.1 | Choose backend stack | Document decision (e.g., Node/Express + PostgreSQL, Supabase, Firebase, etc.) |
| 1.2 | Design data model | ERD covering users, businesses, products, inventory, orders, payments, stories, leads |
| 1.3 | Set up database | Migrations, seed data, local/dev/prod instances |
| 1.4 | Design API contract | OpenAPI/Swagger or tRPC; shared TypeScript types in `src/types/` |
| 1.5 | Build typed API client | `src/services/api.ts` with interceptors, retries, auth token injection, error normalization |
| 1.6 | Implement authentication | Sign-up, sign-in, password reset, OTP/2FA, role-based access (merchant, admin, partner) |
| 1.7 | Implement authorization | Route guards, permission middleware, organization/merchant isolation |
| 1.8 | Build core backend services | Leads/forms API, content CMS, user profile, business profile |
| 1.9 | Security baseline | HTTPS-only, CSP, security headers, rate limiting, input validation, secrets management |
| 1.10 | Compliance readiness | POPIA/GDPR data handling, privacy policy, terms of service, cookie consent flow |

**Recommended target architecture**

```text
┌─────────────────────────────────────────────────────────────┐
│  CDN / Edge (Cloudflare / Vercel / Netlify)                 │
│  ├── HTTPS + HSTS + security headers                        │
│  ├── Image optimization / caching                           │
│  └── Static fallback to index.html                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  React SPA (Vite)                                           │
│  ├── BrowserRouter + route guards                           │
│  ├── Error Boundary + Suspense boundaries                   │
│  ├── TanStack Query / SWR for server state                  │
│  ├── Zustand / Jotai for client state                       │
│  ├── API client in src/services/api.ts                      │
│  └── Environment-driven config                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS / JSON
┌──────────────────────▼──────────────────────────────────────┐
│  Backend / BaaS                                             │
│  ├── Auth service (Clerk / Supabase Auth / custom OIDC)     │
│  ├── Forms & leads API                                      │
│  ├── CMS / database for stories, content, team              │
│  ├── Payments / WhatsApp / AI integrations                  │
│  └── Admin dashboard API                                    │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2 — Frontend Engineering Cleanup (Weeks 3–4, parallel with Phase 1)

Make the frontend production-grade before adding features.

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 2.1 | Replace `HashRouter` with `BrowserRouter` | Clean URLs (`/platform`, `/impact`) + host fallback rule |
| 2.2 | Add code splitting | `React.lazy()` + `Suspense` per route; `manualChunks` for vendors; main chunk <250 kB gzipped |
| 2.3 | Add error boundary & 404 | Root error boundary, `Route path="*"`, friendly error UI |
| 2.4 | Centralize animations | `src/lib/animations.ts` for shared Framer Motion variants & GSAP registration |
| 2.5 | Refactor inline styles | Convert hex/style blocks to Tailwind utilities / CSS variables |
| 2.6 | Optimize images | WebP/AVIF fallbacks, responsive `srcset`, lazy loading, total image payload <1 MB |
| 2.7 | Add SEO per route | `react-helmet-async`, unique titles/meta/OG/canonical for each page |
| 2.8 | Add favicon & manifest | `public/favicon.ico`, `apple-touch-icon`, `site.webmanifest` |
| 2.9 | Add `robots.txt` & `sitemap.xml` | Generated at build time or served from backend |
| 2.10 | Accessibility pass | Labels, skip link, `aria-current`, focus trap, `Esc` close, `prefers-reduced-motion` |
| 2.11 | Add missing pages | `/contact`, `/privacy`, `/terms`, `/help`, `/developers`, `/partners` |

### Phase 3 — Features & Integrations (Weeks 5–8)

Implement the actual product capabilities and fix all broken marketing-site flows.

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 3.1 | Fix broken marketing UX | Stories filter works; donut chart shows 90%; banner stat shows `910,000`; team section real or removed |
| 3.2 | Wire lead-capture forms | Contact, demo request, impact report download POST to backend with validation, loading/error/success states |
| 3.3 | Wire "Share Your Story" form | File upload, email field, CAPTCHA/honeypot, admin moderation queue |
| 3.4 | User onboarding flow | Sign-up wizard for business type, language, WhatsApp number |
| 3.5 | Merchant dashboard (MVP) | Inventory, orders, customers, simple reports (could be separate app or `/dashboard`) |
| 3.6 | WhatsApp Commerce Engine | Product catalog, order messages, payment links via WhatsApp Business API / Twilio / Meta |
| 3.7 | AI Business Agent | Multi-language chat assistant, inventory alerts, payment reminders, report generation |
| 3.8 | Digital Payments | Card reader / payment link integration (Yoco / Paystack / Stripe), instant settlement, transaction history |
| 3.9 | Content CMS | Headless CMS or admin UI to update stories, team, impact metrics, help articles |
| 3.10 | Analytics & observability | Sentry, Web Vitals, GA/Plausible/Mixpanel, conversion event tracking |
| 3.11 | Cookie consent banner | Consent management for analytics/marketing cookies |

### Phase 4 — Quality Assurance (Weeks 8–9)

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 4.1 | Unit / integration tests | Vitest + React Testing Library; coverage target ≥70% |
| 4.2 | E2E tests | Playwright tests for every route, navigation, form, and CTA |
| 4.3 | Accessibility audit | axe / Lighthouse a11y score ≥90 |
| 4.4 | Performance budget | Lighthouse performance ≥90; LCP <2.5s on 3G |
| 4.5 | Security review | Dependency audit, CSP test, OWASP Top 10 sanity check |
| 4.6 | Manual QA checklist | Cross-browser, mobile, low-end device, offline/error states |

### Phase 5 — DevOps & Deployment (Weeks 9–10)

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 5.1 | CI/CD pipeline | GitHub Actions workflow: install → lint → typecheck → test → build → audit → deploy |
| 5.2 | Deployment target | `vercel.json`, `netlify.toml`, `Dockerfile` + `nginx.conf`, or Cloudflare Pages config |
| 5.3 | Preview environments | Per-PR / per-branch deploy previews |
| 5.4 | Domain & DNS | Custom domain, SSL/TLS, redirects, www vs apex |
| 5.5 | Security headers | HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| 5.6 | CDN & caching | Static asset caching, image optimization, edge rules |
| 5.7 | Secrets management | Env vars injected by CI/hosting platform, never in repo |
| 5.8 | Backup & rollback | Database backups, pinned releases, one-click rollback |
| 5.9 | Source maps | Uploaded to Sentry or disabled in production per policy |

### Phase 6 — Launch & Operations (Ongoing)

| # | Task | Acceptance Criteria |
|---|------|---------------------|
| 6.1 | Staging & production environments | Parity validated, smoke tests run against staging before prod |
| 6.2 | Launch checklist | DNS propagated, SSL valid, analytics receiving events, forms tested |
| 6.3 | Runbook & incident response | On-call guide, rollback steps, communication template |
| 6.4 | Monitoring & alerting | Uptime checks, Sentry alerts, error rate dashboards |
| 6.5 | Dependency hygiene | Dependabot/Renovate, scheduled `npm audit fix` |
| 6.6 | Release process | Semantic versioning, `CHANGELOG.md`, release notes |
| 6.7 | Feature flags | LaunchDarkly / PostHog / env-based flags for gradual rollouts |

---

## 3. Definition of Done (Release-Ready)

A feature or milestone is considered **done** when:

- [ ] Code is merged to `main` via pull request with at least one review.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run test` pass in CI.
- [ ] `npm audit --audit-level=moderate` passes (or exceptions are documented).
- [ ] E2E tests cover the happy path and at least one error path.
- [ ] Accessibility checklist is completed (labels, focus, motion, color contrast).
- [ ] Documentation (`README`, API docs, runbook) is updated.
- [ ] Monitoring/ analytics events are instrumented where relevant.
- [ ] Deployed to staging and manually smoke-tested.

---

## 4. Recommended First 48 Hours

If you want to move fast, do these in order:

1. `git init`, commit current code, push to GitHub/GitLab.
2. Decide on hosting (Vercel/Netlify/Cloudflare Pages for pure SPA; Railway/Render/Fly if adding a backend).
3. Fix the 10 lint errors and remove the debug Vite plugin.
4. Add `.env.example` and a GitHub Actions CI skeleton.
5. Create `/contact` and `/privacy` pages and wire the existing forms to a form backend (Formspree/HubSpot/custom) so CTAs actually work.
6. Fix the Stories filter and the two data-viz bugs.

---

## 5. Reference Documents

- `docs/01-code-quality-build-performance.md`
- `docs/02-frontend-ux-content-gaps.md`
- `docs/03-architecture-backend-it.md`
- `docs/04-devops-deployment-sdlc.md`
- `docs/FEATURE_BACKLOG.md` (detailed feature list)
- `docs/IMPLEMENTATION_READINESS.md` (review verdict and pre-flight checklist)

---

## Appendix A — MVP vs Full Platform Scope

**MVP Launch** (minimum trustworthy product):

- Foundation: Git, lint passing, env config, CI skeleton, clean dependencies.
- Marketing site: all current pages + `/contact`, `/privacy`, `/terms`; fixed CTAs and forms.
- Backend: lead-capture API, auth (sign-up/sign-in), basic merchant profile, content CMS.
- Integrations: at least one sandbox WhatsApp/payment demo; email service; Sentry; analytics.
- Ops: staging + production, security headers, CSP, backups, runbook, data retention policy.

**v1.0 Platform** (after MVP proves traction):

- Full merchant dashboard (inventory, orders, customers, reports).
- AI Business Agent in production.
- Multi-language rollout beyond English.
- Government / SASSA / municipal integrations.
- Advanced observability, load testing, infrastructure-as-code, feature flags.

---

## Appendix B — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WhatsApp Business API / Meta verification delays | Medium | High | Start Meta Business verification now; use Twilio sandbox for demos. |
| Payment provider KYC/onboarding delays | Medium | High | Apply to Yoco/Paystack early; use Stripe test mode for UI development. |
| Team bandwidth too small for full-stack delivery | High | High | Ship MVP first; defer AI agent and full dashboard to v1.0. |
| South African mobile connectivity constraints | High | High | Bundle <250 kB gzipped; optimize images; use CDN with edge nodes in ZA. |
| POPIA / GDPR compliance gaps | Medium | High | Privacy policy, consent banner, and data retention policy before collecting PII. |
| Removing shadcn/ui breaks future dashboard work | Low | Medium | Keep a curated `ui/` folder with ESLint ignores instead of deleting everything. |
| Scope creep before MVP launch | High | Medium | Use this roadmap as the change-control baseline; every new feature needs a backlog ID and a trade-off note. |

---

## Appendix C — Milestones & Release Criteria

| Milestone | Target | Release Criteria |
|-----------|--------|------------------|
| **M0: Repo health** | End of Phase 0 | Git remote, lint passes, CI skeleton, env config, clean deps, README updated. |
| **M1: MVP backend** | End of Phase 1 | Auth + lead API + CMS deployed to staging; API docs published. |
| **M2: MVP frontend** | End of Phase 2 | BrowserRouter, SEO, a11y, forms wired, new pages live, bundle <250 kB gzipped. |
| **M3: Working demo** | Mid Phase 3 | Sign-up → onboarding → WhatsApp/payment sandbox demo flows end-to-end. |
| **M4: Public launch** | End of Phase 5 | All P0/P1 MVP items done, security review, load test, runbook in place. |
| **M5: Scale & iterate** | Phase 6 | Dashboard, AI agent, multi-language, feature flags, advanced monitoring. |

---

## Appendix D — Traceability: Roadmap Tasks → Backlog IDs

| Roadmap Task | Backlog IDs |
|--------------|-------------|
| Git, metadata, lint, env, formatter | FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-08, FND-09, FND-10, FND-12, FND-13, FND-14 |
| BrowserRouter, error boundary, code splitting | FE-01, FE-02, FE-03, FE-04, FE-10 |
| Accessibility, SEO, images, missing pages | FE-06, FE-07, FE-08, MKT-01–MKT-07, MKT-17 |
| Broken UX fixes | MKT-12, MKT-13, MKT-14, MKT-15, MKT-16 |
| Backend & API | BE-01–BE-05, BE-07, BE-09 |
| Auth & onboarding | AUTH-01–AUTH-03, PLT-01 |
| Core platform features | PLT-02–PLT-13, BE-08, BE-10–BE-12 |
| Integrations | INT-01–INT-10 |
| CI/CD & deployment | DEV-01–DEV-07, DEV-09, DEV-11 |
| Testing | QA-01–QA-05 |
| Operations | OPS-01–OPS-06 |
