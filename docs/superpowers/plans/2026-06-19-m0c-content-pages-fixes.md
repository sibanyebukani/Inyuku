# M0-C: Content-Bug Fixes, Missing Pages & Per-Route SEO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four known content bugs, remove the placeholder team, add the five missing routes (`/contact`, `/privacy`, `/terms`, `/help`, `/partners`) with DRAFT POPIA-aligned legal copy, fix the broken Footer links, give every route real SEO metadata, and make the existing forms accessible + validated — **without** wiring live submission (that lands in M1 with the Express backend).

**Architecture:** All work is on the Next.js App Router frontend (post-M0-B). The 6 existing pages are `"use client"`, so per-route metadata requires the standard split: a server `page.tsx` that `export`s `metadata` and renders a `"use client"` content component. New informational pages are server components; `/contact`'s form is a small client component. Forms get client-side validation, labels, and states now; the network POST to `/api/leads` is marked `TODO(M1)` per the founder decision to defer live capture.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind 3 (existing color tokens: `text-text-primary`, `text-text-secondary`, `accent-orange`, cream `#F6F2EC`), GSAP/Framer (unchanged).

## Global Constraints

- **Bug fixes must not alter unrelated design/copy.** Only the specific buggy lines change.
- **No live form submission** — defer to M1. Forms get validation/labels/states + a `TODO(M1): POST /api/leads` marker. Do not call the network.
- **Legal copy is DRAFT** — every `/privacy` and `/terms` page must carry a visible "DRAFT — pending legal review" banner and be grounded in `docs/POPIA.md`.
- **Resolved stack only** — no Clerk/Supabase/Stripe; no backend code.
- Branch: `feature/m0c-content-pages-fixes` off `main`. Frequent commits. `typecheck`/`lint`/`test`/`build` must stay green (all blocking in CI).
- Keep all pages' existing visual design; new pages use the existing color tokens for consistency.

---

### Task 1: Fix the Stories category filter

**Files:** Modify `src/app/stories/page.tsx`

- [ ] **Step 1: Correct the map keys** — replace the `categoryFilterMap` (currently lines ~254–258) so keys match the `storyKey` values (`artisans`/`catering`/`retail`):

```typescript
const categoryFilterMap: Record<string, string[]> = {
  artisans: ['All Stories', 'Artisans'],
  catering: ['All Stories', 'Catering'],
  retail: ['All Stories', 'Retail'],
}
```

- [ ] **Step 2: Add a "no stories" empty state** — where the filtered stories render, if none match `activeFilter`, show a message. Locate the story list render and add, after it, a fallback when the visible count is 0:

```tsx
{stories.filter((s) => isStoryVisible(s.storyKey)).length === 0 && (
  <p className="col-span-full text-center text-[16px] text-text-secondary py-12">
    No stories in this category yet — check back soon.
  </p>
)}
```
(Adapt `stories`/`isStoryVisible` to the actual array + predicate names already in the file.)

- [ ] **Step 3: Verify** — `npm run build 2>&1 | tail -4` → success. Then `npm run start`, open `/stories`, click each category tab (Artisans/Catering/Retail/Services), confirm it filters correctly and "Services" (no story) shows the empty state. Stop server.

- [ ] **Step 4: Commit**
```bash
git add src/app/stories/page.tsx
git commit -m "fix(m0c): Stories category filter keys + empty state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Fix the Impact donut chart fill

**Files:** Modify `src/app/impact/page.tsx`

- [ ] **Step 1: Correct the offset** — the ring animates `strokeDashoffset` from `circumference` (0% shown) toward `targetOffset`. For a 90% fill the target must be `circumference * 0.1`, not `* 0.9`. Change line ~216:

```typescript
const circumference = 2 * Math.PI * 120 // r=120
const targetOffset = circumference * 0.1 // 90% filled (offset = 10% of the ring)
```

- [ ] **Step 2: Confirm the centre label reads 90%** — check the donut's centre number (a count-up or static "90%"). If it animates, ensure it ends on `90`. If a static value exists and is wrong, set it to `90%`. (Quote-check: the copy below reads "of informal businesses still cash-only".)

Run: `grep -nE "90|cash-only|%" src/app/impact/page.tsx | head -10`
Expected: a centre value resolving to 90% accompanies the ring.

- [ ] **Step 3: Verify** — build, `npm run start`, open `/impact`, confirm the coloured ring now visually covers ~90% and matches the label. Stop server.

- [ ] **Step 4: Commit**
```bash
git add src/app/impact/page.tsx
git commit -m "fix(m0c): Impact donut renders 90% fill (offset 0.1 not 0.9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix the Home banner stat formatter

