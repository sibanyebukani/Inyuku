# M0-A: Repository Foundation & Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the Inyuku repository under version control with professional metadata, environment scaffolding, and a CI skeleton — and commit the current working Vite app as the clean pre-migration baseline.

**Architecture:** Pure repository/tooling work on the *existing Vite codebase*. No application source is rewritten here — this plan exists to create a trustworthy baseline commit and CI gate *before* the M0-B Next.js migration touches the app. Deliberately does **not** fix the shadcn lint errors or prune dead deps: those components are deleted in M0-B, so polishing them now is wasted effort.

**Tech Stack:** Git, GitHub Actions, Node 20 LTS, npm, existing Vite 7 toolchain.

## Global Constraints

- Node version: **20 LTS** (pinned via `.nvmrc` and `engines`). Local machine has v24; CI uses the pinned version.
- Project name: **`inyuku-digital`**, starting version **`0.1.0`**.
- No secrets in the repo. All `.env*` files except `.env.example` are git-ignored.
- This plan must not modify any file under `src/` — it commits `src/` as-is.
- `npm run build` is the only quality gate enforced as blocking in CI for now; `npm run lint` currently fails on vendored shadcn code that M0-B removes, so lint runs **non-blocking** until M0-B.

---

### Task 1: Initialize Git and harden `.gitignore`

**Files:**
- Modify: `.gitignore`
- Create: (git repo metadata via `git init`)

**Interfaces:**
- Produces: a git repository on branch `main` with a baseline commit that later tasks and M0-B build on.

- [ ] **Step 1: Initialize the repository on `main`**

```bash
cd /home/sibnaye/Development/Inyuku
git init -b main
```

- [ ] **Step 2: Expand `.gitignore`**

Replace the contents of `.gitignore` with:

```gitignore
# Dependencies
node_modules

# Build output
dist
dist-ssr

# Environment (never commit real env files)
.env
.env.local
.env.*.local

# Editor / OS
.DS_Store
*.local
.vscode/*
!.vscode/extensions.json
.idea

# Logs
*.log
npm-debug.log*
```

- [ ] **Step 3: Verify the working tree is sane before committing**

Run: `git status --short | grep -E "node_modules|dist|\.env" || echo "CLEAN: no ignored junk staged"`
Expected: `CLEAN: no ignored junk staged`

- [ ] **Step 4: Stage everything and confirm node_modules is excluded**

Run: `git add -A && git status --short | grep -c "node_modules/" `
Expected: `0`

- [ ] **Step 5: Commit the baseline**

```bash
git commit -m "chore: initial commit — Inyuku Digital Vite baseline + planning docs

Pre-migration baseline of the marketing SPA before the Next.js migration (M0-B).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Project metadata, Node pinning, and a typecheck script

**Files:**
- Modify: `package.json`
- Create: `.nvmrc`

**Interfaces:**
- Consumes: the git repo from Task 1.
- Produces: `package.json` with `name: "inyuku-digital"`, `version: "0.1.0"`, an `engines.node` floor, and a standalone `typecheck` script that CI (Task 5) calls.

- [ ] **Step 1: Pin the Node version**

Create `.nvmrc` with exactly:

```
20
```

- [ ] **Step 2: Update name, version, and add `engines` + `typecheck` in `package.json`**

Change the top fields from:

```json
  "name": "my-app",
  "private": true,
  "version": "0.0.0",
  "type": "module",
```

to:

```json
  "name": "inyuku-digital",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=20 <23"
  },
```

And in `"scripts"`, add a `typecheck` entry next to the existing ones:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint .",
    "preview": "vite preview"
  },
```

- [ ] **Step 3: Verify the typecheck script runs**

Run: `npm run typecheck`
Expected: completes with exit code 0 (the baseline already type-checks clean; if `tsc` is missing because `node_modules` is incomplete, run `npm install` first, then re-run).

- [ ] **Step 4: Commit**

