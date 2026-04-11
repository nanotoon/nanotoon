import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "nanotooncontact@gmail.com";
const R2_PUBLIC_URL = "https://pub-6d31092e1f8446afba2712c91fc6ff8d.r2.dev";

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
    const session = JSON.parse(raw);
    return session?.access_token || null;
  } catch { return null; }
}

function getEmailFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email || null;
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  // Verify caller is admin
  const token = getTokenFromCookies(request);
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const callerEmail = getEmailFromJwt(token);
  if (callerEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { contentType, contentId, contentTitle, authorId } = await request.json();
  if (!contentType || !contentId || !authorId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Look up owner email from auth.users
  let ownerEmail: string | null = null;
  try {
    const { data: { user: ownerUser } } = await supabase.auth.admin.getUserById(authorId);
    ownerEmail = ownerUser?.email || null;
  } catch { /* skip */ }

  // Delete the content (service role bypasses RLS)
  const table = contentType === "Series" ? "series" : "gallery";
  if (table === "series") {
    // Delete related data first (FK constraints)
    await supabase.from("chapters").delete().eq("series_id", contentId);
    await supabase.from("likes").delete().eq("series_id", contentId);
    await supabase.from("favorites").delete().eq("series_id", contentId);
    await supabase.from("comments").delete().eq("series_id", contentId);
  }
  const { error } = await supabase.from(table).delete().eq("id", contentId);
  if (error) {
    return NextResponse.json({ error: "Delete failed: " + error.message }, { status: 500 });
  }

  // Send violation email to owner
  if (ownerEmail) {
    try {
      await fetch(new URL("/api/send-violation", request.url).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ownerEmail,
          contentType: contentType,
          contentTitle: contentTitle || "Untitled",
        }),
      });
    } catch { /* email send failed — content still deleted */ }
  }

  return NextResponse.json({ ok: true, emailSent: !!ownerEmail });
}
