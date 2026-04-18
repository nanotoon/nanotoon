import { NextRequest, NextResponse } from "next/server";

// @ts-ignore — binding provided by wrangler at runtime
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

function getUserIdFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.sub) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000) - 60) return null;
    return payload.sub;
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  const token = getTokenFromCookies(request);
  const uid = token ? getUserIdFromJwt(token) : null;
  if (!token || !uid) {
    return NextResponse.json({ error: "Not authenticated — please refresh the page and try again" }, { status: 401 });
  }

  let formData: FormData;
  try { formData = await request.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const filePath = formData.get("path") as string | null;
  if (!file || !filePath) return NextResponse.json({ error: "Missing file or path" }, { status: 400 });
  if (file.size > 150 * 1024 * 1024) return NextResponse.json({ error: "File exceeds 150 MB" }, { status: 400 });

  // ── Path validation ────────────────────────────────────────────────
  // Without this, any authenticated user could upload to any path and
  // overwrite e.g. another user's avatar or a series thumbnail. We enforce:
  //   - no path traversal ("..", leading "/", backslashes, null bytes)
  //   - path must live under a folder the user owns. The three legitimate
  //     shapes in this app are:
  //        avatars/<user_id>.<ext>                          (profile picture)
  //        thumbnails/<user_id>/<timestamp>.<ext>           (series thumbnail)
  //        chapters/<series_id>/<chapter_num>/<page>.<ext>  (chapter pages)
  //     avatars/ and thumbnails/ are pinned to the caller's uid directly.
  //     chapters/ needs a Supabase lookup to verify the caller owns (or is
  //     admin over) the series_id in question.
  // ────────────────────────────────────────────────────────────────────
  if (filePath.includes("..") || filePath.startsWith("/") || filePath.includes("\\") || filePath.includes("\0")) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }

  const avatarMatch = filePath.match(/^avatars\/([^/]+)\.[a-zA-Z0-9]+$/);
  const thumbMatch = filePath.match(/^thumbnails\/([^/]+)\/[^/]+\.[a-zA-Z0-9]+$/);
  const chapterMatch = filePath.match(/^chapters\/([0-9a-fA-F-]{36})\/[^/]+\/[^/]+\.[a-zA-Z0-9]+$/);

  if (avatarMatch) {
    if (avatarMatch[1] !== uid) {
      return NextResponse.json({ error: "You can only upload to your own avatar path" }, { status: 403 });
    }
  } else if (thumbMatch) {
    if (thumbMatch[1] !== uid) {
      return NextResponse.json({ error: "You can only upload thumbnails under your own folder" }, { status: 403 });
    }
  } else if (chapterMatch) {
    const seriesId = chapterMatch[1];
    // Confirm the caller owns this series (or is admin). We call Supabase
    // with the caller's JWT so RLS is applied — the series row only comes
    // back if the caller is allowed to see it.
    try {
      const checkRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/series?id=eq.${seriesId}&select=author_id`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const rows: any[] = await checkRes.json();
      const authorId = rows?.[0]?.author_id;
      const ADMIN_EMAIL = "nanotooncontact@gmail.com";
      let callerEmail: string | null = null;
      try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        callerEmail = payload.email ?? null;
      } catch { /* ignore */ }
      if (!authorId) {
        return NextResponse.json({ error: "Series not found" }, { status: 404 });
      }
      if (authorId !== uid && callerEmail !== ADMIN_EMAIL) {
        return NextResponse.json({ error: "You do not own this series" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Unable to verify series ownership" }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: "Invalid upload path — expected avatars/<uid>.<ext>, thumbnails/<uid>/..., or chapters/<series_id>/..." }, { status: 400 });
  }

  try {
    const { env } = await getCloudflareContext();
    const bucket = (env as any).R2_BUCKET;
    if (!bucket) return NextResponse.json({ error: "R2 bucket binding not found — check wrangler.toml" }, { status: 500 });
    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(filePath, arrayBuffer, { httpMetadata: { contentType: file.type } });
    return NextResponse.json({ url: `${R2_PUBLIC_URL}/${filePath}` });
  } catch (e: any) {
    console.error("R2 upload error:", e);
    return NextResponse.json({ error: e?.message || "R2 upload failed" }, { status: 500 });
  }
}
