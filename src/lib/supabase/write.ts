"use client";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getRef(): string {
  return SUPABASE_URL.match(/\/\/([^.]+)\./)?.[1] || "";
}

function getCookieName(): string {
  return `sb-${getRef()}-auth-token`;
}

/**
 * Read the full Supabase session from document.cookie.
 */
function readSessionFromCookie(): {
  access_token: string;
  refresh_token: string;
  user_id: string;
} | null {
  try {
    const cookieName = getCookieName();
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

    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.sub) return null;

    return {
      access_token: token,
      refresh_token: session?.refresh_token || "",
      user_id: payload.sub,
    };
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp < Math.floor(Date.now() / 1000) + 60;
  } catch {
    return true;
  }
}

/**
 * Write session back to cookie in base64 format that @supabase/ssr expects.
 */
function writeSessionToCookie(session: any): void {
  const cookieName = getCookieName();
  const encoded = "base64-" + btoa(JSON.stringify(session));
  const maxChunkSize = 3180;

  // Clear old cookies
  const allCookies = document.cookie.split(";").map((c) => c.trim());
  for (const c of allCookies) {
    const name = c.split("=")[0];
    if (name === cookieName || name.startsWith(cookieName + ".")) {
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }
  }

  if (encoded.length <= maxChunkSize) {
    document.cookie = `${cookieName}=${encodeURIComponent(encoded)};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
  } else {
    const chunkArr = [];
    for (let i = 0; i < encoded.length; i += maxChunkSize) {
      chunkArr.push(encoded.slice(i, i + maxChunkSize));
    }
    for (let i = 0; i < chunkArr.length; i++) {
      document.cookie = `${cookieName}.${i}=${encodeURIComponent(chunkArr[i])};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    }
  }
}

/**
 * Refresh the token if expired. Call BEFORE any write operation.
 * Uses Supabase auth API directly — no singleton client, no locks.
 */
export async function ensureFreshSession(): Promise<boolean> {
  const session = readSessionFromCookie();
  if (!session) return false;
  if (!isTokenExpired(session.access_token)) return true;
  if (!session.refresh_token) return false;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.access_token) return false;
    writeSessionToCookie(data);
    return true;
  } catch {
    return false;
  }
}

export function getAuthUserId(): string | null {
  return readSessionFromCookie()?.user_id ?? null;
}

export function createWriteClient(): ReturnType<typeof createClient> | null {
  const session = readSessionFromCookie();
  if (!session) return null;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
