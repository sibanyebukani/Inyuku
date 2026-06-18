# Frontend UX, Content & Feature Gaps Audit Report

**Project:** Inyuku Digital  
**Repository:** `/home/sibnaye/Development/Inyuku`  
**Focus area:** Frontend UX, Content & Feature Gaps  
**Date:** 2026-06-18  
**Auditor:** Kimi Code CLI  

---

## 1. Scope & Methodology

This audit focused on the user-facing experience, content completeness, and interactive feature gaps of the Inyuku Digital marketing SPA. The following files and directories were inspected:

- Configuration: `package.json`, `vite.config.ts`, `tsconfig*.json`, `tailwind.config.js`, `eslint.config.js`, `components.json`, `index.html`
- Entry & layout: `src/main.tsx`, `src/App.tsx`, `src/components/Layout.tsx`, `src/components/Navbar.tsx`, `src/components/Footer.tsx`
- Pages: `src/pages/Home.tsx`, `Platform.tsx`, `Impact.tsx`, `Solutions.tsx`, `Stories.tsx`, `About.tsx`
- Assets: `public/` (images)
- UI primitives: `src/components/ui/*` (scanned for usage)

Automated checks attempted:

- `npm run build` → failed (`sh: 1: tsc: not found`)
- `npm run lint` → failed (`sh: 1: eslint: not found`)
- `npm install` → failed (`ENOTFOUND npm.mirrors.msh.team`)

> **Note:** No source files were modified during this audit. The only action taken was an attempted `npm install` to enable build/lint verification; it failed due to network/mirror unavailability, leaving `node_modules` incomplete.

---

## 2. Build / Tooling Verification Note

The codebase could not be type-checked, linted, or built in this environment because the installed `node_modules` is incomplete. `typescript`, `eslint`, and `vite` packages are missing from `node_modules/`, and a fresh install could not be fetched:

```text
npm error network request to https://npm.mirrors.msh.team/@gsap/react/-/react-2.1.2.tgz failed, reason: getaddrinfo ENOTFOUND npm.mirrors.msh.team
```

As a result, this audit is based on static code review. All findings should be re-validated by running `npm install`, `npm run build`, and `npm run lint` in an environment with network access.

---

## 3. Current State Summary

**Implemented:**

- Six marketing pages with rich section layouts and animations (GSAP + Framer Motion).
- Responsive Tailwind CSS styling, custom color palette, and shadcn/ui primitives.
- Hash-based client-side routing via `react-router` v7.
- Consistent visual design language and brand colors (`#E86A34`, `#F6F2EC`, etc.).

**Missing / Broken for production:**

- Almost every primary CTA is either a no-op `<button>` or routes to a generic page.
- All forms are unhandled (no validation, no backend, no error/success states beyond a simple “Thank You” screen).
- Footer legal links route to `/` instead of real pages.
- The Stories page category filter is wired incorrectly and does not filter.
- Two data visualizations display incorrect values.
- Team section uses placeholder names and generic avatars.
- No 404 page, no SEO meta per route, no favicon, no contact flow, no demo/video modal.
- Accessibility gaps: missing labels, focus management, reduced-motion support, and skip links.

---

## 4. Detailed Findings

### 4.1 Critical — Core CTAs and conversion flows are non-functional

Primary conversion buttons across the site either do nothing or lead users in circles.

| Location | Element | Current behavior | File / Lines |
|----------|---------|------------------|--------------|
| Platform hero | **Watch Demo** button | Plain `<button>` with no `onClick`, no modal, no video | `src/pages/Platform.tsx:233-239` |
| Platform mid-page | **Create Free Account** | Links to `/platform` (same page) | `src/pages/Platform.tsx:720-726` |
| Platform mid-page | **Schedule a Demo** | Links to `/about` (no demo form) | `src/pages/Platform.tsx:727-733` |
| Impact hero | **Download Impact Report** | Plain `<button>` with no file/download action | `src/pages/Impact.tsx:423-429` |
| Home / Footer / About CTAs | **Talk to Our Team**, **Partner With Us**, **Contact the Team** | Link to `/about`, which has no contact form | `src/pages/Home.tsx:876-884`, `src/components/Footer.tsx:55-64`, `src/pages/About.tsx:897-936` |
| Solutions CTA | **Compare All Features** | Links to `/platform` (same page) | `src/pages/Solutions.tsx:484-489` |

