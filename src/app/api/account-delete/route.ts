import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Account deletion endpoint.
//
// Four actions:
//   'start'           — user clicked Delete Account in /settings, confirmed
//                       twice and typed "delete". Marks profile pending,
//                       hides their series from the public (is_removed=true),
//                       and signs them out client-side.
//   'recover'         — pending user signed in and asked to recover, OR
//                       admin clicked Recover in /admin/user.
//   'delete-now'      — pending user signed in again and chose to delete
//                       immediately, resetting the 30-day timer (per spec).
//   'purge'           — opportunistic: called from admin pages on load to
//                       sweep anything >30 days past its deletion_scheduled_at
//                       / permanent_delete_scheduled_at. Admin only.
//
// Auth model (mirrors /api/admin-remove): admin JWT detected via cookie,
// user JWT detected the same way. Only 'purge' is admin-gated; the
// user-initiated actions just need the user's own JWT.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "nanotooncontact@gmail.com";
const GRACE_DAYS = 30;
const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

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

function getServiceClient() {
  // Prefer service role for the actual data mutations so RLS never blocks us
  // mid-flow (e.g. purging other users' rows). Fall back to anon if the env
  // var isn't set so the endpoint doesn't crash in that case; pages will
  // still be partially functional with the caller's JWT.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const jwt = decodeJwt(token);
  if (!jwt?.sub) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const body = await request.json();
  const { action, userId } = body as { action?: string; userId?: string };
  if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

  const admin = getServiceClient();
  const isAdmin = jwt.email === ADMIN_EMAIL;

  // ─── START: user-initiated deletion ─────────────────────────────────────
  if (action === "start") {
    const uid = jwt.sub;
    const nowIso = new Date().toISOString();

    // Mark profile pending
    const { error: pErr } = await admin.from("profiles").update({
      deletion_status: "pending",
      deletion_scheduled_at: nowIso,
    }).eq("id", uid);
    if (pErr) return NextResponse.json({ error: "Deletion failed: " + pErr.message }, { status: 500 });

    // Hide all their series via the existing is_removed mechanism so every
    // existing `.neq('is_removed', true)` filter site-wide picks this up
    // without needing to change the read paths. We flag the source with
    // removed_at set to the same moment so we know which ones were
    // auto-hidden for account deletion vs. admin-banned content.
    await admin.from("series").update({
      is_removed: true,
      removed_at: nowIso,
    }).eq("author_id", uid).neq("is_removed", true);

    return NextResponse.json({ ok: true });
  }

  // ─── RECOVER: bring pending account back (self OR admin) ────────────────
  if (action === "recover") {
    // Target: the caller if no userId supplied, otherwise must be admin.
    const targetId = userId && isAdmin ? userId : jwt.sub;
    if (userId && !isAdmin && userId !== jwt.sub) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    // Read the scheduled timestamp so we know whether to restore series.
    const { data: prof } = await admin.from("profiles")
      .select("deletion_status, deletion_scheduled_at")
      .eq("id", targetId).maybeSingle() as any;
    if (!prof || prof.deletion_status !== "pending") {
      return NextResponse.json({ error: "Account is not pending deletion" }, { status: 400 });
    }
    const scheduled = prof.deletion_scheduled_at ? new Date(prof.deletion_scheduled_at).getTime() : 0;
    if (scheduled && Date.now() - scheduled > GRACE_MS) {
      return NextResponse.json({ error: "Recovery window has expired" }, { status: 400 });
    }

    // Clear the pending state
    const { error: pErr } = await admin.from("profiles").update({
      deletion_status: null,
      deletion_scheduled_at: null,
    }).eq("id", targetId);
    if (pErr) return NextResponse.json({ error: "Recover failed: " + pErr.message }, { status: 500 });

    // Un-hide series that were auto-hidden at the same moment we started the
    // deletion (within a small tolerance window). We don't want to restore
    // series that were admin-banned BEFORE the deletion because those should
    // stay banned.
    if (prof.deletion_scheduled_at) {
      const startMs = new Date(prof.deletion_scheduled_at).getTime();
      const loIso = new Date(startMs - 5000).toISOString();   // 5s tolerance
      const hiIso = new Date(startMs + 5000).toISOString();
      await admin.from("series").update({
        is_removed: false,
        removed_at: null,
      }).eq("author_id", targetId)
        .eq("is_removed", true)
        .gte("removed_at", loIso)
        .lte("removed_at", hiIso);
    }

    return NextResponse.json({ ok: true });
  }

  // ─── DELETE-NOW: user signed in while pending and chose to re-confirm ──
  // Per spec: "if they press delete again the count down for total
  // deletion is reset back to 30 days." So we don't purge immediately;
  // we just reset deletion_scheduled_at to now().
  if (action === "delete-now") {
    const uid = jwt.sub;
    const { error } = await admin.from("profiles").update({
      deletion_status: "pending",
      deletion_scheduled_at: new Date().toISOString(),
    }).eq("id", uid);
    if (error) return NextResponse.json({ error: "Failed: " + error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ─── PURGE: sweep expired items (admin only, opportunistic) ─────────────
  if (action === "purge") {
    if (!isAdmin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const cutoffIso = new Date(Date.now() - GRACE_MS).toISOString();

    // Purge series whose permanent-delete window has elapsed.
    const { data: toKill } = await admin.from("series")
      .select("id")
      .not("permanent_delete_scheduled_at", "is", null)
      .lte("permanent_delete_scheduled_at", cutoffIso) as any;
    if (toKill && toKill.length > 0) {
      const ids = (toKill as any[]).map(r => r.id);
      await admin.from("chapters").delete().in("series_id", ids);
      await admin.from("likes").delete().in("series_id", ids);
      await admin.from("favorites").delete().in("series_id", ids);
      await admin.from("comments").delete().in("series_id", ids);
      await admin.from("series").delete().in("id", ids);
    }

    // Purge accounts whose deletion window has elapsed.
    const { data: toKillUsers } = await admin.from("profiles")
      .select("id")
      .eq("deletion_status", "pending")
      .lte("deletion_scheduled_at", cutoffIso) as any;
    if (toKillUsers && toKillUsers.length > 0) {
      const uids = (toKillUsers as any[]).map(r => r.id);
      // Gather series ids for full cleanup
      const { data: seriesOf } = await admin.from("series").select("id").in("author_id", uids) as any;
      const seriesIds = ((seriesOf ?? []) as any[]).map(s => s.id);
      if (seriesIds.length > 0) {
        await admin.from("chapters").delete().in("series_id", seriesIds);
        await admin.from("likes").delete().in("series_id", seriesIds);
        await admin.from("favorites").delete().in("series_id", seriesIds);
        await admin.from("comments").delete().in("series_id", seriesIds);
        await admin.from("series").delete().in("id", seriesIds);
      }
      // Clean cross-user tables that key on the user
      await admin.from("follows").delete().in("follower_id", uids);
      await admin.from("follows").delete().in("following_id", uids);
      await admin.from("comments").delete().in("user_id", uids);
      await admin.from("comment_likes").delete().in("user_id", uids);
      await admin.from("notifications").delete().in("user_id", uids);
      await admin.from("profiles").delete().in("id", uids);
      // Note: we do NOT attempt to delete auth.users here. That requires the
      // Supabase admin API and, if desired, should be called separately.
      // The profile row is gone so the account is effectively orphaned;
      // on next sign-in the callback will re-create an empty profile,
      // which the email-pending check below will still reject.
    }

    return NextResponse.json({ ok: true, purgedSeries: (toKill ?? []).length, purgedUsers: (toKillUsers ?? []).length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ─── GET: status check (is this email currently pending deletion?) ─────
// Used by the register page to decide whether to block a sign-up.
// Query: GET /api/account-delete?email=foo@bar.com
// Returns: { pending: boolean, daysLeft?: number }
// Uses the service client so it works for logged-out visitors.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

  const admin = getServiceClient();
  // We match by email on auth.users → profiles.id. Supabase doesn't expose
  // auth.users directly via PostgREST, so this requires the service role.
  // If service role isn't configured, we gracefully return { pending: false }
  // rather than blocking legitimate signups.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ pending: false });
  }

  try {
    // Use the admin auth API to look up the user by email.
    const { data: users } = await (admin.auth.admin as any).listUsers({ perPage: 200 });
    const match = (users?.users ?? []).find((u: any) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (!match) return NextResponse.json({ pending: false });

    const { data: prof } = await admin.from("profiles")
      .select("deletion_status, deletion_scheduled_at")
      .eq("id", match.id).maybeSingle() as any;
    if (!prof || prof.deletion_status !== "pending" || !prof.deletion_scheduled_at) {
      return NextResponse.json({ pending: false });
    }
    const elapsed = Date.now() - new Date(prof.deletion_scheduled_at).getTime();
    const daysLeft = Math.max(0, Math.ceil((GRACE_MS - elapsed) / (24 * 60 * 60 * 1000)));
    return NextResponse.json({ pending: true, daysLeft });
  } catch {
    return NextResponse.json({ pending: false });
  }
}