```bash
git add package.json .nvmrc
git commit -m "chore: set project metadata, pin Node 20, add typecheck script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Environment scaffolding

**Files:**
- Create: `.env.example`

**Interfaces:**
- Consumes: `.gitignore` from Task 1 (already ignores real `.env*`).
- Produces: a documented, committed template of every environment variable the platform will need. Real values live only in untracked `.env.local` / the hosting platform.

- [ ] **Step 1: Create `.env.example`**

This documents the variables the **resolved** stack will consume (Next.js pure client + Express/Prisma
backend on Railway; in-house JWT; TradeSafe; 360dialog; R2; AI via `lib/ai.js`). Per EA-ADR-014/015 and
`docs/DECISIONS.md` — **Clerk and Supabase are dropped.** Values are placeholders; the file is committed as
documentation only. The server-side vars below are **PENDING the M1 backend** (no real values until then);
they are documented now so the team knows the target shape.

```bash
# ----------------------------------------------------------------------------
# Inyuku Digital — environment variable template.
# Copy to .env.local and fill with real values. NEVER commit .env.local.
# Resolved stack (EA-ADR-014/015): Next.js client + Express/Prisma backend on
# Railway. Vite reads VITE_-prefixed vars today; the Next.js migration (M0-B)
# renames client vars to NEXT_PUBLIC_ and moves server vars to the backend.
# ----------------------------------------------------------------------------

# --- App / client ---
VITE_APP_ENV=development            # development | staging | production
VITE_APP_BASE_URL=http://localhost:3000
# NEXT_PUBLIC_API_BASE_URL=https://api.inyuku.co.za   # (M0-B) frontend → backend base URL

# === Backend (Express/Prisma on Railway) — PENDING M1 backend stand-up ===
# Datastore (Railway Postgres 16, EU-region-pinned) + cache/queue (Railway Redis 7)
# DATABASE_URL=                      # Railway Postgres, EU region
# REDIS_URL=                         # Railway Redis (cache, rate-limit, OTP; BullMQ scoped to fulfilment)

# Auth (in-house JWT + refresh rotation, bcrypt-12). Cookie domain .inyuku.co.za (PROVISIONAL).
# JWT_SECRET=                        # access-token signing secret
# JWT_REFRESH_SECRET=                # refresh-token signing secret

# Crypto / settings (AES-256-GCM; key from a Railway secret = separate trust boundary)
# ENCRYPTION_KEY=                    # 32-byte key for encrypted Setting values
# BLOB_SIGN_SECRET=                  # signs short-TTL storage/blob URLs

# Object storage — Cloudflare R2 (EU bucket) behind the chassis storage 'r2' driver
# R2_ACCOUNT_ID=
# R2_ACCESS_KEY_ID=
# R2_SECRET_ACCESS_KEY=
# R2_BUCKET=
# R2_ENDPOINT=                       # https://<account>.r2.cloudflarestorage.com

# Email (Resend) / SMS + OTP (BulkSMS)
# RESEND_API_KEY=
# BULKSMS_TOKEN_ID=
# BULKSMS_TOKEN_SECRET=

# Payments — TradeSafe escrow (GraphQL, OAuth2 client-credentials)
# TRADESAFE_CLIENT_ID=
# TRADESAFE_CLIENT_SECRET=
# TRADESAFE_API_URL=

# WhatsApp — 360dialog BSP
# DIALOG360_API_KEY=
# DIALOG360_API_URL=

# AI — routes via the portfolio lib/ai.js gateway (EA-ADR-009/011/012).
# NOTE: NO direct Anthropic API key at call sites. The AI key is sourced through
# encrypted live settings inside lib/ai.js, never read from env by feature code.

# Observability — added during M1
# SENTRY_DSN=
# OTEL_EXPORTER_OTLP_ENDPOINT=
```

> **PENDING EA-ADR-014/015 sign-off** for the M1 backend: the server-side vars above are the documented
> target shape only — no real values are wired until the backend is stood up in M1.

- [ ] **Step 2: Verify the real env files stay ignored**

Run: `touch .env.local && git check-ignore .env.local && rm .env.local && echo "IGNORED OK"`
Expected: prints `.env.local` then `IGNORED OK`

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example environment template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: LICENSE and project README

**Files:**
- Create: `LICENSE`
- Modify: `README.md` (replace the default Vite template)

**Interfaces:**
- Consumes: nothing.
- Produces: a project-specific README that documents setup, scripts, and the roadmap location.

- [ ] **Step 1: Create the LICENSE**

Use a proprietary "all rights reserved" notice (the product is commercial, not open source):

```
Copyright (c) 2026 Inyuku Digital. All rights reserved.

This source code is proprietary and confidential. No part of this software
may be reproduced, distributed, or transmitted in any form or by any means
without the prior written permission of the copyright holder.
```

- [ ] **Step 2: Replace `README.md`**

Replace the entire file with:

```markdown
# Inyuku Digital

Digital commerce platform for South African informal and small businesses —
WhatsApp commerce, digital payments, inventory, and an AI business assistant.

## Status

Pre-migration baseline (Vite SPA). The active plan migrates this to Next.js +
Clerk + Supabase. See `docs/superpowers/specs/2026-06-18-inyuku-full-platform-roadmap-design.md`
for the program roadmap and `docs/superpowers/plans/` for milestone plans.

