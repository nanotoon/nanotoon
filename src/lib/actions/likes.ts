"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ═══════════════════════════════════════════════════════════════
//  LIKES (for series)
// ═══════════════════════════════════════════════════════════════

export async function toggleLike(seriesId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in", liked: false };

  // Check if already liked
  const { data: existing } = await supabase
    .from("likes")
    .select("*")
    .eq("user_id", user.id)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (existing) {
    // Unlike
    await supabase
      .from("likes")
      .delete()
      .eq("user_id", user.id)
      .eq("series_id", seriesId);

    // Decrement count on series
    const { data: series } = await supabase
      .from("series")
      .select("total_likes")
      .eq("id", seriesId)
      .single();

    if (series) {
      await supabase
        .from("series")
        .update({ total_likes: Math.max(0, (series.total_likes ?? 1) - 1) })
        .eq("id", seriesId);
    }

    return { error: null, liked: false };
  } else {
    // Like
    await supabase
      .from("likes")
      .insert({ user_id: user.id, series_id: seriesId });

    // Increment count on series
    const { data: series } = await supabase
      .from("series")
      .select("total_likes, author_id, title")
      .eq("id", seriesId)
      .single();

    if (series) {
      await supabase
        .from("series")
        .update({ total_likes: (series.total_likes ?? 0) + 1 })
        .eq("id", seriesId);

      // Notify the author
      if (series.author_id !== user.id) {
        await supabase.from("notifications").insert({
          user_id: series.author_id,
          actor_id: user.id,
          type: "like",
          message: `liked "${series.title}"`,
          series_id: seriesId,
        });
      }
    }

    return { error: null, liked: true };
  }
}

export async function checkLiked(seriesId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("likes")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("series_id", seriesId)
    .maybeSingle();

  return !!data;
}

// ═══════════════════════════════════════════════════════════════
//  FAVORITES (for series)
// ═══════════════════════════════════════════════════════════════

export async function toggleFavorite(seriesId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in", favorited: false };

  // Check if already favorited
  const { data: existing } = await supabase
    .from("favorites")
    .select("*")
    .eq("user_id", user.id)
    .eq("series_id", seriesId)
    .maybeSingle();

  if (existing) {
    // Remove favorite
    await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("series_id", seriesId);

    // Decrement count
    const { data: series } = await supabase
      .from("series")
      .select("total_favorites")
      .eq("id", seriesId)
      .single();

    if (series) {
      await supabase
        .from("series")
        .update({
          total_favorites: Math.max(0, (series.total_favorites ?? 1) - 1),
        })
        .eq("id", seriesId);
    }

    revalidatePath("/favorites");
    return { error: null, favorited: false };
  } else {
    // Add favorite
    await supabase
      .from("favorites")
      .insert({ user_id: user.id, series_id: seriesId });

    // Increment count
    const { data: series } = await supabase
      .from("series")
      .select("total_favorites")
      .eq("id", seriesId)
      .single();

    if (series) {
      await supabase
        .from("series")
        .update({ total_favorites: (series.total_favorites ?? 0) + 1 })
        .eq("id", seriesId);
    }

    revalidatePath("/favorites");
    return { error: null, favorited: true };
  }
}

export async function checkFavorited(seriesId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("favorites")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("series_id", seriesId)
    .maybeSingle();

  return !!data;
}

export async function getFavorites() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: [], error: "Not logged in" };

  const { data, error } = await supabase
    .from("favorites")
    .select("*, series(*, profiles(display_name, handle, avatar_url))")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}
