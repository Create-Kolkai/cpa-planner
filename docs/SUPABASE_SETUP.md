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

The first migration creates tables, indexes, triggers, RLS policies, and a restricted directory search RPC.

## Auth

Enable email/password auth in Supabase. Add callback URLs for:

- Local app URL.
- Vercel preview URL.
- Production Vercel URL.

New users receive a `sales_rep` profile by default. Promote managers/admins directly in the database or with a server-only admin tool.

## RLS Verification

Verify:

- A rep can only read their own pharmacies and plans.
- A manager can read assigned reps only.
- Reps cannot browse `pharmacy_directory` directly.
- Directory search works through `search_pharmacy_directory(search_text)`.
