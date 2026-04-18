import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  if (!jwt || jwt.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { action, contentType, contentId, contentTitle, authorId } = await request.json();
  if (!contentType || !contentId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const table = "series";

  // Use admin JWT with admin RLS policies
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
  );

  // === RESTORE ===
  if (action === "restore") {
    const { error } = await supabase.from(table).update({ is_removed: false, removed_at: null }).eq("id", contentId);
    if (error) return NextResponse.json({ error: "Restore failed: " + error.message }, { status: 500 });
    // Send restore notification
    if (authorId && jwt.sub) {
      await supabase.from("notifications").insert({
        user_id: authorId,
        actor_id: jwt.sub,
        type: "restoration",
        message: `Your ${contentType.toLowerCase()} "${contentTitle || "Untitled"}" has been restored.`,
      }).select().maybeSingle();
    }
    return NextResponse.json({ ok: true });
  }

  // === PERMANENT DELETE (30-day limbo) ===
  // Per spec: clicking Delete Forever no longer hard-deletes. It schedules
  // a 30-day limbo during which the series is fully hidden (even from
  // admin everywhere except /admin/trash, where the Delete-Forever button
  // turns into Recover). A background purge (/api/account-delete?action=purge,
  // triggered opportunistically from admin pages) nukes rows past 30 days.
  //
  // 48-hour reset rule:
  //   - Normally, re-clicking Delete Forever on a recovered series does NOT
  //     reset the countdown — the prior schedule is preserved.
  //   - BUT if more than 48 hours have passed since the last recover, it IS
  //     treated as a fresh deletion and the countdown restarts at 30 days.
  if (action === "permanent-delete") {
    const { data: cur } = await supabase.from(table)
      .select("permanent_delete_scheduled_at, permanent_delete_recovered_at")
      .eq("id", contentId).maybeSingle() as any;

    const now = Date.now();
    const RESET_MS = 48 * 60 * 60 * 1000;
    const prior = cur?.permanent_delete_scheduled_at ? new Date(cur.permanent_delete_scheduled_at).getTime() : null;
    const recovered = cur?.permanent_delete_recovered_at ? new Date(cur.permanent_delete_recovered_at).getTime() : null;

    // Decide which schedule timestamp to write.
    //   - Never scheduled before → start a fresh 30 days (use now).
    //   - Was scheduled, was recovered more than 48h ago → fresh 30 days.
    //   - Was scheduled and (never recovered OR recovered within 48h) →
    //     keep the original schedule (countdown continues).
    let scheduledAt: string;
    if (!prior) {
      scheduledAt = new Date(now).toISOString();
    } else if (recovered && (now - recovered) > RESET_MS) {
      scheduledAt = new Date(now).toISOString();
    } else {
      scheduledAt = new Date(prior).toISOString();
    }

    const { error } = await supabase.from(table).update({
      permanent_delete_scheduled_at: scheduledAt,
      // Clear any prior recovered timestamp — it's no longer the latest state.
      permanent_delete_recovered_at: null,
    }).eq("id", contentId);
    if (error) return NextResponse.json({ error: "Delete failed: " + error.message }, { status: 500 });
    return NextResponse.json({ ok: true, scheduledAt });
  }

  // === RECOVER FROM PERMANENT-DELETE LIMBO (different from restore) ===
  // The Recover button that appears on an item in Delete-Forever limbo.
  // Clears the scheduled timestamp and stamps recovered_at so the 48-hour
  // reset rule can be evaluated if admin later re-presses Delete Forever.
  if (action === "recover-from-permanent") {
    const { error } = await supabase.from(table).update({
      permanent_delete_scheduled_at: null,
      permanent_delete_recovered_at: new Date().toISOString(),
    }).eq("id", contentId);
    if (error) return NextResponse.json({ error: "Recover failed: " + error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // === SOFT DELETE (default) ===
  const { error } = await supabase.from(table).update({
    is_removed: true, removed_at: new Date().toISOString()
  }).eq("id", contentId);
  if (error) return NextResponse.json({ error: "Remove failed: " + error.message }, { status: 500 });

  // Send removal notification to content owner
  if (authorId && jwt.sub) {
    await supabase.from("notifications").insert({
      user_id: authorId,
      actor_id: jwt.sub,
      type: "removal",
      message: `Your ${contentType.toLowerCase()} "${contentTitle || "Untitled"}" was removed: Potential policy violation. Contact nanotooncontact@gmail.com if you believe this was a mistake.`,
    }).select().maybeSingle();
  }

  return NextResponse.json({ ok: true });
}
