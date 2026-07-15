import { createClient } from "@supabase/supabase-js";

// Service-role client for server-side ingest and reads (never import in client code).
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env (URL / SERVICE_ROLE_KEY)");
  return createClient(url.replace(/\/+$/, ""), key, { auth: { persistSession: false } });
}
