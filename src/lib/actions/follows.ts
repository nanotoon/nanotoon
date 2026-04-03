"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Toggle Follow ──────────────────────────────────────────────
export async function toggleFollow(targetUserId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in", following: false };
  if (user.id === targetUserId) return { error: "Cannot follow yourself", following: false };

  // Check if already following
  const { data: existing } = await supabase
    .from("follows")
    .select("*")
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId)
    .maybeSingle();

  if (existing) {
    // Unfollow
    await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId);

    revalidatePath("/following");
    revalidatePath("/followers");
    return { error: null, following: false };
  } else {
    // Follow
    await supabase
      .from("follows")
      .insert({ follower_id: user.id, following_id: targetUserId });

    // Notify the target user
    await supabase.from("notifications").insert({
      user_id: targetUserId,
      actor_id: user.id,
      type: "follow",
      message: "started following you",
    });

    revalidatePath("/following");
    revalidatePath("/followers");
    return { error: null, following: true };
  }
}

// ─── Check if Following ─────────────────────────────────────────
export async function checkFollowing(targetUserId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", targetUserId)
    .maybeSingle();

  return !!data;
}

// ─── Get Followers ──────────────────────────────────────────────
export async function getFollowers(userId?: string) {
  const supabase = await createClient();

  let targetId = userId;
  if (!targetId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not logged in" };
    targetId = user.id;
  }

  const { data, error } = await supabase
    .from("follows")
    .select("*, profiles!follows_follower_id_fkey(id, display_name, handle, avatar_url)")
    .eq("following_id", targetId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

// ─── Get Following ──────────────────────────────────────────────
export async function getFollowing(userId?: string) {
  const supabase = await createClient();

  let targetId = userId;
  if (!targetId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { data: [], error: "Not logged in" };
    targetId = user.id;
  }

  const { data, error } = await supabase
    .from("follows")
    .select("*, profiles!follows_following_id_fkey(id, display_name, handle, avatar_url)")
    .eq("follower_id", targetId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

// ─── Get Follow Counts ──────────────────────────────────────────
export async function getFollowCounts(userId: string) {
  const supabase = await createClient();

  const [followers, following] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", userId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", userId),
  ]);

  return {
    followers: followers.count ?? 0,
    following: following.count ?? 0,
  };
}
