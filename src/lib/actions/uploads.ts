"use server";

import { createClient } from "@/lib/supabase/server";

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

  const { error: uploadError } = await supabase.storage
    .from("series-assets")
    .upload(filePath, file, { upsert: true });

  if (uploadError) return { url: null, error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("series-assets").getPublicUrl(filePath);

  return { url: publicUrl, error: null };
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

    const { error: uploadError } = await supabase.storage
      .from("series-assets")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      return { urls: uploadedUrls, error: `Failed on page ${i + 1}: ${uploadError.message}` };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("series-assets").getPublicUrl(filePath);

    uploadedUrls.push(publicUrl);
  }

  return { urls: uploadedUrls, error: null };
}
