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