**Files:** Modify `src/app/page.tsx`

The `910,000` stat (`value: 910, suffix: ',000'`) currently renders `910000,000` because the formatter floors `count/10*1000` and then *also* appends `',000'`. Replace `BannerStat` (lines ~657–670) with a correct `Intl.NumberFormat` version that preserves the count-up animation:

- [ ] **Step 1: Replace the component**

```tsx
function BannerStat({
  value, prefix, suffix, trigger,
}: {
  value: number; prefix: string; suffix: string; trigger: boolean
}) {
  const isThousands = suffix === ',000'
  // thousands stats hold a "k" value (910 → 910,000); decimal stats (e.g. 2.9B) keep one decimal
  const target = isThousands ? value * 1000 : Math.round(value * 10)
  const count = useCountUp(target, 1.5, trigger)
  const display = isThousands
    ? new Intl.NumberFormat('en-ZA').format(count) // 910000 → "910,000"
    : (count / 10).toFixed(1)

  return (
    <span className="text-[40px] md:text-[64px] lg:text-[96px] font-black leading-none tracking-[-0.04em] text-accent-orange">
      {prefix}{display}{isThousands ? '' : suffix}
    </span>
  )
}
```

(Leave the stat data array at ~597–611 unchanged — `value: 910, suffix: ',000'` is the input contract this consumes.)

- [ ] **Step 2: Verify** — build, `npm run start`, open `/`, scroll to the banner; confirm it animates to `910,000` (not `910000,000`) and the `$2.9B` / `$1.3B` stats still read correctly. Stop server.

- [ ] **Step 3: Commit**
```bash
git add src/app/page.tsx
git commit -m "fix(m0c): Home banner stat formats 910,000 via Intl.NumberFormat

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Remove the placeholder team section

**Files:** Modify `src/app/about/page.tsx`

Founder decision: remove the fake-team section entirely (no real data yet).

- [ ] **Step 1: Locate the team section boundaries** — `grep -nE "teamMembers|Team Lead|Our Team|Meet the|<section" src/app/about/page.tsx` to find the `<section>` that contains the team heading and the `teamMembers.map(...)` (array ~735–756, render ~807–841).

- [ ] **Step 2: Remove** the entire team `<section>…</section>` block (heading + grid + `teamMembers.map`) and the `teamMembers` array declaration. Then remove the now-unused `Users` icon import **if** `grep -n "Users" src/app/about/page.tsx` shows no other use.

- [ ] **Step 3: Verify no dangling references**
Run: `grep -nE "teamMembers|Team Lead|Tech Lead" src/app/about/page.tsx || echo "TEAM REMOVED"`
Expected: `TEAM REMOVED`
Run: `npm run typecheck && npm run build 2>&1 | tail -4` → success.

- [ ] **Step 4:** `npm run start`, open `/about`, confirm the page flows naturally with the team section gone (no empty gap/broken spacing). Stop server.

- [ ] **Step 5: Commit**
```bash
git add src/app/about/page.tsx
git commit -m "fix(m0c): remove placeholder team section from About

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Create `/privacy` (DRAFT POPIA-aligned)

**Files:** Create `src/app/privacy/page.tsx`

- [ ] **Step 1: Create the page** (server component with metadata; content grounded in `docs/POPIA.md`):

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Inyuku Digital',
  description: 'How Inyuku Digital collects, uses, and protects personal information under POPIA.',
}

