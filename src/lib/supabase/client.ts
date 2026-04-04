"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // CRITICAL FIX: Disable auto-refresh.
          // When auto-refresh hangs (common on Cloudflare), it blocks
          // ALL queries behind it, causing infinite loading.
          // We handle refresh manually in AuthContext instead.
          autoRefreshToken: false,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }
    );
  }
  return client;
}
