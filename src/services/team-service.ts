import { supabaseRest } from "../lib/supabase/client";
import type { MonthlyPlanRow, ProfileRow } from "../lib/supabase/types";

export type TeamRepSummary = {
  profile: ProfileRow;
  latestPlan?: MonthlyPlanRow;
};

export async function listAssignedRepresentatives(managerId: string) {
  const reps = await supabaseRest<ProfileRow[]>(`profiles?manager_id=eq.${encodeURIComponent(managerId)}&active=eq.true&select=*&order=full_name.asc`);
  if (!reps.length) return [];
  const ids = reps.map((rep) => rep.id).join(",");
  const plans = await supabaseRest<MonthlyPlanRow[]>(`monthly_plans?rep_id=in.(${ids})&select=*&order=updated_at.desc`);
  return reps.map((profile) => ({
    profile,
    latestPlan: plans.find((plan) => plan.rep_id === profile.id),
  })) satisfies TeamRepSummary[];
}
