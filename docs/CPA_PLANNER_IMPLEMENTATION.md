# CPA Planner Implementation Notes

## Initial Audit Findings

- The repository is now initialised at `/Users/nickmeyer/Desktop/SalesRep`.
- Branch: `main`.
- Remote: `https://github.com/Create-Kolkai/cpa-planner.git`.
- The app is a Vite + React + TypeScript single-page app.
- Phase 2 adds a fetch-based Supabase Auth/REST/RPC adapter because npm dependency installation stalled in this environment.
- Supabase mode is controlled by `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- When Supabase is not configured, the app shows an explicit setup state before allowing local prototype mode.
- The working planner logic is client-side and uses stored pharmacy coordinates plus approximate Haversine scoring.
- The pharmacy list comes from `public/demo-list.csv`; many coordinates are area-level estimates.
- Vercel project metadata exists locally but is ignored and was not deployed.

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

## Phase 2 Behaviour

- Email/password auth is implemented through Supabase Auth endpoints.
- Sessions are stored in `sessionStorage`, enough to survive page refresh without storing client lists or plans in browser storage.
- Profile, pharmacies, blocked dates, latest monthly plan and notifications load from Supabase after sign-in.
- CSV import upserts representative pharmacies and records an import job when signed in.
- Plan generation saves a versioned monthly plan through `save_monthly_plan`.
- Moving visits and swapping days persist by saving a new plan version.
- Availability adds/deletes persist to `blocked_dates`.
- Legacy `cpa-planner-state-v6` data is only imported after an explicit Settings action.
- XLSX import shows a clear dependency message until the spreadsheet parser package can be installed.
- Manager/team UI is role-gated in Supabase mode, but full multi-rep event workflow still needs live Supabase testing.

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

Created migrations:

- `supabase/migrations/202607230001_cpa_planner_foundation.sql`
- `supabase/migrations/202607230002_phase2_security_and_plan_rpc.sql`

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
- A follow-up migration tightens profile role updates, manager blocked-date writes and grants, and adds a transactional `save_monthly_plan` RPC.

## Security Notes

- No Supabase service-role key is used in browser code.
- `.env.example` documents public and server-only variables separately.
- The directory table intentionally has no broad representative `select` policy.

## Route Planning Mode

The current app uses approximate route ordering only. It must not show road distance, driving time, or road-following route geometry until a route provider is configured.

## Current Limitations

- Supabase migrations have not been applied locally or remotely because the CLI/project was not available and no remote project was identified.
- RLS has been statically reviewed but not executed against a live Supabase database.
- TypeScript 6.0.3 local compiler commands stall before diagnostics in this environment.
- npm dependency installation for `@supabase/supabase-js`, `xlsx`, and `vitest` also stalled; the implementation uses a typed fetch adapter instead.
- XLSX import is not functional until a spreadsheet parser is installed.
- Full manager multi-rep event impact preview and in-app notification interactions require live Supabase validation.
