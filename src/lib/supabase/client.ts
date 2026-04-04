"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          fetch: (url: any, options: any = {}) => {
            // CRITICAL: 10-second timeout on ALL supabase requests.
            // Prevents token refresh and queries from hanging forever on Cloudflare.
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            return fetch(url, { ...options, signal: controller.signal })
              .finally(() => clearTimeout(timeout));
          },
        },
      }
    );
  }
  return client;
}
