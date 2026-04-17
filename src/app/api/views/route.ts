import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// View increment endpoint.
//
// Why this route exists:
//   Row-Level-Security on `series` and `chapters` only allows the row's author
//   (or the admin account) to UPDATE those rows. So when a non-admin user — or,
//   worse, an anonymous visitor — hits the reader page, the client-side
//   UPDATE to total_views / chapter.views silently fails under RLS. That's why
//   only the admin account `nanotooncontact@gmail.com` saw views tick up on
//   spam-refresh.
//
// Fix:
//   Move the increment server-side and use the SERVICE ROLE key, which bypasses
//   RLS. Any visitor (logged-in or not) can POST here and their view gets
//   counted. We do NOT trust anything from the request body besides the target
//   id — the increment is a +1 done server-side, so there's no way for a caller
//   to spoof a larger bump.
//
// Fallback:
//   If SUPABASE_SERVICE_ROLE_KEY isn't configured yet, we fall back to using
//   the anon key. That won't bypass RLS but it at least keeps the old admin
//   behaviour working so nothing gets worse. Set the service role key as a
//   Cloudflare Pages env var (NOT public) to make this work for everyone.
// ─────────────────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  // Prefer service role (bypasses RLS). Fall back to anon so the endpoint
  // doesn't crash if the env var hasn't been set yet in production.
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  let body: { seriesId?: string; chapterId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { seriesId, chapterId } = body;
  if (!seriesId && !chapterId) {
    return NextResponse.json({ error: "Missing seriesId or chapterId" }, { status: 400 });
  }

  const supabase = getAdminClient();

  try {
    // Series view bump
    if (seriesId) {
      // Read current value, then write current+1. We deliberately don't wrap
      // this in a transaction — view counts are best-effort and a lost race
      // here is acceptable.
      const { data: row } = await supabase
        .from("series")
        .select("total_views")
        .eq("id", seriesId)
        .maybeSingle();
      const next = ((row as any)?.total_views ?? 0) + 1;
      const { error } = await supabase
        .from("series")
        .update({ total_views: next })
        .eq("id", seriesId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, total_views: next });
    }

    // Chapter view bump
    if (chapterId) {
      const { data: row } = await supabase
        .from("chapters")
        .select("views")
        .eq("id", chapterId)
        .maybeSingle();
      const next = ((row as any)?.views ?? 0) + 1;
      const { error } = await supabase
        .from("chapters")
        .update({ views: next })
        .eq("id", chapterId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, views: next });
    }

    return NextResponse.json({ error: "No target" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
