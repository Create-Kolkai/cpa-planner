# Pharmacy Directory Import

Expected source location:

`data/source/WHF_Pharmacy_WC_July_2024.pdf`

If the PDF is not present, do not fabricate the full directory. Use existing demo pharmacies and add the source file before running extraction.

## Target Outputs

- `data/generated/western-cape-pharmacies.csv`
- `data/generated/pharmacy-import-review.csv`
- `data/generated/pharmacy-import-report.json`

## Required Workflow

1. Extract table rows locally.
2. Preserve practice numbers as text.
3. Normalize names and addresses.
4. Detect duplicate practice numbers and duplicate name/address pairs.
5. Flag incomplete rows.
6. Flag invalid telephone values.
7. Validate province/town consistency where possible.
8. Geocode or match coordinates.
9. Assign verification status: `verified`, `needs_review`, `excluded`, or `unresolved`.
10. Upsert idempotently by practice number or stable source hash.

Representatives should only search verified active records through the restricted RPC.

## Demo Seed Script

Phase 2 adds:

`scripts/import-pharmacy-directory.mjs`

It can seed the directory from `public/demo-list.csv` or a reviewed generated CSV while preserving practice numbers and using a stable source hash.

Run only in a server/local environment with a confirmed non-production project:

```bash
VITE_SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<server-only-key>" \
node scripts/import-pharmacy-directory.mjs public/demo-list.csv
```

The script must never be imported into browser code.
