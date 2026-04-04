"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Anon-only client for PUBLIC reads (series, gallery, categories, etc.)
// This client NEVER has a JWT attached, so queries always work
// regardless of auth state. Uses the same anon key but without
// the SSR auth session management that causes hangs.
let anonClient: ReturnType<typeof createSupabaseClient> | null = null;

export function createAnonClient() {
  if (!anonClient) {
    anonClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return anonClient;
}