export default function PrivacyPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <div className="mb-8 rounded-lg border border-[#E86A34]/40 bg-[#E86A34]/10 px-4 py-3 text-[14px] text-text-primary">
          <strong>DRAFT — pending legal review.</strong> This policy is a working draft and is not yet legally binding.
        </div>
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Privacy Policy</h1>
        <p className="mt-2 text-[14px] text-text-secondary">Last updated: 2026-06-19 (DRAFT)</p>

        <div className="mt-10 space-y-8 text-[16px] leading-relaxed text-text-primary">
          <section>
            <h2 className="text-[22px] font-semibold mb-2">1. Who we are</h2>
            <p>Inyuku Digital (“we”, “us”) is the responsible party for personal information processed through our
            platform, as defined by the Protection of Personal Information Act, 2013 (POPIA). Our Information Officer
            can be reached via the details on our <a href="/contact" className="text-accent-orange font-medium">Contact</a> page.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">2. Information we collect</h2>
            <p>We collect information you provide directly — such as your name, business name, email address, and
            phone number — and information generated as you use the platform, including transaction and inventory
            records you create as a merchant.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">3. Why we process it</h2>
            <p>We process personal information to provide and improve the service, communicate with you, process
            payments through our escrow partner, comply with legal obligations, and (with your consent) send you
            marketing communications.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">4. Lawful basis &amp; consent</h2>
            <p>We process information where it is necessary to perform our contract with you, to comply with the law,
            for our legitimate interests, or where you have given consent. You may withdraw consent at any time.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">5. Sharing &amp; operators</h2>
            <p>We share information with operators who process it on our behalf under written agreements, including our
            hosting, database, payment (escrow), messaging, and email providers. They may process data outside South
            Africa; see “Cross-border transfers” below.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">6. Cross-border transfers</h2>
            <p>Some operators store data in the European Union. We transfer personal information across borders only
            where the recipient is bound by adequate data-protection safeguards, consistent with section 72 of POPIA.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">7. Retention</h2>
            <p>We keep personal information only as long as necessary for the purposes described or as required by law,
            after which it is securely deleted or de-identified.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">8. Your rights</h2>
            <p>You have the right to access, correct, or delete your personal information, to object to processing, and
            to lodge a complaint with the Information Regulator of South Africa. Contact us to exercise these rights.</p>
          </section>
          <section>
            <h2 className="text-[22px] font-semibold mb-2">9. Security</h2>
            <p>We apply appropriate technical and organisational measures to protect personal information, including
            encryption of sensitive data and access controls.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify** — `npm run build 2>&1 | tail -4` lists `/privacy`; open it, confirm the DRAFT banner shows.
- [ ] **Step 3: Commit** — `git add src/app/privacy/page.tsx && git commit -m "feat(m0c): add /privacy (DRAFT POPIA-aligned)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 6: Create `/terms` (DRAFT)

**Files:** Create `src/app/terms/page.tsx`

- [ ] **Step 1: Create the page** (same DRAFT banner + server metadata pattern as Task 5):

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Inyuku Digital',
  description: 'The terms governing use of the Inyuku Digital platform.',
}

export default function TermsPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <div className="mb-8 rounded-lg border border-[#E86A34]/40 bg-[#E86A34]/10 px-4 py-3 text-[14px] text-text-primary">
          <strong>DRAFT — pending legal review.</strong> These terms are a working draft and are not yet legally binding.
        </div>
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Terms of Service</h1>
        <p className="mt-2 text-[14px] text-text-secondary">Last updated: 2026-06-19 (DRAFT)</p>
        <div className="mt-10 space-y-8 text-[16px] leading-relaxed text-text-primary">
          <section><h2 className="text-[22px] font-semibold mb-2">1. Acceptance</h2><p>By using Inyuku Digital you agree to these terms. If you do not agree, do not use the service.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">2. The service</h2><p>Inyuku Digital provides commerce, payments, and business-management tools for small and informal businesses in South Africa. Features may change as the platform evolves.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">3. Accounts</h2><p>You are responsible for the accuracy of your account information and for keeping your credentials secure. You must be authorised to act for any business you register.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">4. Payments &amp; escrow</h2><p>Payments are processed through a regulated third-party escrow provider. Funds are held and released by that provider according to its terms; Inyuku does not hold your funds.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">5. Acceptable use</h2><p>You may not use the service for unlawful activity, to infringe others’ rights, or to disrupt the platform.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">6. Content</h2><p>You retain ownership of content you submit and grant us a licence to use it to operate and promote the service, subject to our Privacy Policy.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">7. Liability</h2><p>The service is provided “as is”. To the extent permitted by law, we limit our liability for indirect or consequential loss.</p></section>
          <section><h2 className="text-[22px] font-semibold mb-2">8. Governing law</h2><p>These terms are governed by the laws of the Republic of South Africa.</p></section>
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify** build lists `/terms`; DRAFT banner shows.
- [ ] **Step 3: Commit** — `git add src/app/terms/page.tsx && git commit -m "feat(m0c): add /terms (DRAFT)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 7: Create `/contact` (page + deferred-capture form)

**Files:** Create `src/app/contact/page.tsx` (server, metadata) and `src/app/contact/ContactForm.tsx` (`"use client"`)

- [ ] **Step 1: Create the client form** `src/app/contact/ContactForm.tsx` — validation + states, **no network** (TODO M1):

