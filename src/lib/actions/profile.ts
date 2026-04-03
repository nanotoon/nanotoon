"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Get Current User Profile ───────────────────────────────────
export async function getMyProfile() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, error: "Not logged in" };

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ─── Get Any User Profile by Handle ─────────────────────────────
export async function getProfileByHandle(handle: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("handle", handle)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ─── Update Profile ─────────────────────────────────────────────
export async function updateProfile(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const displayName = formData.get("display_name") as string;
  const handle = formData.get("handle") as string;
  const bio = formData.get("bio") as string;
  const links = formData.get("links") as string;
  const avatarUrl = formData.get("avatar_url") as string;

  const updates: Record<string, string | null> = {};
  if (displayName) updates.display_name = displayName;
  if (handle) updates.handle = handle;
  if (bio !== undefined) updates.bio = bio || null;
  if (links !== undefined) updates.links = links || null;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl || null;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profile");
  revalidatePath("/settings");
  return { error: null };
}

// ─── Upload Avatar ──────────────────────────────────────────────
export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { url: null, error: "Not logged in" };

  const file = formData.get("avatar") as File;
  if (!file) return { url: null, error: "No file provided" };

  const ext = file.name.split(".").pop();
  const filePath = `avatars/${user.id}.${ext}`;

  try {
    // @ts-ignore — binding provided by wrangler at runtime
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext();
    const bucket = (env as any).R2_BUCKET;

    if (!bucket) return { url: null, error: "R2 bucket not available" };

    const arrayBuffer = await file.arrayBuffer();
    await bucket.put(filePath, arrayBuffer, {
      httpMetadata: { contentType: file.type },
    });

    const publicUrl = `https://pub-6d31092e1f8446afba2712c91fc6ff8d.r2.dev/${filePath}`;

    // Update the profile with the new avatar URL
    await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);

    revalidatePath("/profile");
    revalidatePath("/settings");
    return { url: publicUrl, error: null };
  } catch (e: any) {
    return { url: null, error: e.message };
  }
}
