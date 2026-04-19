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

  // Verify user owns this series
  const { data: series } = await supabase
    .from("series")
    .select("author_id")
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

  // Update series updated_at
  await supabase
    .from("series")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", seriesId);

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

  // FIX (views): capture the chapter's series_id + view count before deleting,
  // so we can subtract its views from series.total_views. Otherwise the deleted
  // chapter's views keep inflating the series total wherever total_views is
  // displayed (home/read, browse, category, favorites, following, profile,
  // /user/<handle>, series float menu).
  const { data: chRow } = await supabase
    .from("chapters")
    .select("series_id, views")
    .eq("id", chapterId)
    .maybeSingle();

  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", chapterId);

  if (error) return { error: error.message };

  // Rebalance series.total_views (best-effort, mirrors /api/views semantics).
  if (chRow && (chRow as any).series_id) {
    const deletedViews = Math.max(0, (chRow as any).views ?? 0);
    if (deletedViews > 0) {
      const { data: sRow } = await supabase
        .from("series")
        .select("total_views")
        .eq("id", (chRow as any).series_id)
        .maybeSingle();
      const current = (sRow as any)?.total_views ?? 0;
      const next = Math.max(0, current - deletedViews);
      await supabase
        .from("series")
        .update({ total_views: next })
        .eq("id", (chRow as any).series_id);
    }
  }

  revalidatePath(`/series/${seriesSlug}`);
  return { error: null };
}