```tsx
'use client'
import { useState } from 'react'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Please enter your name.')
    if (!emailRe.test(form.email)) return setError('Please enter a valid email address.')
    if (!form.message.trim()) return setError('Please enter a message.')
    setError(null)
    // TODO(M1): POST { ...form, source: 'contact' } to /api/leads once the backend is live.
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center border border-[#E7E5E4]">
        <h3 className="text-[22px] font-bold text-text-primary">Thanks for reaching out!</h3>
        <p className="mt-2 text-text-secondary">We’ll be in touch soon.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <p role="alert" className="text-[14px] text-red-600">{error}</p>}
      <div>
        <label htmlFor="contact-name" className="block text-[14px] font-medium text-text-primary mb-1.5">Your name</label>
        <input id="contact-name" type="text" value={form.name}
          onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34]" />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-[14px] font-medium text-text-primary mb-1.5">Email</label>
        <input id="contact-email" type="email" value={form.email}
          onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
          className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34]" />
      </div>
      <div>
        <label htmlFor="contact-message" className="block text-[14px] font-medium text-text-primary mb-1.5">Message</label>
        <textarea id="contact-message" rows={4} value={form.message}
          onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))}
          className="w-full px-4 py-3.5 rounded-lg text-[15px] bg-[#F6F2EC] border border-[#E7E5E4] outline-none focus:ring-2 focus:ring-[#E86A34] resize-none" />
      </div>
      <button type="submit" className="w-full py-4 rounded-lg text-[15px] font-semibold text-white" style={{ backgroundColor: '#E86A34' }}>
        Send message
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Create the page** `src/app/contact/page.tsx`:

```tsx
import type { Metadata } from 'next'
import ContactForm from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact — Inyuku Digital',
  description: 'Get in touch with the Inyuku Digital team.',
}

export default function ContactPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Contact us</h1>
        <p className="mt-3 text-[18px] text-text-secondary">
          Questions, partnerships, or support — send us a message and we’ll get back to you.
        </p>
        <div className="mt-10"><ContactForm /></div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify** build lists `/contact`; form validates (empty submit shows errors; valid submit shows thank-you); no network call fired.
- [ ] **Step 4: Commit** — `git add src/app/contact && git commit -m "feat(m0c): add /contact page + validated form (capture deferred to M1)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 8: Create `/help` and `/partners`

**Files:** Create `src/app/help/page.tsx`, `src/app/partners/page.tsx`

- [ ] **Step 1: `/help`** (server, metadata, a short FAQ — real content, expandable later):

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help Centre — Inyuku Digital',
  description: 'Answers to common questions about using Inyuku Digital.',
}

const faqs = [
  { q: 'What is Inyuku Digital?', a: 'A commerce and payments platform for South African small and informal businesses — sell over WhatsApp, manage inventory, and get paid securely.' },
  { q: 'How do payments work?', a: 'Payments are handled through a regulated escrow provider, so both buyers and sellers are protected. Funds are released to you once an order is fulfilled.' },
  { q: 'Which languages are supported?', a: 'We are building toward support for South Africa’s major languages, including isiZulu, isiXhosa, Afrikaans, Sesotho, and more.' },
  { q: 'How do I get started?', a: 'Sign-up opens with our platform launch. Use the Contact page to register your interest and we’ll let you know.' },
]

export default function HelpPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Help Centre</h1>
        <div className="mt-10 space-y-8">
          {faqs.map((f) => (
            <div key={f.q}>
              <h2 className="text-[20px] font-semibold text-text-primary">{f.q}</h2>
              <p className="mt-2 text-[16px] leading-relaxed text-text-secondary">{f.a}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 text-[16px] text-text-secondary">
          Can’t find what you need? <a href="/contact" className="text-accent-orange font-medium">Contact us</a>.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: `/partners`** (server, metadata, overview + CTA to /contact):

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Partners — Inyuku Digital',
  description: 'Partner with Inyuku Digital to grow South Africa’s informal economy.',
}

export default function PartnersPage() {
  return (
    <main className="bg-[#F6F2EC] min-h-screen">
      <div className="max-w-[800px] mx-auto px-6 py-16 md:py-24">
        <h1 className="text-[32px] md:text-[48px] font-extrabold text-text-primary tracking-[-0.02em]">Partner with us</h1>
        <p className="mt-4 text-[18px] leading-relaxed text-text-secondary">
          We work with financial institutions, government programmes, NGOs, and technology providers to bring digital
          commerce to South Africa’s small and informal businesses. If your organisation shares that mission, we’d love
          to talk.
        </p>
        <a href="/contact" className="inline-flex mt-8 px-8 py-4 rounded-lg text-[15px] font-semibold text-white" style={{ backgroundColor: '#E86A34' }}>
          Get in touch
        </a>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify** build lists `/help` and `/partners`.
- [ ] **Step 4: Commit** — `git add src/app/help src/app/partners && git commit -m "feat(m0c): add /help and /partners pages" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 9: Fix Footer links

