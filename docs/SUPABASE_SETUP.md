# Supabase Setup

Use a clearly identified non-production Supabase project for the demo.

## Required Variables

Client-safe:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server-only:

- `SUPABASE_SERVICE_ROLE_KEY`

Demo/config:

- `APP_DEMO_MODE`
- `APP_URL`
- `ROUTE_PROVIDER_MODE`
- `MAP_PROVIDER`
- `MAP_PUBLIC_TOKEN`

## Migration

Apply migrations only after confirming the target project is the demo project.

```bash
supabase link --project-ref <demo-project-ref>
supabase db push
```

The migrations create tables, indexes, triggers, RLS policies, a restricted directory search RPC and a transactional `save_monthly_plan` RPC.

Local validation commands once Supabase CLI is installed:

```bash
npx supabase --version
npx supabase start
npx supabase db reset
npx supabase status
```

## Auth

Enable email/password auth in Supabase. Add callback URLs for:

- Local app URL.
- Vercel preview URL.
- Production Vercel URL.

New users receive a `sales_rep` profile by default. Promote managers/admins directly in the database or with a server-only admin tool.

The browser app uses Supabase Auth endpoints directly through a typed fetch adapter. It does not use or expose `SUPABASE_SERVICE_ROLE_KEY`.

## RLS Verification

Verify:

- A rep can only read their own pharmacies and plans.
- A manager can read assigned reps only.
- Reps cannot browse `pharmacy_directory` directly.
- Directory search works through `search_pharmacy_directory(search_text)`.
- Plan saves work through `save_monthly_plan(...)`.
