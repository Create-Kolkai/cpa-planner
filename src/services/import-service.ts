import { supabaseRest } from "../lib/supabase/client";
import type { RepPharmacyRow } from "../lib/supabase/types";
import { type PharmacyInput, upsertRepPharmacies } from "./pharmacy-service";

export type ImportSummary = {
  totalRows: number;
  validRows: number;
  matchedRows: number;
  unmatchedRows: number;
  duplicateRows: number;
  errorRows: number;
};

export async function recordImportJob(repId: string, filename: string, summary: ImportSummary, status = "complete") {
  const rows = await supabaseRest<Array<{ id: string }>>("import_jobs?select=id", {
    method: "POST",
    body: [{
      rep_id: repId,
      filename,
      status,
      total_rows: summary.totalRows,
      valid_rows: summary.validRows,
      matched_rows: summary.matchedRows,
      unmatched_rows: summary.unmatchedRows,
      duplicate_rows: summary.duplicateRows,
      error_rows: summary.errorRows,
    }],
    prefer: "return=representation",
  });
  return rows[0]?.id;
}

export async function confirmCsvImport(repId: string, filename: string, pharmacies: PharmacyInput[], summary: ImportSummary) {
  const saved = await upsertRepPharmacies(repId, pharmacies) as RepPharmacyRow[];
  await recordImportJob(repId, filename, summary);
  return saved;
}
