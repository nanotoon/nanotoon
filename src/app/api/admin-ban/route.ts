import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Admin ban / unban endpoint.
//
// Mirrors /api/admin-remove/route.ts exactly in shape: admin identifies via
// their own JWT (email must equal ADMIN_EMAIL), and the update + notification
// insert go through the admin's JWT so the existing RLS policies that already
// bypass-for-admin cover us.
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
//
// Email notifications:
//   After a successful ban or unban, we look up the target user's email via the
//   service role (auth.users is not readable with the admin JWT alone) and send
//   a Resend notification. Email is best-effort — a Resend outage does NOT roll
//   back the ban/unban. Falls back silently if RESEND_API_KEY or
//   SUPABASE_SERVICE_ROLE_KEY is missing.
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

// ─── Ban/unban email helpers ────────────────────────────────────────────────
// Look up the target user's email from auth.users. Needs service role because
// auth.users is not exposed to the admin's JWT. Returns null on any failure
// so the caller can skip the email step silently.
async function lookupUserEmailAndName(userId: string): Promise<{ email: string; displayName: string } | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supaUrl) return null;
  try {
    const admin = createClient(supaUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    const u = data.user;
    // Prefer profiles.display_name, fall back to user_metadata, then email prefix.
    let displayName = "";
    try {
      const { data: p } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      if (p && (p as any).display_name) displayName = (p as any).display_name;
    } catch { /* fall through */ }
    if (!displayName) {
      displayName =
        u.user_metadata?.display_name ||
        u.user_metadata?.full_name ||
        u.user_metadata?.name ||
        u.email!.split("@")[0] ||
        "there";
    }
    return { email: u.email!, displayName };
  } catch {
    return null;
  }
}

// Shared email shell — same visual language as the welcome email so ban/unban
// feel like they came from the same brand. `accent` is the header gradient;
// we use purple for unban (reinstated, positive) and red for ban (firm).
function renderEmail(opts: {
  accent: string;
  heading: string;
  greetingName: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:520px;margin:40px auto;background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;"><div style="background:${opts.accent};padding:32px;text-align:center;"><div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;"><span style="color:white;font-size:28px;font-weight:900;">N</span></div><h1 style="color:white;font-size:24px;font-weight:700;margin:0;">${opts.heading}</h1></div><div style="padding:32px;"><p style="color:#e4e4e7;font-size:16px;margin:0 0 16px;">Hi <strong>${opts.greetingName}</strong>,</p>${opts.bodyHtml}<hr style="border:none;border-top:1px solid #27272a;margin:0 0 20px;"><p style="color:#52525b;font-size:12px;margin:0;text-align:center;">You're receiving this because you have an account at nanotoon.io<br>© 2025 NANOTOON. All rights reserved.</p></div></div></body></html>`;
}

// Send the actual email via Resend. Awaited (see welcome-email fix for why
// fire-and-forget doesn't work on the Workers runtime). Swallows errors so a
// Resend outage never bubbles up and rolls back the ban.
async function sendModerationEmail(kind: "ban" | "unban", userId: string): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  const info = await lookupUserEmailAndName(userId);
  if (!info) return;

  const from = process.env.RESEND_FROM_EMAIL || "NANOTOON <noreply@nanotoon.io>";

  let subject: string;
  let html: string;
  if (kind === "ban") {
    subject = "Your NANOTOON account has been suspended";
    const body = `
<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">We're writing to let you know that your NANOTOON account has been suspended following a review by our moderation team. This means you won't be able to sign in, post new series or chapters, comment, or follow other creators while the suspension is active.</p>
<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">Suspensions generally happen when activity on an account doesn't line up with our community guidelines — for example, uploaded work that violates our content rules, harassment of other creators, spam, or misuse of the platform. We know this isn't a fun email to receive, and we don't take these actions lightly.</p>
<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">If you believe this was a mistake, or you'd like to appeal the decision, please reply to this email or reach out to us at <a href="mailto:nanotooncontact@gmail.com" style="color:#c084fc;text-decoration:none;">nanotooncontact@gmail.com</a>. Include your username so we can look into your case.</p>
<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;">You can review our community guidelines any time at <a href="https://nanotoon.io/terms" style="color:#c084fc;text-decoration:none;">nanotoon.io/terms</a>.</p>
<div style="text-align:center;margin-bottom:28px;"><a href="mailto:nanotooncontact@gmail.com" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;">Appeal this decision</a></div>`;
    html = renderEmail({
      accent: "linear-gradient(135deg,#dc2626,#b91c1c)",
      heading: "Account Suspended",
      greetingName: info.displayName,
      bodyHtml: body,
    });
  } else {
    subject = "Your NANOTOON account has been reinstated 🎉";
    const body = `
<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">Good news — your NANOTOON account has been reinstated. You can sign in again and resume posting, commenting, following other creators, and everything else you had access to before.</p>
<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">Thanks for your patience while we reviewed your case. To help avoid any future issues, please take a moment to review our community guidelines at <a href="https://nanotoon.io/terms" style="color:#c084fc;text-decoration:none;">nanotoon.io/terms</a> — they cover what kinds of AI comic, manga, and webtoon content are welcome on the platform and how we expect creators to treat each other.</p>
<p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;">If you have any questions or something still doesn't feel right, just reply to this email or reach us at <a href="mailto:nanotooncontact@gmail.com" style="color:#c084fc;text-decoration:none;">nanotooncontact@gmail.com</a>.</p>
<div style="text-align:center;margin-bottom:28px;"><a href="https://nanotoon.io" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#c026d3);color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;">Back to NANOTOON →</a></div>`;
    html = renderEmail({
      accent: "linear-gradient(135deg,#7c3aed,#c026d3)",
      heading: "Welcome Back!",
      greetingName: info.displayName,
      bodyHtml: body,
    });
  }

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: info.email, subject, html }),
    });
  } catch { /* moderation action already succeeded — don't surface send errors */ }
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

    // Note: no ban notification is inserted. The banned user is informed via
    // the sign-in screen itself — AuthContext force-logs-them-out on their
    // next session read, and /auth/signin displays the suspension message
    // the next time they try to sign in. This is cleaner than a notification
    // they would never see anyway (because they can't stay signed in).

    // Email the user letting them know they've been suspended. Awaited so
    // the Workers runtime doesn't kill the Resend fetch on the redirect
    // (same gotcha we hit with the welcome email). Best-effort: errors
    // inside sendModerationEmail are swallowed so a Resend outage never
    // rolls back the ban that already succeeded above.
    await sendModerationEmail("ban", userId);

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

    // Email the user letting them know they're reinstated. Same await +
    // best-effort pattern as the ban branch above.
    await sendModerationEmail("unban", userId);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
