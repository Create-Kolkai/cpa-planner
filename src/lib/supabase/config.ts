export type SupabaseConfig = {
  url: string;
  anonKey: string;
  configured: boolean;
};

function envValue(key: string) {
  return String(import.meta.env[key] ?? "").trim();
}

export function getSupabaseConfig(): SupabaseConfig {
  const url = envValue("VITE_SUPABASE_URL").replace(/\/$/, "");
  const anonKey = envValue("VITE_SUPABASE_ANON_KEY");
  return {
    url,
    anonKey,
    configured: Boolean(url && anonKey),
  };
}

export function isDemoMode() {
  return String(import.meta.env.VITE_APP_DEMO_MODE ?? "false").toLowerCase() === "true";
}
