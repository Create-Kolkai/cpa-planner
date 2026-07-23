# Pharmacy Directory Demo

## Source

The shared directory is based on `data/source/WHF_Pharmacy_WC_July_2024.pdf`, the Western Cape Pharmacy Network List updated July 2024.

The normalized review file is generated at:

`data/normalized/whf-pharmacy-western-cape-july-2024.csv`

Generation command:

```bash
node scripts/build-whf-directory.mjs data/source/WHF_Pharmacy_WC_July_2024.pdf
```

The normalizer uses table extraction from the PDF, trims repeated spacing, title-cases practice names, keeps practice numbers and telephone numbers from the source, and de-duplicates primarily by practice number. Questionable or unmatched locations are marked with `validation_status` instead of being silently removed.

## Supabase Migration

Apply this migration before Vercel Preview testing:

`supabase/migrations/202607230003_seed_western_cape_pharmacy_directory.sql`

It adds missing directory metadata columns, creates search indexes, seeds the WHF directory, and replaces/adds these authenticated RPCs:

- `search_pharmacy_directory(search_text, result_limit, result_offset)`
- `add_pharmacy_to_my_list(directory_id, selected_grade)`
- `initialize_demo_sales_rep_workspace()`

The browser never writes to the shared directory directly and never uses a service-role key.

## Search Architecture

`rep_pharmacies` contains the signed-in representative's assigned list. The My Pharmacies search filters the loaded list in the browser by pharmacy name, practice number, town, suburb and address.

`pharmacy_directory` contains the shared WHF source records. The Add Pharmacies modal searches it through the restricted RPC and prevents adding pharmacies already assigned to the representative.

## Demo Territory

When demo mode is active and a rep has no pharmacies, the app can load a sample Western Cape territory from real seeded directory records. The RPC is idempotent and returns the existing territory unchanged if one already exists.

## Map

The Pharmacies page uses Leaflet with OpenStreetMap tiles and required attribution. No paid map token is required.

Exact latitude/longitude values are used when present. For source rows without exact coordinates, the migration uses reviewed town centroids with a small deterministic offset and labels them as approximate town locations. These points are for territory planning context, not precise entrance locations.

## Import

The Import pharmacies action supports `.csv`, `.xlsx` and `.xls` via SheetJS Community Edition `0.20.3`, pinned to the official SheetJS CDN tarball and lazy-loaded only when a rep imports a spreadsheet. The shared parser recognises common heading aliases for practice number, pharmacy name, town, suburb, address, telephone, grade, required visits and coordinates. It previews the import count, skips duplicates already in the territory, and records the import summary when Supabase mode is active.

## Vercel Preview

Required public variables remain:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_DEMO_MODE=true`

No map token is required for the current OpenStreetMap demo.
