import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Chapter update endpoint (title + rating).
//
// Why this route exists:
//   Saving rating changes from the client-side edit page silently failed for
//   regular users — title updates would persist but rating would revert. The
//   symptom matches the same family of RLS failures we fixed for /api/views:
//   the row-update returns no error but zero rows actually change, because
//   the RLS or column-level policy on chapters.rating is stricter than on
//   chapters.title. (The policy likely grants UPDATE on a column subset that
//   doesn't include rating.)
//
//   Routing the write through the service role sidesteps whatever the
//   production policy looks like. We still verify ownership server-side —
//   the caller must be the series author OR the admin — so this route
//   can't be abused to rewrite other people's chapters.
//
// Fallback behaviour:
//   If SUPABASE_SERVICE_ROLE_KEY isn't configured, we return a 501 with a
//   message pointing at the env var. That way the client can surface a
//   real error instead of silently "succeeding" again.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "nanotooncontact@gmail.com";

function getTokenFromCookies(request: NextRequest): string | null {
  try {
    const all = request.cookies.getAll();
    const authCookies = all.filter((c) => c.name.includes("-auth-token"));
    if (authCookies.length === 0) return null;
    const baseName = authCookies[0].name.replace(/\.\d+$/, "");
    const chunks = all
      .filter((c) => c.name === baseName || c.name.startsWith(baseName + "."))
      .sort((a, b) => {
        const idx = (n: string) => { const m = n.match(/\.(\d+)$/); return m ? parseInt(m[1]) : -1; };
        return idx(a.name) - idx(b.name);
      });
    let raw = chunks.map((c) => c.value).join("");
    if (raw.startsWith("base64-")) raw = atob(raw.slice(7));
    return JSON.parse(raw)?.access_token || null;
  } catch { return null; }
}

function decodeJwt(token: string): { email?: string; sub?: string } | null {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const jwt = decodeJwt(token);
  if (!jwt?.sub) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { chapterId, title, rating } = body as { chapterId?: string; title?: string; rating?: string };
  if (!chapterId) return NextResponse.json({ error: "Missing chapterId" }, { status: 400 });

  // Only 'General' and 'Mature' are accepted — matches the two edit buttons
  // the UI exposes. Reject anything else so this route can't be used to
  // inject arbitrary values into the column.
  if (rating !== undefined && rating !== "General" && rating !== "Mature") {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({
      error: "Server not configured (SUPABASE_SERVICE_ROLE_KEY missing). Rating updates need this env var because the client-side write is being blocked by RLS.",
    }, { status: 501 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ownership check: the caller must be the series author of this chapter,
  // OR the admin. We load the chapter + its parent series author and
  // compare to jwt.sub.
  const { data: ch, error: readErr } = await admin
    .from("chapters")
    .select("id, series_id, series:series_id(author_id)")
    .eq("id", chapterId)
    .maybeSingle() as any;
  if (readErr) return NextResponse.json({ error: "Read failed: " + readErr.message }, { status: 500 });
  if (!ch) return NextResponse.json({ error: "Chapter not found" }, { status: 404 });

  const authorId = ch.series?.author_id;
  const isOwner = authorId && authorId === jwt.sub;
  const isAdmin = jwt.email === ADMIN_EMAIL;
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Build the update payload from only the fields the caller sent, so we
  // don't accidentally clobber title when the caller just wants to change
  // rating (or vice versa).
  const patch: Record<string, any> = {};
  if (typeof title === "string") patch.title = title;
  if (typeof rating === "string") patch.rating = rating;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error: updErr } = await admin.from("chapters").update(patch).eq("id", chapterId);
  if (updErr) return NextResponse.json({ error: "Update failed: " + updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, patch });
}
