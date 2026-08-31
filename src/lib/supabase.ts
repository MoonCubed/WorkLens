import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Thrown lazily (at import time, client-side only) rather than silently falling
  // back to mock data — a missing shared backend should be loud, not invisible.
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example."
  );
}

// Single shared client for the whole app — every store's `useSupabaseTable` call
// reads/writes through this. Safe to expose in the browser bundle: the anon key
// is public by design, access is governed by the RLS policies in supabase/schema.sql.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