## Requirements

- Node 20 LTS (`nvm use` reads `.nvmrc`)
- npm

## Setup

```bash
nvm use
npm install
cp .env.example .env.local   # fill in real values
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and production build |
| `npm run typecheck` | Type-check only |
| `npm run lint` | Lint (currently fails on vendored shadcn code; resolved in M0-B) |
| `npm run preview` | Preview the production build |

## Documentation

- `docs/` — gap-analysis audits, feature backlog, SDLC roadmap
- `docs/superpowers/specs/` — approved design specs
- `docs/superpowers/plans/` — milestone implementation plans
```

- [ ] **Step 3: Commit**

```bash
git add LICENSE README.md
git commit -m "docs: add proprietary license and project README

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: CI skeleton (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `.nvmrc` (Task 2), `typecheck` script (Task 2).
- Produces: a CI workflow that runs on push/PR to `main`: install → typecheck → build (blocking) and lint (non-blocking until M0-B).

- [ ] **Step 1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - name: Type check
        run: npm run typecheck
      - name: Lint (non-blocking until M0-B removes vendored shadcn)
        run: npm run lint || true
      - name: Build
        run: npm run build
      - name: Audit (non-blocking until M0-B refreshes deps)
        run: npm audit --audit-level=moderate || true
```

> **EA amendment (2026-06-18):** `npm audit` added per roadmap §5, which listed audit in the M0 CI gate; the original draft dropped it. Non-blocking for now (a known low-severity esbuild finding exists; M0-B refreshes deps).

- [ ] **Step 2: Validate the workflow YAML locally**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!s.includes('npm ci')||!s.includes('node-version-file'))process.exit(1);console.log('CI workflow looks well-formed')"`
Expected: `CI workflow looks well-formed`

- [ ] **Step 3: Confirm `npm ci` will succeed in CI (lockfile present and in sync)**

Run: `test -f package-lock.json && echo "lockfile present"`
Expected: `lockfile present`
(If `npm ci` later fails in CI due to lockfile drift from the audits, run `npm install` locally, commit the refreshed `package-lock.json`, and re-push.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add build/typecheck workflow (lint non-blocking until M0-B)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Connect a remote and push

**Files:** none (git remote configuration).

**Interfaces:**
- Consumes: all prior commits.
- Produces: the baseline pushed to a hosted remote so CI runs and the team has a shared origin.

> **Human-in-the-loop:** creating the hosted repo requires the owner's account. The
> agent cannot create the GitHub/GitLab project. Steps below assume the empty remote
> repo URL has been provided.

- [ ] **Step 1: Add the remote (URL provided by the owner)**

```bash
git remote add origin <REMOTE_URL_PROVIDED_BY_OWNER>
```

- [ ] **Step 2: Push and set upstream**

```bash
git push -u origin main
```

- [ ] **Step 3: Verify CI ran**

Confirm in the hosting UI (GitHub Actions tab) that the `CI` workflow triggered and the **Build** step passed. Expected: green build; lint step may report errors but does not fail the run.

---

## Self-Review

**Spec coverage** (against roadmap §5 "M0 — Foundation" + §1 preconditions 5/6/7):
- Precondition 7 (Git init + remote) → Tasks 1, 6. ✅
- Roadmap M0 "Git init + remote, CI, project metadata, `.nvmrc`/engines" → Tasks 1, 2, 5. ✅
- Roadmap M0 env scaffolding → Task 3. ✅
- Preconditions 5/6 (budget ceiling, owners) → **intentionally out of scope** for this code plan; handled as the org-track docs (`docs/BUDGET.md`, `docs/OWNERS.md`) pending owner inputs. Noted, not a gap.
- Lint fix, dead-dep prune, Next migration, content fixes, lead API, legal pages → **deferred to M0-B / M0-C by design** (see roadmap §5 and this plan's Architecture note). Not gaps.

**Placeholder scan:** The only intentional placeholders are `<REMOTE_URL_PROVIDED_BY_OWNER>` (requires the owner's account — flagged human-in-the-loop) and the commented-out future env vars in `.env.example` (documentation of what M1 adds, not incomplete work). No "TODO/TBD/implement later" in any executable step.

**Type/name consistency:** `typecheck` script defined in Task 2 is the exact name consumed by CI in Task 5. `.nvmrc` (Task 2) is the exact file `node-version-file` reads in Task 5. `inyuku-digital` / `0.1.0` consistent across Tasks 2 and 4. ✅
