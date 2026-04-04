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
            const urlStr = typeof url === 'string' ? url : url?.toString?.() || '';

            // NEVER timeout auth requests — token refresh MUST complete
            // or the session breaks and all queries fail
            if (urlStr.includes('/auth/')) {
              return fetch(url, options);
            }

            // Data queries get a 15-second timeout to prevent infinite loading
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            return fetch(url, { ...options, signal: controller.signal })
              .finally(() => clearTimeout(timeout));
          },
        },
      }
    );
  }
  return client;
}
