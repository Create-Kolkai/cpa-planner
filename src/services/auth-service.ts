import { getStoredSession, storeSession, supabaseAuth } from "../lib/supabase/client";
import type { AuthSession } from "../lib/supabase/types";

type SessionPayload = Partial<AuthSession> & {
  token_type?: string;
  expires_in?: number;
  user?: AuthSession["user"] | null;
};

type PasswordResponse = SessionPayload & {
  session?: SessionPayload | null;
};

type SignUpResult =
  | { status: "authenticated"; session: AuthSession }
  | { status: "confirmation-required"; email: string };

export type AuthCallbackResult =
  | { status: "none" }
  | { status: "authenticated"; session: AuthSession }
  | { status: "error"; message: string };

export function currentSession() {
  return getStoredSession();
}

function configuredFallbackRedirectUrl() {
  return String(import.meta.env.APP_URL ?? "/").trim() || "/";
}

export function getAuthRedirectUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/`;
  }

  return configuredFallbackRedirectUrl();
}

function normalizeSession(payload: PasswordResponse | null | undefined): AuthSession | null {
  const candidate = payload?.session ?? payload;
  if (!candidate?.access_token || !candidate.user?.id) return null;
  return {
    access_token: candidate.access_token,
    refresh_token: candidate.refresh_token,
    expires_at: candidate.expires_at ?? (candidate.expires_in ? Math.floor(Date.now() / 1000) + Number(candidate.expires_in) : undefined),
    user: {
      id: candidate.user.id,
      email: candidate.user.email,
    },
  };
}

export async function signInWithPassword(email: string, password: string) {
  const session = await supabaseAuth<PasswordResponse>("token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  const normalized = normalizeSession(session);
  if (!normalized) throw new Error("Sign in succeeded, but we could not restore your session. Please try again.");
  storeSession(normalized);
  return normalized;
}

export async function signUpWithPassword(email: string, password: string, fullName: string): Promise<SignUpResult> {
  const redirectTo = getAuthRedirectUrl();
  const session = await supabaseAuth<PasswordResponse>(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: { email, password, data: { full_name: fullName } },
  });
  const normalized = normalizeSession(session);
  if (normalized) {
    storeSession(normalized);
    return { status: "authenticated", session: normalized };
  }
  return { status: "confirmation-required", email };
}

export async function requestPasswordReset(email: string, redirectTo?: string) {
  const target = redirectTo ?? getAuthRedirectUrl();
  await supabaseAuth(`recover?redirect_to=${encodeURIComponent(target)}`, {
    method: "POST",
    body: { email },
  });
}

export async function resendSignUpConfirmation(email: string) {
  await supabaseAuth("resend", {
    method: "POST",
    body: {
      type: "signup",
      email,
      options: {
        email_redirect_to: getAuthRedirectUrl(),
      },
    },
  });
}

function clearAuthParameters() {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
}

export async function processAuthCallbackFromUrl(): Promise<AuthCallbackResult> {
  if (typeof window === "undefined" || !window.location.hash) return { status: "none" };

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hasAuthParams = params.has("access_token") || params.has("refresh_token") || params.has("error") || params.has("error_description");
  if (!hasAuthParams) return { status: "none" };

  const error = params.get("error_description") || params.get("error") || params.get("error_code");
  if (error) {
    clearAuthParameters();
    return { status: "error", message: decodeURIComponent(error.replace(/\+/g, " ")) };
  }

  const accessToken = params.get("access_token");
  if (!accessToken) {
    clearAuthParameters();
    return { status: "error", message: "The confirmation link did not include a valid access token. Please request a new link." };
  }

  try {
    const user = await supabaseAuth<AuthSession["user"]>("user", { token: accessToken });
    if (!user?.id) throw new Error("We could not confirm that sign-in link. Please request a new link.");
    const expiresIn = Number(params.get("expires_in") ?? 0);
    const session: AuthSession = {
      access_token: accessToken,
      refresh_token: params.get("refresh_token") ?? undefined,
      expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined,
      user: {
        id: user.id,
        email: user.email,
      },
    };
    storeSession(session);
    clearAuthParameters();
    return { status: "authenticated", session };
  } catch (error) {
    clearAuthParameters();
    return { status: "error", message: error instanceof Error ? error.message : "Could not complete email confirmation." };
  }
}

export async function signOut() {
  const token = getStoredSession()?.access_token;
  if (token) {
    await supabaseAuth("logout", { method: "POST", token }).catch(() => undefined);
  }
  storeSession(null);
}
