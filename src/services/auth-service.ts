import { getStoredSession, storeSession, supabaseAuth } from "../lib/supabase/client";
import type { AuthSession } from "../lib/supabase/types";

type PasswordResponse = AuthSession & {
  token_type: string;
  expires_in: number;
};

export function currentSession() {
  return getStoredSession();
}

export async function signInWithPassword(email: string, password: string) {
  const session = await supabaseAuth<PasswordResponse>("token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  storeSession(session);
  return session;
}

export async function signUpWithPassword(email: string, password: string, fullName: string) {
  const session = await supabaseAuth<PasswordResponse>("signup", {
    method: "POST",
    body: { email, password, data: { full_name: fullName } },
  });
  if (session.access_token) storeSession(session);
  return session;
}

export async function requestPasswordReset(email: string, redirectTo?: string) {
  await supabaseAuth("recover", {
    method: "POST",
    body: { email, redirect_to: redirectTo },
  });
}

export async function signOut() {
  const token = getStoredSession()?.access_token;
  if (token) {
    await supabaseAuth("logout", { method: "POST", token }).catch(() => undefined);
  }
  storeSession(null);
}