**Impact:** Users cannot sign up, request a demo, download collateral, or contact the company. The site acts as a brochure with broken conversion paths.

**Recommended fix:**

- Replace no-op buttons with real actions or remove until implemented.
- Create a `/contact` route with a working form (or integrate a form backend such as Formspree, HubSpot, or a custom API).
- Add a download handler for the impact report (e.g., gated PDF).
- Add a demo request modal/page with scheduling integration.

---

### 4.2 Critical — Forms are unhandled

#### 4.2.1 Impact report download form

`src/pages/Impact.tsx:780-833`

```tsx
const [email, setEmail] = useState('')
...
<motion.form ... onSubmit={(e) => e.preventDefault()}>
  <input type="email" value={email} onChange={...} placeholder="Enter your email" />
  <button type="submit">Download Report</button>
</motion.form>
```

- Collects email but never sends it anywhere.
- No validation feedback, loading state, error state, or privacy consent.
- No visible `<label>`; relies solely on placeholder text (accessibility issue).

#### 4.2.2 Share Your Story form

`src/pages/Stories.tsx:419-589`

```tsx
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  setSubmitted(true)
}
```

- Sets local `submitted` state to true but does not POST data.
- No email field, so Inyuku cannot follow up.
- No file upload for photos/testimonials.
- No CAPTCHA or honeypot → vulnerable to spam if connected.

**Recommended fix:**

- Wire forms to a backend endpoint or third-party service.
- Add client-side validation, loading/error/success states, and spam protection.
- Associate `<label htmlFor="...">` with each input; add an email field to the story form.

---

### 4.3 High — Broken / placeholder navigation and footer links

#### 4.3.1 Footer legal links route to Home

`src/components/Footer.tsx:146-151`

```tsx
<Link to="/">Privacy Policy</Link>
<Link to="/">Terms of Service</Link>
```

Neither `/privacy` nor `/terms` routes exist in `App.tsx`.

#### 4.3.2 Footer resource links point to non-existent pages

`src/components/Footer.tsx:17-22`

```tsx
const resourceLinks = [
  { label: 'Help Center', path: '/platform' },
  { label: 'Developer API', path: '/platform' },
  { label: 'Partner Program', path: '/about' },
  { label: 'Contact', path: '/about' },
]
```

There are no dedicated Help Center, API docs, Partner Program, or Contact pages.

#### 4.3.3 Footer platform links all route to `/platform`

`src/components/Footer.tsx:3-8`

Four distinct feature labels all link to the same generic platform page instead of anchored sections or feature-specific pages.

**Recommended fix:**

- Create `/privacy`, `/terms`, `/help`, `/developers`, `/partners`, and `/contact` routes.
- Add in-page anchors on `/platform` (e.g., `/platform#whatsapp`) and link footer items to them.

---

### 4.4 High — Stories page category filter is broken

`src/pages/Stories.tsx:185-255` and `612-614`

Stories are tagged with `storyKey` values `'artisans'`, `'catering'`, `'retail'`, but the filter map uses different keys:

```tsx
const categoryFilterMap: Record<string, string[]> = {
  'thabo': ['All Stories', 'Artisans'],
  'nomsa': ['All Stories', 'Catering'],
  'david': ['All Stories', 'Retail'],
}
```

The lookup in `isStoryVisible` is:

```tsx
return categoryFilterMap[story.storyKey]?.includes(activeFilter) ?? true
```

Because `story.storyKey` is never `'thabo'`, `'nomsa'`, or `'david'`, the lookup returns `undefined`, and the `?? true` fallback makes every story visible for every filter. The “Services” category has no associated story at all.

**Recommended fix:**

```tsx
const categoryFilterMap: Record<string, StoryCategory[]> = {
  artisans: ['All Stories', 'Artisans'],
  catering: ['All Stories', 'Catering'],
  retail: ['All Stories', 'Retail'],
}
```

Also add a “no stories found” message when a category has no matches.

---

### 4.5 High — Data visualizations misrepresent the numbers

