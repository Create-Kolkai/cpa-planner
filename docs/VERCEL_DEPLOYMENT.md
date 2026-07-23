# Vercel Deployment

This pass did not deploy.

## Environment Variables

Configure these in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `APP_DEMO_MODE`
- `APP_URL`
- `ROUTE_PROVIDER_MODE`
- `MAP_PROVIDER`
- `MAP_PUBLIC_TOKEN`

Do not add `SUPABASE_SERVICE_ROLE_KEY` unless a server-only function or script requires it. Never expose it as a public browser variable.

## Checks Before Deploy

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Confirm Supabase auth callback URLs include the production domain before user testing.
