"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Get Chapters for a Series ──────────────────────────────────
export async function getChapters(seriesId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("series_id", seriesId)
    .order("chapter_number", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

// ─── Get Single Chapter ─────────────────────────────────────────
export async function getChapter(chapterId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .eq("id", chapterId)
    .single();

  if (error) return { data: null, error: error.message };

  // Increment view count
  await supabase
    .from("chapters")
    .update({ views: (data.views ?? 0) + 1 })
    .eq("id", chapterId);

  return { data, error: null };
}

// ─── Create Chapter ─────────────────────────────────────────────
export async function createChapter(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const seriesId = formData.get("series_id") as string;
  const title = formData.get("title") as string;
  const chapterNumber = parseInt(formData.get("chapter_number") as string, 10);
  const rating = formData.get("rating") as string;
  const pageUrlsRaw = formData.get("page_urls") as string;
  const pageUrls = pageUrlsRaw
    ? pageUrlsRaw.split(",").map((u) => u.trim())
    : [];

  // Verify user owns this series AND fetch current high-water mark so we
  // know whether this chapter should bump the Latest-Updates rank.
  const { data: series } = await supabase
    .from("series")
    .select("author_id, max_chapter_added")
    .eq("id", seriesId)
    .single();

  if (!series || series.author_id !== user.id) {
    return { error: "Not authorized" };
  }

  const { data, error } = await supabase
    .from("chapters")
    .insert({
      series_id: seriesId,
      chapter_number: chapterNumber,
      title,
      rating,
      page_urls: pageUrls,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // FIX (ranking anti-abuse): only bump updated_at (and the high-water mark)
  // when the new chapter's number is strictly greater than any
  // chapter_number this series has ever had. Re-uploading a previously-
  // deleted chapter number (same or lower than max_chapter_added) must NOT
  // pop the series back to the top of Latest Updates. See
  // lib/supabase/ranking-schema.sql for the full rule.
  const prevMax = series.max_chapter_added ?? 0;
  if (chapterNumber > prevMax) {
    await supabase
      .from("series")
      .update({
        updated_at: new Date().toISOString(),
        max_chapter_added: chapterNumber,
      })
      .eq("id", seriesId);
  }

  revalidatePath(`/series`);
  return { data, error: null };
}

// ─── Delete Chapter ─────────────────────────────────────────────
export async function deleteChapter(chapterId: string, seriesSlug: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", chapterId);

  if (error) return { error: error.message };

  revalidatePath(`/series/${seriesSlug}`);
  return { error: null };
}
