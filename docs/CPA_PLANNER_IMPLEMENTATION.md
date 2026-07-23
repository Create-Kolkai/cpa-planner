# CPA Planner Implementation Notes

## Initial Audit Findings

- The local workspace at `/Users/nickmeyer/Desktop/SalesRep` is not a git repository, so branch and history checks cannot be completed here.
- The app is a Vite + React + TypeScript single-page app.
- Current persistence is browser `localStorage` under `cpa-planner-state-v6`.
- There is no existing Supabase client, auth flow, middleware, API route layer, server actions, migrations, or tests.
- The working planner logic is client-side and uses stored pharmacy coordinates plus approximate Haversine scoring.
- The pharmacy list comes from `public/demo-list.csv`; many coordinates are area-level estimates.
- The previous territory view was an abstract marker board, not a real map.
- Vercel project metadata exists in `.vercel/project.json`, but this pass intentionally did not deploy.

## Functional Features Retained

- CSV import.
- Grade-based required visits: A = 2, B = 1, C = 0.
- Monthly cycle start day.
- Min and max visit settings.
- Weekends excluded by default.
- Unavailable dates.
- Monthly plan generation.
- Approximate geographic grouping.
- Individual visit movement.
- Whole-day swapping.
- Calendar export as CSV.
- Manager/team training-date partial replan concept.

## Demo-Only Behaviour Still Present

- Auth and Supabase data persistence are not active until Supabase environment variables and a client integration are added.
- Browser local storage remains the runtime data store for the UI.
- CSV import replaces the active pharmacy list instead of using the full confirm/match workflow.
- XLSX import is not implemented yet.
- Manager/team screen is still a single-rep local demo surface until profiles/team assignments are connected.

## UX Changes Made

- Sidebar now follows the requested IA: Overview, Pharmacies, Monthly Plan, Availability, Team, Settings.
- Full KPI metrics appear only on Overview.
- Planner and Calendar duplication is removed from navigation.
- Header actions are context-specific.
- Demo reset is no longer a global header action.
- Pharmacies table uses user-facing pharmacy terminology.
- Raw latitude/longitude is no longer a primary table column.
- Availability has its own page for unavailable dates.
- The fake territory graphic was replaced with an honest map-provider setup state.

## Supabase Foundation

Created migration:

- `supabase/migrations/202607230001_cpa_planner_foundation.sql`

It includes:

- Core enums.
- Profiles and role model.
- Pharmacy directory.
- Representative pharmacy list.
- Planning defaults.
- Blocked dates.
- Monthly plans, plan days, plan visits.
- Plan versions and change log.
- Import job tracking.
- In-app notifications.
- Updated-at triggers.
- New-user profile/defaults trigger.
- Restricted pharmacy directory search RPC.
- RLS policies for sales reps, managers, and admins.

## Security Notes

- No Supabase service-role key is used in browser code.
- `.env.example` documents public and server-only variables separately.
- The directory table intentionally has no broad representative `select` policy.

## Route Planning Mode

The current app uses approximate route ordering only. It must not show road distance, driving time, or road-following route geometry until a route provider is configured.

## Next Implementation Steps

1. Add `@supabase/supabase-js` and wire browser auth/session handling.
2. Create protected data-loading services for profiles, pharmacies, plans, blocked dates, and team views.
3. Apply the migration to a clearly identified non-production Supabase project.
4. Implement directory import from `data/source/WHF_Pharmacy_WC_July_2024.pdf` or a normalized CSV.
5. Replace local storage reads/writes with Supabase mutations and query loading states.
6. Add XLSX import with preview, matching, and duplicate review.
7. Add plan persistence, versions, change log, and locked-day partial replan.
8. Add full business and RLS tests.
