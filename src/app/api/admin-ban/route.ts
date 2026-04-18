import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Admin ban / unban endpoint.
//
// Mirrors /api/admin-remove/route.ts exactly in shape: admin identifies via
// their own JWT (email must equal ADMIN_EMAIL), and the update + notification
// insert go through the admin's JWT so the existing RLS policies that already
// bypass-for-admin cover us. No service role needed.
//
// Required DB change (run in Supabase SQL editor if you haven't already):
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean DEFAULT false;
//   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
//
// Enforcement note:
//   This endpoint only *flags* the profile. The AuthContext on the client picks
//   up the flag on sign-in / session refresh and forces a sign-out. This is the
//   same trust model as admin-remove (relies on admin JWT + RLS). If you want
//   hard auth-level lockout later, that requires SUPABASE_SERVICE_ROLE_KEY and
//   a call to supabase.auth.admin.updateUserById({ ban_duration: ... }).
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
  if (!jwt || jwt.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { action, userId } = await request.json();
  if (!action || !userId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Safety: admin cannot ban themselves.
  if (userId === jwt.sub) {
    return NextResponse.json({ error: "You cannot ban yourself" }, { status: 400 });
  }

  // Use admin JWT (same pattern as admin-remove). RLS policies that currently
  // grant the admin email update rights on profiles cover us here.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
  );

  // === BAN ===
  if (action === "ban") {
    const { error } = await supabase.from("profiles").update({
      is_banned: true,
      banned_at: new Date().toISOString(),
    }).eq("id", userId);
    if (error) return NextResponse.json({ error: "Ban failed: " + error.message }, { status: 500 });

    // Notify the banned user. They'll see this the next time they sign in
    // (or, if they're signed in right now, it will arrive next time the
    // notifications page loads — though AuthContext will force-sign-them-out
    // first, which is the intended behaviour).
    await supabase.from("notifications").insert({
      user_id: userId,
      actor_id: jwt.sub,
      type: "ban",
      message: "Your account has been suspended for repeated or severe violations of NANOTOON's community guidelines. You are no longer able to sign in, post content, comment, or otherwise interact with the platform. If you believe this is a mistake, please contact nanotooncontact@gmail.com to appeal.",
    }).select().maybeSingle();

    return NextResponse.json({ ok: true });
  }

  // === UNBAN ===
  if (action === "unban") {
    const { error } = await supabase.from("profiles").update({
      is_banned: false,
      banned_at: null,
    }).eq("id", userId);
    if (error) return NextResponse.json({ error: "Unban failed: " + error.message }, { status: 500 });

    await supabase.from("notifications").insert({
      user_id: userId,
      actor_id: jwt.sub,
      type: "unban",
      message: "Good news — your NANOTOON account has been reinstated. You can sign in again and resume posting, commenting, and following. Please review the community guidelines to avoid further issues.",
    }).select().maybeSingle();

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
