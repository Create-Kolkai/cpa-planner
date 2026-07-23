import { getSupabaseConfig } from "./config";
import type { AuthSession } from "./types";

const SESSION_KEY = "cpa-planner-auth-session";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string;
  prefer?: string;
  headers?: Record<string, string>;
};

export class SupabaseRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
  }
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch {
    return null;
  }
}

export function storeSession(session: AuthSession | null) {
  if (!session) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getAccessToken() {
  return getStoredSession()?.access_token;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : typeof payload?.error_description === "string" ? payload.error_description : response.statusText;
    throw new SupabaseRequestError(message, response.status);
  }
  return payload as T;
}

export async function supabaseAuth<T>(path: string, options: RequestOptions = {}) {
  const config = getSupabaseConfig();
  if (!config.configured) throw new SupabaseRequestError("Supabase is not configured.", 0);
  const response = await fetch(`${config.url}/auth/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function supabaseRest<T>(path: string, options: RequestOptions = {}) {
  const config = getSupabaseConfig();
  if (!config.configured) throw new SupabaseRequestError("Supabase is not configured.", 0);
  const token = options.token ?? getAccessToken();
  if (!token) throw new SupabaseRequestError("You need to sign in first.", 401);
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return parseResponse<T>(response);
}

export async function supabaseRpc<T>(name: string, body: unknown, options: RequestOptions = {}) {
  return supabaseRest<T>(`rpc/${name}`, {
    ...options,
    method: "POST",
    body,
  });
}
