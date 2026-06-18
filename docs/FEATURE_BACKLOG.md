# Inyuku Digital — Feature Backlog

This is the master list of features required to turn the current marketing SPA into a fully functioning application. Priorities are:

- **P0 — Critical:** Blocks launch or is required for the product to be real.
- **P1 — High:** Strongly needed for production readiness and user trust.
- **P2 — Medium:** Important for polish, growth, and maintainability.
- **P3 — Low:** Nice-to-have or future enhancements.

### Scope Tags

Each feature is also tagged with a **scope** for the first public launch:

- **MVP** — Required for the minimum trustworthy product.
- **v1.0** — Required for the full platform, but can ship after MVP.
- **Future** — Enhancement after product-market fit.

---

## MVP Feature Selection

For the first public launch, focus only on these backlog IDs. Defer everything else until the MVP is live and stable.

**Foundation:** FND-01, FND-02, FND-04, FND-05, FND-06, FND-08, FND-10, FND-12  
**Frontend:** FE-01, FE-03, FE-04, FE-07, FE-08  
**Marketing:** MKT-01, MKT-02, MKT-03, MKT-04, MKT-05, MKT-06, MKT-07, MKT-12, MKT-13, MKT-14, MKT-16, MKT-17  
**Backend:** BE-01, BE-02, BE-03, BE-04, BE-07, BE-09  
**Auth:** AUTH-01, AUTH-02, AUTH-03  
**Platform:** PLT-01  
**Integrations:** INT-01 (sandbox), INT-02 (sandbox), INT-04, INT-07, INT-08  
**DevOps:** DEV-01, DEV-02, DEV-04, DEV-05, DEV-06, DEV-07  
**QA:** QA-01 (smoke tests), QA-02 (critical paths), QA-03, QA-04  
**Operations:** OPS-01, OPS-06

> **Rule:** A feature not on the MVP list cannot block the public launch.

---

## 1. Foundation & Engineering Excellence

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| FND-01 | Git repository & remote | P0 | MVP | ❌ Not started | `main` branch, `.gitignore`, remote configured, initial commit |
| FND-02 | Project metadata cleanup | P0 | MVP | ❌ Not started | `package.json` name/version/description updated, README rewritten |
| FND-03 | Node/runtime pinning | P1 | v1.0 | ❌ Not started | `.nvmrc`, `engines` field in `package.json` |
| FND-04 | Clean dependency install | P0 | MVP | ❌ Not started | `npm ci` works; lockfile committed; npm audit clean |
| FND-05 | Lint passing | P0 | MVP | ❌ Not started | `npm run lint` exits 0 in CI and locally |
| FND-06 | Remove dev-only Vite plugin | P0 | MVP | ❌ Not started | `plugin-inspect-react-code` not loaded in production builds |
| FND-07 | Dead-code removal | P1 | v1.0 | ❌ Not started | Unused shadcn/ui components & deps removed or ESLint-ignored |
| FND-08 | Code formatter | P1 | MVP | ❌ Not started | Prettier/Biome configured; `format` and `format:check` scripts |
| FND-09 | Pre-commit hooks | P1 | v1.0 | ❌ Not started | Husky + lint-staged run lint/format on commit |
| FND-10 | Environment configuration | P0 | MVP | ❌ Not started | `.env.example`, `.env*.local` ignored, Zod validation of `import.meta.env` |
| FND-11 | TypeScript strictness | P1 | v1.0 | ✅ Already enabled | Strict flags on; add standalone `typecheck` script |
| FND-12 | Source structure | P1 | MVP | ❌ Not started | `src/types/`, `src/services/`, `src/lib/animations.ts`, `src/sections/` exist |
| FND-13 | Contribution guide | P2 | v1.0 | ❌ Not started | `CONTRIBUTING.md` with branching, PR, and review rules |
| FND-14 | License & changelog | P2 | Future | ❌ Not started | `LICENSE` and `CHANGELOG.md` created |

---

