import { NextRequest, NextResponse } from "next/server";

// @ts-ignore — binding provided by wrangler at runtime
import { getCloudflareContext } from "@opennextjs/cloudflare";

const R2_PUBLIC_URL = "https://pub-6d31092e1f8446afba2712c91fc6ff8d.r2.dev";

/**
 * Extract access token from Supabase auth cookies.
 * @supabase/ssr stores the session JSON in cookies named
 * `sb-{ref}-auth-token` (or chunked: `.0`, `.1`, …).
 * We reassemble and parse — zero Supabase client, zero network calls.
 */
function getTokenFromCookies(request: NextRequest): string | null {
  try {
    const all = request.cookies.getAll();
    const authCookies = all.filter(
      (c) => c.name.includes("-auth-token")
    );
    if (authCookies.length === 0) return null;

    // Derive base name (without chunk suffix)
    const baseName = authCookies[0].name.replace(/\.\d+$/, "");

    // Collect & sort chunks
    const chunks = all
      .filter((c) => c.name === baseName || c.name.startsWith(baseName + "."))
      .sort((a, b) => {
        const idx = (n: string) => {
          const m = n.match(/\.(\d+)$/);
          return m ? parseInt(m[1]) : -1;
        };
        return idx(a.name) - idx(b.name);
      });

    const raw = chunks.map((c) => c.value).join("");
    const session = JSON.parse(raw);
    return session?.access_token || null;
  } catch {
    return null;
  }
}

function getUserIdFromJwt(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    if (!payload.sub) return null;
    // Allow 60s grace for clock skew
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000) - 60) {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // ── Auth: read JWT from cookie or Authorization header ──────
  let token = request.headers.get("Authorization")?.replace("Bearer ", "") || null;
  if (!token) token = getTokenFromCookies(request);
  if (!token || !getUserIdFromJwt(token)) {
    return NextResponse.json(
      { error: "Not authenticated — please refresh the page and try again" },
      { status: 401 }
    );
  }

  // ── Parse form data ─────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const filePath = formData.get("path") as string | null;

  if (!file || !filePath) {
    return NextResponse.json({ error: "Missing file or path" }, { status: 400 });
  }

  if (file.size > 150 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 150 MB" }, { status: 400 });
  }

  // ── Upload to R2 ────────────────────────────────────────────
  try {
    const { env } = await getCloudflareContext();
    const bucket = (env as any).R2_BUCKET;

    if (!bucket) {
      return NextResponse.json(
        { error: "R2 bucket binding not found — check wrangler.toml" },
        { status: 500 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(filePath, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    return NextResponse.json({ url: `${R2_PUBLIC_URL}/${filePath}` });
  } catch (e: any) {
    console.error("R2 upload error:", e);
    return NextResponse.json(
      { error: e?.message || "R2 upload failed" },
      { status: 500 }
    );
  }
}
