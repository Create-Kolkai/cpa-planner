import { supabaseRest, supabaseRpc } from "../lib/supabase/client";
import type { MonthlyPlanRow, PlanDayRow, PlanStatus, PlanVisitRow } from "../lib/supabase/types";

export type PlanDayInput = {
  date: string;
  locked?: boolean;
  manuallyModified?: boolean;
  primaryArea?: string;
  visitCount: number;
  routeMode?: string;
};

export type PlanVisitInput = {
  repPharmacyId: string;
  occurrenceNumber: number;
  date: string;
  stopOrder?: number;
  status?: "scheduled" | "unresolved" | "removed";
  manuallyMoved?: boolean;
  originalDate?: string;
  planningNotes?: string;
};

export type SavePlanInput = {
  month: string;
  status: PlanStatus;
  generationMode: string;
  settingsSnapshot: Record<string, unknown>;
  requiredVisitCount: number;
  scheduledVisitCount: number;
  unresolvedVisitCount: number;
  availableCapacity: number;
  days: PlanDayInput[];
  visits: PlanVisitInput[];
  reason: string;
};

export type LoadedPlan = {
  plan: MonthlyPlanRow;
  days: PlanDayRow[];
  visits: PlanVisitRow[];
};

export async function loadLatestMonthlyPlan(repId: string, month: string): Promise<LoadedPlan | null> {
  const monthDate = `${month}-01`;
  const plans = await supabaseRest<MonthlyPlanRow[]>(`monthly_plans?rep_id=eq.${encodeURIComponent(repId)}&month=eq.${monthDate}&select=*&order=version.desc&limit=1`);
  const plan = plans[0];
  if (!plan) return null;
  const [days, visits] = await Promise.all([
    supabaseRest<PlanDayRow[]>(`plan_days?plan_id=eq.${encodeURIComponent(plan.id)}&select=*&order=date.asc`),
    supabaseRest<PlanVisitRow[]>(`plan_visits?plan_id=eq.${encodeURIComponent(plan.id)}&select=*&order=stop_order.asc`),
  ]);
  return { plan, days, visits };
}

export async function saveMonthlyPlan(input: SavePlanInput) {
  return supabaseRpc<string>("save_monthly_plan", {
    plan_month: `${input.month}-01`,
    plan_status: input.status,
    generation_mode: input.generationMode,
    settings_snapshot: input.settingsSnapshot,
    required_visit_count: input.requiredVisitCount,
    scheduled_visit_count: input.scheduledVisitCount,
    unresolved_visit_count: input.unresolvedVisitCount,
    available_capacity: input.availableCapacity,
    days_payload: input.days.map((day) => ({
      date: day.date,
      locked: day.locked ?? false,
      manually_modified: day.manuallyModified ?? false,
      primary_area: day.primaryArea ?? null,
      visit_count: day.visitCount,
      route_mode: day.routeMode ?? "approximate",
    })),
    visits_payload: input.visits.map((visit) => ({
      rep_pharmacy_id: visit.repPharmacyId,
      occurrence_number: visit.occurrenceNumber,
      date: visit.date,
      stop_order: visit.stopOrder ?? null,
      status: visit.status ?? "scheduled",
      manually_moved: visit.manuallyMoved ?? false,
      original_date: visit.originalDate ?? null,
      planning_notes: visit.planningNotes ?? null,
    })),
    change_reason: input.reason,
  });
}