## 2. Frontend Architecture & UX

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| FE-01 | BrowserRouter + clean URLs | P1 | MVP | ❌ Not started | Replace `HashRouter`; host fallback rule configured |
| FE-02 | Route code splitting | P1 | v1.0 | ❌ Not started | `React.lazy()` + `Suspense`; main JS chunk <250 kB gzipped |
| FE-03 | Error boundary | P1 | MVP | ❌ Not started | Root error boundary; friendly fallback UI; Sentry integration |
| FE-04 | 404 / not-found page | P1 | MVP | ❌ Not started | Catch-all route with branded 404 page |
| FE-05 | Shared animation library | P2 | v1.0 | ❌ Not started | `src/lib/animations.ts` centralizes GSAP + Framer variants |
| FE-06 | Inline-style refactor | P2 | v1.0 | ❌ Not started | Most inline styles converted to Tailwind utilities/CSS vars |
| FE-07 | Responsive design verification | P1 | MVP | ❌ Not started | All pages tested on mobile, tablet, desktop |
| FE-08 | Accessibility compliance | P1 | MVP | ❌ Not started | Labels, skip link, focus management, `aria-current`, reduced motion; Lighthouse a11y ≥90 |
| FE-09 | Dark mode support | P3 | Future | ❌ Not started | Theme provider + toggle (leverage existing CSS variables) |
| FE-10 | Loading & empty states | P2 | v1.0 | ❌ Not started | Skeletons/spinners for async data; empty states for filters |

---

## 3. Content, Marketing Site & SEO

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| MKT-01 | Per-page SEO meta | P1 | MVP | ❌ Not started | Unique `<title>`, description, OG, Twitter, canonical per route |
| MKT-02 | Favicon & web manifest | P1 | MVP | ❌ Not started | Favicon, apple-touch-icon, `site.webmanifest` |
| MKT-03 | `robots.txt` & `sitemap.xml` | P1 | MVP | ❌ Not started | Generated at build or served from backend |
| MKT-04 | Image optimization | P1 | MVP | ❌ Not started | WebP/AVIF fallbacks, lazy loading, `srcset`, total image payload <1 MB |
| MKT-05 | Contact page | P1 | MVP | ❌ Not started | `/contact` with working form, map/address, email |
| MKT-06 | Privacy policy page | P1 | MVP | ❌ Not started | `/privacy` with POPIA/GDPR-compliant copy |
| MKT-07 | Terms of service page | P1 | MVP | ❌ Not started | `/terms` with legal copy |
| MKT-08 | Help center | P2 | v1.0 | ❌ Not started | `/help` with searchable FAQ/articles |
| MKT-09 | Developer API docs | P2 | v1.0 | ❌ Not started | `/developers` with API reference and getting started |
| MKT-10 | Partners page | P2 | v1.0 | ❌ Not started | `/partners` with program overview and application form |
| MKT-11 | Careers page | P2 | v1.0 | ❌ Not started | `/careers` with open roles and application flow |
| MKT-12 | Real team content | P1 | MVP | ❌ Not started | Replace placeholder names/avatars or remove section |
| MKT-13 | Fix Stories filter | P0 | MVP | ❌ Not started | Category tabs correctly filter stories |
| MKT-14 | Fix data visualizations | P0 | MVP | ❌ Not started | Donut chart shows 90%; banner stat formats `910,000` correctly |
| MKT-15 | Demo video / modal | P2 | Future | ❌ Not started | "Watch Demo" opens video modal or navigates to demo page |
| MKT-16 | Impact report download | P1 | MVP | ❌ Not started | Gated PDF download with email capture |
| MKT-17 | Cookie consent | P1 | MVP | ❌ Not started | Banner + consent management for analytics |

---

## 4. Backend, API & Data

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| BE-01 | Backend stack decision | P0 | MVP | ❌ Not started | Documented ADR for language/framework/database |
| BE-02 | Database design | P0 | MVP | ❌ Not started | ERD covering users, businesses, products, inventory, orders, payments, stories, leads |
| BE-03 | Database migrations | P0 | MVP | ❌ Not started | Migrations run automatically in CI and local dev |
| BE-04 | Typed API client | P0 | MVP | ❌ Not started | `src/services/api.ts` with auth, retries, error normalization |
| BE-05 | REST / GraphQL API | P0 | v1.0 | ❌ Not started | Endpoints for auth, forms, content, business data |
| BE-06 | OpenAPI / tRPC contract | P1 | v1.0 | ❌ Not started | Generated/served API docs |
| BE-07 | Lead capture API | P0 | MVP | ❌ Not started | Contact/demo/report forms POST to backend; validation + rate limiting |
| BE-08 | Story submission API | P1 | v1.0 | ❌ Not started | File upload, moderation queue, email notification |
| BE-09 | Content CMS | P1 | MVP | ❌ Not started | Admin ability to update stories, team, metrics, help articles |
| BE-10 | Search | P2 | v1.0 | ❌ Not started | Full-text search on help center, products, stories |
| BE-11 | Background jobs | P2 | v1.0 | ❌ Not started | Email sending, report generation, reminders queue |
| BE-12 | Webhooks | P1 | v1.0 | ❌ Not started | Receive webhooks from payment/WhatsApp providers |

