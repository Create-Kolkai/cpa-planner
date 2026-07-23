# CPA Planner

CPA Planner is a demo application for pharmaceutical sales representatives planning monthly pharmacy visits.

## Current App

- Vite + React + TypeScript.
- Compact planning UI.
- Supabase-configured sign-in flow.
- Supabase service layer for profiles, pharmacies, availability, plans and notifications.
- CSV pharmacy import with persistent upsert when signed in.
- Approximate route grouping.
- Calendar editing.
- Availability management.
- Role-aware Team navigation.
- Supabase foundation migration and setup docs.

Repository: `https://github.com/Create-Kolkai/cpa-planner.git`

## Local Setup

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Note: in the current local environment, TypeScript and Vite commands may stall before diagnostics with TypeScript `6.0.3`; do not mark them passed unless they complete.

## Supabase

See `docs/SUPABASE_SETUP.md`.

## Route Planning

See `docs/ROUTE_PLANNING.md`.

## Demo Test Walkthrough

See `docs/DEMO_TEST_SCRIPT.md`.
