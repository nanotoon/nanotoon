import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// @ts-ignore — binding provided by wrangler at runtime
import { getCloudflareContext } from "@opennextjs/cloudflare";

const R2_PUBLIC_URL = "https://pub-6d31092e1f8446afba2712c91fc6ff8d.r2.dev";

export async function POST(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() { /* read-only in route handler */ },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 5 MB" }, { status: 400 });
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
