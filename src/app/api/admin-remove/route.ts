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

  const table = contentType === "Series" ? "series" : "gallery";

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

  // === PERMANENT DELETE ===
  if (action === "permanent-delete") {
    if (table === "series") {
      await supabase.from("chapters").delete().eq("series_id", contentId);
      await supabase.from("likes").delete().eq("series_id", contentId);
      await supabase.from("favorites").delete().eq("series_id", contentId);
      await supabase.from("comments").delete().eq("series_id", contentId);
    }
    const { error } = await supabase.from(table).delete().eq("id", contentId);
    if (error) return NextResponse.json({ error: "Delete failed: " + error.message }, { status: 500 });
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