---

## 5. Authentication & Authorization

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| AUTH-01 | Auth provider integration | P0 | MVP | ❌ Not started | Clerk / Auth0 / Supabase Auth chosen and configured |
| AUTH-02 | User sign-up | P0 | MVP | ❌ Not started | Email/phone + OTP or social sign-up |
| AUTH-03 | User sign-in | P0 | MVP | ❌ Not started | Secure session/token handling |
| AUTH-04 | Password reset | P1 | v1.0 | ❌ Not started | Email/SMS reset flow |
| AUTH-05 | Role-based access | P1 | v1.0 | ❌ Not started | Roles: merchant, admin, partner, support |
| AUTH-06 | Route guards | P1 | v1.0 | ❌ Not started | Protected `/dashboard/*` and admin routes |
| AUTH-07 | Organization / merchant accounts | P1 | v1.0 | ❌ Not started | Multi-user business accounts with owner/manager permissions |

---

## 6. Platform Features (The Real Product)

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| PLT-01 | Merchant onboarding wizard | P0 | MVP | ❌ Not started | Business type, language, WhatsApp number, location |
| PLT-02 | Merchant dashboard | P0 | v1.0 | ❌ Not started | Overview of sales, orders, customers, inventory alerts |
| PLT-03 | Product catalog | P0 | v1.0 | ❌ Not started | CRUD products with images, price, stock |
| PLT-04 | Inventory management | P0 | v1.0 | ❌ Not started | Stock tracking, low-stock alerts, reorder suggestions |
| PLT-05 | Order management | P0 | v1.0 | ❌ Not started | Create, update, track orders; statuses and notifications |
| PLT-06 | Customer directory | P1 | v1.0 | ❌ Not started | CRM with purchase history, notes, tags |
| PLT-07 | WhatsApp Commerce Engine | P0 | v1.0 | ❌ Not started | Send catalogs, receive orders, auto-replies via WhatsApp Business API |
| PLT-08 | AI Business Agent | P1 | v1.0 | ❌ Not started | Multi-language chat, inventory alerts, payment reminders, reports |
| PLT-09 | Digital payments | P0 | v1.0 | ❌ Not started | Card reader + payment links; instant settlement; transaction history |
| PLT-10 | Business credit profile | P1 | v1.0 | ❌ Not started | Verified transaction history for micro-loan eligibility |
| PLT-11 | Reports & analytics | P1 | v1.0 | ❌ Not started | Weekly/monthly sales, expenses, profit reports |
| PLT-12 | Multi-language UI | P1 | v1.0 | ❌ Not started | English, isiZulu, isiXhosa, Afrikaans, Sesotho, Setswana, Sepedi, Xitsonga |
| PLT-13 | Government program integration | P2 | Future | ❌ Not started | Spaza Shop Support Fund linkage, SASSA grant disbursement APIs |

---

## 7. Integrations

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| INT-01 | WhatsApp Business API / Twilio | P0 | MVP | ❌ Not started | Send/receive messages, templates approved |
| INT-02 | Payment gateway | P0 | MVP | ❌ Not started | Yoco / Paystack / Stripe integration; sandbox + live keys |
| INT-03 | AI provider | P1 | v1.0 | ❌ Not started | OpenAI / Anthropic / local LLM for business agent |
| INT-04 | Email service | P1 | MVP | ❌ Not started | SendGrid / Mailgun / AWS SES for transactional emails |
| INT-05 | SMS service | P2 | v1.0 | ❌ Not started | Twilio / Clickatell for OTPs and alerts |
| INT-06 | Cloud storage | P1 | v1.0 | ❌ Not started | S3 / Cloudflare R2 for images, documents, reports |
| INT-07 | Analytics | P1 | MVP | ❌ Not started | Google Analytics 4 / Plausible / Mixpanel events |
| INT-08 | Error tracking | P1 | MVP | ❌ Not started | Sentry configured for frontend and backend |
| INT-09 | Uptime monitoring | P2 | Future | ❌ Not started | UptimeRobot / Pingdom / status page |
| INT-10 | Feature flags | P2 | Future | ❌ Not started | LaunchDarkly / PostHog / env-based flags |