**Files:** Modify `src/components/Footer.tsx`

- [ ] **Step 1: Repoint `resourceLinks`** (lines ~19–24) to the real routes:

```typescript
const resourceLinks = [
  { label: 'Help Center', path: '/help' },
  { label: 'Partner Program', path: '/partners' },
  { label: 'Contact', path: '/contact' },
]
```
(Drop "Developer API" — there is no `/developers` page in M0-C; it can return in a later phase.)

- [ ] **Step 2: Fix the legal links** (lines ~148–153) from `href="/"`:

```tsx
<Link href="/privacy" className="text-[13px] transition-colors duration-200 hover:text-[#F6F2EC]" style={{ color: '#78716C' }}>
  Privacy Policy
</Link>
<Link href="/terms" className="text-[13px] transition-colors duration-200 hover:text-[#F6F2EC]" style={{ color: '#78716C' }}>
  Terms of Service
</Link>
```

- [ ] **Step 3: Point `companyLinks` "Careers"** — there is no careers page in M0-C; change that entry to `{ label: 'Partners', path: '/partners' }` (or remove the Careers entry). Leave `platformLinks` pointing at `/platform` (anchored deep-links are a later enhancement).

- [ ] **Step 4: Verify** — build; `npm run start`; click every footer link and confirm none 404 and none point to `/` for legal. Stop server.

- [ ] **Step 5: Commit** — `git add src/components/Footer.tsx && git commit -m "fix(m0c): repoint Footer links to real routes (privacy/terms/help/contact/partners)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 10: Per-route SEO metadata (server/client split for the 6 existing pages)

**Files:** For each of the 6 existing routes, add a server `page.tsx` exporting `metadata` and move the current client content into a sibling client component.

Pattern (repeat for each route; **Home** is the example):

- [ ] **Step 1: Home** — `git mv src/app/page.tsx src/app/HomeClient.tsx`. At the top of `HomeClient.tsx` keep `'use client'`; rename its default export to `HomeClient`. Create a new `src/app/page.tsx`:

```tsx
import type { Metadata } from 'next'
import HomeClient from './HomeClient'

export const metadata: Metadata = {
  title: 'Inyuku Digital — Commerce for South Africa’s small businesses',
  description: 'Sell over WhatsApp, manage inventory, and get paid securely. Inyuku Digital brings digital commerce to South Africa’s small and informal businesses.',
}

export default function Page() { return <HomeClient /> }
```

- [ ] **Step 2: Repeat** for the other five, with route-specific metadata:
  - `src/app/platform/` → `PlatformClient.tsx` + server `page.tsx`, title `Platform — Inyuku Digital`, description about WhatsApp commerce, AI agent, payments, inventory.
  - `src/app/impact/` → `ImpactClient.tsx`, title `Impact — Inyuku Digital`, description about the economic impact of digitising informal business.
  - `src/app/solutions/` → `SolutionsClient.tsx`, title `Solutions — Inyuku Digital`, description about solutions for spazas, traders, artisans, caterers.
  - `src/app/stories/` → `StoriesClient.tsx`, title `Stories — Inyuku Digital`, description about real merchant success stories.
  - `src/app/about/` → `AboutClient.tsx`, title `About — Inyuku Digital`, description about the mission and approach.

  For each: `git mv <route>/page.tsx <route>/<Name>Client.tsx`, rename its default export, create the server `page.tsx` importing it and exporting `metadata`.

- [ ] **Step 3: Verify** — `npm run typecheck && npm run build 2>&1 | tail -16` → success; all 6 routes still render. Spot-check page source/`<head>` via `npm run start` + `curl -s localhost:3000/platform | grep -i "<title>"` shows the per-route title.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(m0c): per-route SEO metadata via server/client split" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 11: Form accessibility + validation (Impact & Stories) — capture still deferred

**Files:** Modify `src/app/impact/ImpactClient.tsx` and `src/app/stories/StoriesClient.tsx` (renamed in Task 10)

Founder decision: no live capture in M0-C. Improve the existing forms' a11y + validation and mark the network call as `TODO(M1)`.

- [ ] **Step 1: Impact report form** — add a `<label htmlFor>` for the email input, validate the email with the regex on submit (show an inline error if invalid), keep the existing visual design. Replace `onSubmit={(e) => e.preventDefault()}` with a handler that validates then sets a local "thanks" state, with `// TODO(M1): POST { email, source: 'impact_report' } to /api/leads`.

