import { supabaseRest } from "../lib/supabase/client";
import type { NotificationRow } from "../lib/supabase/types";

export async function listNotifications(userId: string) {
  return supabaseRest<NotificationRow[]>(`user_notifications?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=20`);
}

export async function markNotificationRead(id: string) {
  const rows = await supabaseRest<NotificationRow[]>(`user_notifications?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    body: { read_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  return rows[0];
}
