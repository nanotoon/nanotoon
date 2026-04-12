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

function getEmailFromJwt(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email || null;
  } catch { return null; }
}

async function sendViolationEmail(email: string, contentType: string, contentTitle: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "NANOTOON <noreply@nanotoon.io>",
        to: email,
        subject: `${contentType} removed: Potential policy violation`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:520px;margin:40px auto;background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;"><div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:32px;text-align:center;"><div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;"><span style="color:white;font-size:28px;font-weight:900;">⚠</span></div><h1 style="color:white;font-size:22px;font-weight:700;margin:0;">${contentType} Removed</h1></div><div style="padding:32px;"><p style="color:#e4e4e7;font-size:16px;margin:0 0 16px;">Your ${contentType.toLowerCase()} <strong>"${contentTitle}"</strong> has been removed from NANOTOON.</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;"><strong>Reason:</strong> Potential policy violation.</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">Our team has reviewed this content and determined it may violate our community guidelines or terms of service.</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;">If you believe this was a mistake, please contact us at <a href="mailto:nanotooncontact@gmail.com" style="color:#c084fc;">nanotooncontact@gmail.com</a>.</p><hr style="border:none;border-top:1px solid #27272a;margin:0 0 20px;"><p style="color:#52525b;font-size:12px;margin:0;text-align:center;">© 2025 NANOTOON. All rights reserved.</p></div></div></body></html>`,
      }),
    });
    return res.ok;
  } catch { return false; }
}

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token || getEmailFromJwt(token) !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { action, contentType, contentId, contentTitle, authorId } = await request.json();
  if (!contentType || !contentId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const table = contentType === "Series" ? "series" : "gallery";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    serviceKey
      ? { auth: { persistSession: false, autoRefreshToken: false } }
      : { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
  );

  // === RESTORE ===
  if (action === "restore") {
    const { error } = await supabase.from(table).update({ is_removed: false, removed_at: null }).eq("id", contentId);
    if (error) return NextResponse.json({ error: "Restore failed: " + error.message }, { status: 500 });
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

  // Send violation email directly (no self-fetch)
  let emailSent = false;
  if (authorId && serviceKey) {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(authorId);
      if (user?.email) {
        emailSent = await sendViolationEmail(user.email, contentType, contentTitle || "Untitled");
      }
    } catch {}
  }

  return NextResponse.json({ ok: true, emailSent });
}
