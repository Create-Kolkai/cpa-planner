import { supabaseRest } from "../lib/supabase/client";
import type { BlockedDateRow, BlockedDateType } from "../lib/supabase/types";

export type BlockedDateInput = {
  id?: string;
  repId: string;
  date: string;
  type: BlockedDateType;
  reason: string;
  createdBy?: string;
  source?: string;
};

export async function listBlockedDates(repId: string, month?: string) {
  const monthFilter = month ? `&date=gte.${month}-01&date=lt.${nextMonth(month)}-01` : "";
  return supabaseRest<BlockedDateRow[]>(`blocked_dates?rep_id=eq.${encodeURIComponent(repId)}${monthFilter}&select=*&order=date.asc`);
}

export async function upsertBlockedDate(input: BlockedDateInput) {
  const rows = await supabaseRest<BlockedDateRow[]>("blocked_dates?select=*", {
    method: "POST",
    body: [{
      ...(input.id ? { id: input.id } : {}),
      rep_id: input.repId,
      date: input.date,
      type: input.type,
      reason: input.reason,
      created_by: input.createdBy ?? input.repId,
      source: input.source ?? "rep",
    }],
    prefer: "resolution=merge-duplicates,return=representation",
  });
  return rows[0];
}

export async function deleteBlockedDate(id: string) {
  await supabaseRest(`blocked_dates?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function deleteBlockedDateByDate(repId: string, date: string) {
  await supabaseRest(`blocked_dates?rep_id=eq.${encodeURIComponent(repId)}&date=eq.${encodeURIComponent(date)}`, { method: "DELETE" });
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(year, monthNumber, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}