---

## 8. DevOps, Deployment & Security

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| DEV-01 | CI/CD pipeline | P0 | MVP | ❌ Not started | GitHub Actions: lint, typecheck, test, build, audit, deploy |
| DEV-02 | Deployment config | P0 | MVP | ❌ Not started | `vercel.json`, `netlify.toml`, or `Dockerfile` + `nginx.conf` |
| DEV-03 | Preview environments | P1 | v1.0 | ❌ Not started | Per-PR / per-branch deploy previews |
| DEV-04 | Staging environment | P0 | MVP | ❌ Not started | Staging deployment mirroring production |
| DEV-05 | Production environment | P0 | MVP | ❌ Not started | Live domain with SSL, DNS, CDN |
| DEV-06 | Security headers | P0 | MVP | ❌ Not started | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| DEV-07 | Secret management | P0 | MVP | ❌ Not started | Env vars in CI/hosting; no secrets in repo |
| DEV-08 | Containerization | P2 | v1.0 | ❌ Not started | Optional Dockerfile for backend or full-stack deployment |
| DEV-09 | Backup & rollback | P1 | v1.0 | ❌ Not started | Database backups, pinned releases, rollback procedure |
| DEV-10 | Dependency automation | P2 | v1.0 | ❌ Not started | Dependabot/Renovate configured |
| DEV-11 | Source maps policy | P2 | v1.0 | ❌ Not started | Uploaded to Sentry or disabled in production |
| DEV-12 | Infrastructure as Code | P3 | Future | ❌ Not started | Terraform / Pulumi / SST for cloud resources |

---

## 9. Testing & Quality Assurance

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| QA-01 | Unit / integration tests | P0 | MVP | ❌ Not started | Vitest + React Testing Library; coverage ≥70% |
| QA-02 | E2E tests | P0 | MVP | ❌ Not started | Playwright covering all routes, forms, CTAs |
| QA-03 | Accessibility tests | P1 | MVP | ❌ Not started | axe-core in CI; Lighthouse a11y ≥90 |
| QA-04 | Performance budget | P1 | MVP | ❌ Not started | Lighthouse performance ≥90; LCP <2.5s |
| QA-05 | Security tests | P1 | v1.0 | ❌ Not started | Dependency audit, CSP tests, basic OWASP checks |
| QA-06 | Load tests | P2 | v1.0 | ❌ Not started | API load test for expected concurrent users |
| QA-07 | Visual regression | P3 | Future | ❌ Not started | Chromatic / Percy / Playwright screenshots |

---

## 10. Operations & Post-Launch

| ID | Feature | Priority | Scope | Status | Acceptance Criteria |
|---|---|---|---|---|---|
| OPS-01 | Runbook | P1 | MVP | ❌ Not started | Incident response, rollback, on-call guide |
| OPS-02 | Monitoring dashboards | P1 | v1.0 | ❌ Not started | Error rate, performance, business metrics |
| OPS-03 | Alerting | P1 | v1.0 | ❌ Not started | PagerDuty / Opsgenie / Slack alerts for errors/downtime |
| OPS-04 | Release process | P2 | v1.0 | ❌ Not started | Semantic versioning, `CHANGELOG.md`, release notes |
| OPS-05 | Customer support flow | P2 | Future | ❌ Not started | Ticketing system, help center feedback loop |
| OPS-06 | Data retention policy | P1 | MVP | ❌ Not started | Documented retention and deletion procedures |

---

## 11. Quick-Win Checklist (Do These First)

If you only have a few days, focus on the items that turn the site from a static brochure into a trustworthy, working product:

- [ ] Fix `npm run lint` (FND-05)
- [ ] Remove dev-only plugin from production (FND-06)
- [ ] Initialize Git and push to remote (FND-01)
- [ ] Add `.env.example` (FND-10)
- [ ] Create `/contact`, `/privacy`, `/terms` pages (MKT-05, MKT-06, MKT-07)
- [ ] Wire contact/demo/download forms to a backend (BE-07, MKT-16)
- [ ] Fix Stories filter (MKT-13)
- [ ] Fix donut chart and banner stat (MKT-14)
- [ ] Add favicon + per-page meta tags (MKT-01, MKT-02)
- [ ] Add a GitHub Actions CI skeleton (DEV-01)

---

*This backlog should be treated as a living document. Update statuses and priorities as the team ships features and learns from users.*
