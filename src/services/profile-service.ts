import { supabaseRest } from "../lib/supabase/client";
import type { ProfileRow } from "../lib/supabase/types";

export async function getProfile(userId: string) {
  const rows = await supabaseRest<ProfileRow[]>(`profiles?id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!rows[0]) throw new Error("Your profile is not ready yet. Please contact the demo administrator.");
  return rows[0];
}

export async function updateProfileName(userId: string, fullName: string) {
  const rows = await supabaseRest<ProfileRow[]>(`profiles?id=eq.${encodeURIComponent(userId)}&select=*`, {
    method: "PATCH",
    body: { full_name: fullName },
    prefer: "return=representation",
  });
  return rows[0];
}
