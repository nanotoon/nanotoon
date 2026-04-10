"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Read the Supabase access token directly from document.cookie.
 * This bypasses the singleton browser client's internal navigator.locks
 * which can deadlock when a token refresh is pending on Cloudflare Workers.
 *
 * @supabase/ssr stores session as `base64-<json>` in cookies named
 * `sb-<ref>-auth-token` (possibly chunked: `.0`, `.1`, …).
 */
export function getAccessToken(): string | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const ref = url.match(/\/\/([^.]+)\./)?.[1] || "";
    const cookieName = `sb-${ref}-auth-token`;
    const cookies = document.cookie.split(";").map((c) => c.trim());

    const chunks: { idx: number; val: string }[] = [];
    for (const c of cookies) {
      const eq = c.indexOf("=");
      if (eq < 0) continue;
      const name = c.slice(0, eq);
      const val = c.slice(eq + 1);
      if (name === cookieName) chunks.push({ idx: -1, val });
      else if (name.startsWith(cookieName + ".")) {
        const i = parseInt(name.split(".").pop()!);
        if (!isNaN(i)) chunks.push({ idx: i, val });
      }
    }
    if (chunks.length === 0) return null;

    chunks.sort((a, b) => a.idx - b.idx);
    let raw = chunks.map((c) => decodeURIComponent(c.val)).join("");
    if (raw.startsWith("base64-")) raw = atob(raw.slice(7));
    const session = JSON.parse(raw);
    return session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Create a fresh Supabase client with the access token from cookies.
 * This client has NO session management, NO locks, NO refresh — it just
 * sends the token as a Bearer header and does PostgREST calls.
 *
 * Returns null if no valid token is found.
 */
export function createWriteClient(): ReturnType<typeof createClient> | null {
  const token = getAccessToken();
  if (!token) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
