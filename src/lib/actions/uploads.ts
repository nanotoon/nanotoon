"use server";

import { createClient } from "@/lib/supabase/server";
// @ts-ignore — binding provided by wrangler at runtime
import { getCloudflareContext } from "@opennextjs/cloudflare";

const R2_PUBLIC_URL = "https://pub-6d31092e1f8446afba2712c91fc6ff8d.r2.dev";

async function uploadToR2(file: File, filePath: string): Promise<string> {
  const { env } = await getCloudflareContext();
  const bucket = (env as any).R2_BUCKET;

  if (!bucket) throw new Error("R2 bucket not available — check wrangler.toml R2 binding");

  const arrayBuffer = await file.arrayBuffer();
  await bucket.put(filePath, arrayBuffer, {
    httpMetadata: { contentType: file.type },
  });

  return `${R2_PUBLIC_URL}/${filePath}`;
}

// ─── Upload Series Thumbnail ────────────────────────────────────
export async function uploadThumbnail(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { url: null, error: "Not logged in" };

  const file = formData.get("thumbnail") as File;
  if (!file) return { url: null, error: "No file provided" };

  const ext = file.name.split(".").pop();
  const filePath = `thumbnails/${user.id}/${Date.now()}.${ext}`;

  try {
    const url = await uploadToR2(file, filePath);
    return { url, error: null };
  } catch (e: any) {
    return { url: null, error: e.message };
  }
}

// ─── Upload Chapter Pages (multiple images) ─────────────────────
export async function uploadChapterPages(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { urls: [], error: "Not logged in" };

  const seriesId = formData.get("series_id") as string;
  const chapterNumber = formData.get("chapter_number") as string;
  const files = formData.getAll("pages") as File[];

  if (!files.length) return { urls: [], error: "No files provided" };

  const uploadedUrls: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = file.name.split(".").pop();
    const filePath = `chapters/${seriesId}/${chapterNumber}/${String(i + 1).padStart(3, "0")}.${ext}`;

    try {
      const url = await uploadToR2(file, filePath);
      uploadedUrls.push(url);
    } catch (e: any) {
      return { urls: uploadedUrls, error: `Failed on page ${i + 1}: ${e.message}` };
    }
  }

  return { urls: uploadedUrls, error: null };
}
