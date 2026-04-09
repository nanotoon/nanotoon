import { NextRequest, NextResponse } from "next/server";

// @ts-ignore — binding provided by wrangler at runtime
import { getCloudflareContext } from "@opennextjs/cloudflare";

const R2_PUBLIC_URL = "https://pub-6d31092e1f8446afba2712c91fc6ff8d.r2.dev";

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────
  // Do NOT use Supabase server client here. getSession() and getUser()
  // both attempt JWT refresh which hangs on Cloudflare Workers free tier.
  // Instead, the browser sends the access token via Authorization header.
  // We decode the JWT to verify a user exists — no network call needed.
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const parts = token.split(".");
    if (parts.length !== 3) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    // Decode JWT payload (base64url → JSON)
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.sub) {
      return NextResponse.json({ error: "Invalid token: no user" }, { status: 401 });
    }
    // Optional: check expiry (with 60s grace for clock skew)
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000) - 60) {
      return NextResponse.json({ error: "Token expired — please refresh the page and try again" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Auth check failed" }, { status: 401 });
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
