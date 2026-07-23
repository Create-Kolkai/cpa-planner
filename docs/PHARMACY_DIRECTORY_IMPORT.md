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
