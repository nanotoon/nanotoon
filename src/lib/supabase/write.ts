"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Read the Supabase session from document.cookie.
 * @supabase/ssr stores it as `base64-<json>` in `sb-<ref>-auth-token` cookies.
 */
function readSessionFromCookie(): { access_token: string; user_id: string } | null {
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
    const token = session?.access_token;
    if (!token) return null;

    // Decode JWT to get user ID (sub claim)
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.sub) return null;

    return { access_token: token, user_id: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Get the current user's ID from the auth cookie.
 * Always in sync with createWriteClient()'s token.
 */
export function getAuthUserId(): string | null {
  return readSessionFromCookie()?.user_id ?? null;
}

/**
 * Create a fresh Supabase client with the access token from cookies.
 * No session management, no locks, no refresh.
 */
export function createWriteClient(): ReturnType<typeof createClient> | null {
  const session = readSessionFromCookie();
  if (!session) return null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