- [ ] **Step 2: Stories submission form** — associate every `<label>` with its input via `htmlFor`/`id` (currently labels are not associated), keep the `required` fields, and in `handleSubmit` add `// TODO(M1): POST { ...formState, source: 'share_story' } to /api/leads` above `setSubmitted(true)`.

- [ ] **Step 3: Verify** — build; `npm run start`; on `/impact` an invalid email shows an inline error and a valid one shows the thank-you; on `/stories` labels focus their inputs (click label → input focuses). Stop server.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "fix(m0c): form labels + validation on Impact/Stories (capture deferred to M1)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`

---

### Task 12: Final verification, smoke check, push & PR

- [ ] **Step 1: Full gate (mirrors CI)**
```bash
rm -rf .next && npm run typecheck && npm run lint && npm run test && npm run build
```
Expected: all green; build lists `/`, `/platform`, `/impact`, `/solutions`, `/stories`, `/about`, `/contact`, `/privacy`, `/terms`, `/help`, `/partners`, `/api/leads`.

- [ ] **Step 2: Smoke check** — `npm run start`; verify: Stories filter works + empty state; donut shows 90%; banner shows `910,000`; About has no team section; all 5 new pages load with DRAFT banners on privacy/terms; every footer link resolves (no `/` legal links); per-route `<title>` differs. Stop server.

- [ ] **Step 3: Push + PR**
```bash
git push -u origin feature/m0c-content-pages-fixes
gh pr create --title "M0-C: content-bug fixes, missing pages, per-route SEO" \
  --body "Fixes Stories filter, donut, banner stat; removes placeholder team; adds /contact /privacy /terms /help /partners (DRAFT legal copy); fixes Footer links; per-route metadata; form a11y+validation (live capture deferred to M1)." \
  --base main
```

- [ ] **Step 4: STOP for validation.** Do not merge or start M1. The PR returns to Claude Code for `/code-review` + `verify`.

---

## Acceptance Criteria (validated in Claude Code before merge)

- [ ] Stories filter correctly filters by Artisans/Catering/Retail; empty category shows the empty state.
- [ ] Impact donut visually fills ~90% and matches its label.
- [ ] Home banner renders `910,000` (not `910000,000`); `$2.9B`/`$1.3B` still correct.
- [ ] About no longer shows any placeholder team; page spacing intact.
- [ ] `/contact`, `/privacy`, `/terms`, `/help`, `/partners` exist; privacy/terms show a DRAFT banner; content grounded in `docs/POPIA.md`.
- [ ] All Footer links resolve to real routes; no legal link points to `/`.
- [ ] Each of the 6 main routes has a unique `<title>`/description via a server `page.tsx`.
- [ ] Forms have associated labels + client-side validation; no live network capture (TODO(M1) markers present).
- [ ] `typecheck` / `lint` / `test` / `build` all pass.

## Self-Review

**Spec coverage** (vs manifest M0-C scope + roadmap §6): content-bug fixes (Tasks 1–4) ✅; legal/missing pages (Tasks 5–8) ✅; Footer fix (Task 9) ✅; per-route SEO (Task 10) ✅; form a11y/validation (Task 11) ✅. Live lead capture intentionally deferred to M1 per founder decision — noted, not a gap. `/developers` and `/careers` pages intentionally omitted (no content yet); Footer no longer links to them.

**Placeholder scan:** The only deliberate markers are `TODO(M1)` on the form network calls (the founder-approved deferral) and the visible "DRAFT — pending legal review" banners (the founder-approved legal-copy approach). No vague "add error handling"; every page's content is provided in full.

**Type/name consistency:** Task 10 renames each `page.tsx` → `<Name>Client.tsx` and the new server `page.tsx` imports that exact name; Task 11 edits the renamed `ImpactClient.tsx`/`StoriesClient.tsx` (consistent with Task 10's outputs). `source` values (`contact`, `impact_report`, `share_story`) are the lead `source` taxonomy M1's `/leads` will consume. Color tokens (`text-text-primary`, `text-text-secondary`, `accent-orange`, `#F6F2EC`) match those extracted from the existing pages.
