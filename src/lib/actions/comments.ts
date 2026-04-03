"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Get Comments for a Series or Chapter ───────────────────────
export async function getComments({
  seriesId,
  chapterId,
}: {
  seriesId?: string;
  chapterId?: string;
}) {
  const supabase = await createClient();

  let query = supabase
    .from("comments")
    .select("*, profiles(display_name, handle, avatar_url)")
    .order("created_at", { ascending: false });

  if (seriesId) query = query.eq("series_id", seriesId);
  if (chapterId) query = query.eq("chapter_id", chapterId);

  const { data, error } = await query;

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

// ─── Post a Comment ─────────────────────────────────────────────
export async function postComment(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const body = formData.get("body") as string;
  const seriesId = formData.get("series_id") as string | null;
  const chapterId = formData.get("chapter_id") as string | null;

  if (!body?.trim()) return { error: "Comment cannot be empty" };

  const { data, error } = await supabase
    .from("comments")
    .insert({
      user_id: user.id,
      body: body.trim(),
      series_id: seriesId || null,
      chapter_id: chapterId || null,
    })
    .select("*, profiles(display_name, handle, avatar_url)")
    .single();

  if (error) return { data: null, error: error.message };

  // Send notification to series author (if commenting on a series)
  if (seriesId) {
    const { data: series } = await supabase
      .from("series")
      .select("author_id, title")
      .eq("id", seriesId)
      .single();

    if (series && series.author_id !== user.id) {
      await supabase.from("notifications").insert({
        user_id: series.author_id,
        actor_id: user.id,
        type: "comment",
        message: `commented on "${series.title}"`,
        series_id: seriesId,
        comment_id: data.id,
      });
    }
  }

  if (seriesId) revalidatePath(`/series`);
  return { data, error: null };
}

// ─── Delete a Comment ───────────────────────────────────────────
export async function deleteComment(commentId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", user.id); // Only delete own comments

  if (error) return { error: error.message };
  return { error: null };
}

// ─── Like / Unlike a Comment ────────────────────────────────────
export async function toggleCommentLike(commentId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in", liked: false };

  // Check if already liked
  const { data: existing } = await supabase
    .from("comment_likes")
    .select("*")
    .eq("user_id", user.id)
    .eq("comment_id", commentId)
    .maybeSingle();

  if (existing) {
    // Unlike
    await supabase
      .from("comment_likes")
      .delete()
      .eq("user_id", user.id)
      .eq("comment_id", commentId);

    // Decrease count
    await supabase.rpc("decrement_comment_likes", { cid: commentId });

    return { error: null, liked: false };
  } else {
    // Like
    await supabase
      .from("comment_likes")
      .insert({ user_id: user.id, comment_id: commentId });

    // Increase count
    await supabase.rpc("increment_comment_likes", { cid: commentId });

    return { error: null, liked: true };
  }
}

// ─── Check if User Liked Comments ───────────────────────────────
export async function getUserCommentLikes(commentIds: string[]) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { likedIds: [] };

  const { data } = await supabase
    .from("comment_likes")
    .select("comment_id")
    .eq("user_id", user.id)
    .in("comment_id", commentIds);

  return { likedIds: data?.map((d) => d.comment_id) ?? [] };
}