#### 4.5.1 Impact donut chart shows 10% fill for a 90% statistic

`src/pages/Impact.tsx:212-214`

```tsx
const circumference = 2 * Math.PI * 120
const targetOffset = circumference * 0.9
```

With `strokeDasharray={circumference}` and animating `strokeDashoffset` from `circumference` to `circumference * 0.9`, the colored ring only covers 10% of the circle while the label reads “90% of informal businesses still cash-only.”

**Fix:** use `targetOffset = circumference * 0.1` for a 90% fill.

#### 4.5.2 Home banner stat for “910,000 businesses” renders incorrectly

`src/pages/Home.tsx:654-666`

```tsx
const count = useCountUp(Math.floor(value * 10), 1.5, trigger)
const display = suffix === ',000' ? Math.floor(count / 10) * 1000 : (count / 10).toFixed(1)
...
{prefix}{display}{suffix === ',000' ? ',000' : suffix}
```

For the `910,000` stat (`value=910`, `suffix=',000'`):

- `count` reaches `9100`.
- `display` becomes `Math.floor(9100 / 10) * 1000 = 910_000`.
- Final render: `910000,000`.

**Fix:** simplify the formatter with `Intl.NumberFormat` or remove the nested suffix multiplication.

---

### 4.6 High — Team section uses placeholder content

`src/pages/About.tsx:729-750` and `808-820`

```tsx
const teamMembers = [
  { name: 'Team Lead', role: 'Founder & CEO', focus: 'Strategy, partnerships, government relations' },
  { name: 'Tech Lead', role: 'CTO', focus: 'Platform architecture, AI/ML, product engineering' },
  ...
]
```

- Names are job titles, not people.
- Avatars are a generic `Users` icon inside a gray circle labeled `{/* Avatar placeholder */}`.

**Recommended fix:** Replace with real team members and photos, or remove the section until ready.

---

### 4.7 Medium — Accessibility gaps

| Issue | Location | Details |
|-------|----------|---------|
| **No visible input labels** | `src/pages/Stories.tsx:480, 502, 525, 555` | `<label>` elements lack `htmlFor`; `<input>`/`<textarea>` lack `id`. |
| **Placeholder-only label** | `src/pages/Impact.tsx:814-824` | Email input has no `<label>`; placeholder disappears once typed. |
| **Mobile menu lacks ARIA state** | `src/pages/Navbar.tsx:86-120` | Hamburger has `aria-label` but no `aria-expanded`; overlay is not a dialog and has no focus trap or `Esc` close. |
| **No skip link** | `src/components/Layout.tsx:5-15` | Keyboard users must tab through the entire navbar on every page. |
| **Focus styles missing or inconsistent** | Many pages | Inline `onMouseEnter`/`onMouseLeave` overrides replace Tailwind focus rings on nav links, footer links, and buttons. |
| **Motion not reduced for users who prefer it** | All pages | No `prefers-reduced-motion` checks; GSAP/Framer animations run regardless. |
| **Background-attachment fixed on mobile** | `src/pages/Home.tsx:174` | Can cause jitter and accessibility discomfort on iOS/low-end devices. |

**Recommended fix:**

- Use `htmlFor`/`id` for every form field; add visible labels.
- Add `aria-expanded={mobileOpen}`, `aria-controls`, focus trap, and `Esc` handler to the mobile menu.
- Add a “Skip to main content” link.
- Implement `prefers-reduced-motion` media query that disables GSAP/Framer animations.

---

### 4.8 Medium — Missing essential pages & features

- **No 404 / not-found route** (`src/App.tsx:10-22`). Unknown paths render a blank main area.
- **No favicon / manifest / apple-touch-icon** in `index.html`.
- **No per-route meta tags** (description, OG, Twitter, canonical). Only a global `<title>` exists.
- **No sitemap.xml or robots.txt**.
- **No cookie consent / privacy notice** despite email collection.
- **No demo video / modal** referenced by the “Watch Demo” button.
- **No real impact report PDF** referenced by the “Download Impact Report” button.
- **No contact page or contact details** beyond a static email address on About.
- **No error boundary**; a runtime React error can crash the entire SPA.

**Recommended fix:** Add the missing pages and assets, integrate `react-helmet-async` or similar for SEO, and add an `ErrorBoundary` at the root.

---

### 4.9 Medium — Performance & asset optimization

- **Large unoptimized images:** `public/hero-bg.jpg` (~998 KB), `public/hero-overlay-pattern.png` (~1.3 MB). No WebP/AVIF versions.
- **No lazy loading:** `<img>` tags do not use `loading="lazy"` or `decoding="async"`; below-fold images load eagerly.
- **No explicit image dimensions:** `w-full h-full object-cover` everywhere; cumulative layout shift (CLS) possible until images load.
- **Double animation library overhead:** Both GSAP + ScrollTrigger and Framer Motion are used for similar scroll/reveal effects.
- **Many unused shadcn components and dependencies** (`recharts`, `react-day-picker`, `cmdk`, `input-otp`, `vaul`, etc.) that may bloat the bundle even if tree-shaken.

**Recommended fix:**

- Convert hero/section images to WebP/AVIF with fallback JPEGs.
- Add `loading="lazy" decoding="async"` to non-hero images.
- Set `width`/`height` or `aspect-ratio` containers to reserve space.
- Audit and remove unused UI primitives and animation libraries.

---

### 4.10 Low — Routing & architectural observations

- **HashRouter** is used (`src/main.tsx:7`). Marketing sites benefit from clean URLs and server-side path fallback; consider `BrowserRouter` with a `200.html`/`_redirects` rule.
- **`plugin-inspect-react-code` is enabled unconditionally** in `vite.config.ts:9`. It injects source-code metadata into the DOM and should only run in development.
- **`next-themes` is installed but unused**; dark mode CSS variables exist but there is no provider or toggle.
- **`components.json` misnames Tailwind config** as `postcss.config.js` instead of `tailwind.config.js` (`components.json:7`). This does not appear to break the build but is incorrect for shadcn/ui conventions.
- **`package.json` uses generic `name: "my-app"` and `version: "0.0.0"`**.

---

## 5. Priority Action Plan

| Priority | Item | Effort | Files / Areas |
|----------|------|--------|---------------|
| **Critical** | Fix dependency install / run build and lint | 1-2h | `package.json`, environment |
| **Critical** | Make primary CTAs functional (demo, signup, download, contact) | 1-2d | `Platform.tsx`, `Impact.tsx`, `About.tsx`, `Footer.tsx` |
| **Critical** | Wire forms to a backend and add validation | 1-2d | `Impact.tsx`, `Stories.tsx` |
| **High** | Fix Stories category filter | 30m | `Stories.tsx:251-255, 612-614` |
| **High** | Fix data viz inaccuracies (donut + banner stat) | 1h | `Impact.tsx:212-214`, `Home.tsx:654-666` |
| **High** | Add missing pages: Privacy, Terms, Contact, Help, API, Partners | 1-2d | new files + `App.tsx` + `Footer.tsx` |
| **High** | Replace placeholder team content or remove section | 2-4h | `About.tsx:729-836` |
| **Medium** | Improve accessibility (labels, skip link, focus, reduced motion) | 1d | all pages + `Navbar.tsx` + `Layout.tsx` |
| **Medium** | Optimize images and add SEO meta / favicon / sitemap | 1d | `public/`, `index.html`, per-page meta |
| **Medium** | Add 404 route and root ErrorBoundary | 2-4h | `App.tsx`, `main.tsx` |
| **Low** | Clean up unused deps/plugins and fix package metadata | 2h | `package.json`, `vite.config.ts`, `components.json` |

---

## 6. Appendix — Commands & Output

```bash
$ npm run build
> my-app@0.0.0 build
> tsc -b && vite build
sh: 1: tsc: not found

$ npm run lint
> my-app@0.0.0 lint
> eslint .
sh: 1: eslint: not found

$ npm install
npm error code ENOTFOUND
npm error syscall getaddrinfo
npm error errno ENOTFOUND
npm error network request to https://npm.mirrors.msh.team/@gsap/react/-/react-2.1.2.tgz failed, reason: getaddrinfo ENOTFOUND npm.mirrors.msh.team
```

---

*End of report.*
