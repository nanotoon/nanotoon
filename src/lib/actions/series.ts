"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// ─── Get All Series (browse page) ───────────────────────────────
export async function getSeries({
  genre,
  format,
  search,
  limit = 20,
  offset = 0,
}: {
  genre?: string;
  format?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from("series")
    .select("*, profiles!series_author_id_fkey(display_name, handle, avatar_url)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (genre) {
    query = query.contains("genres", [genre]);
  }
  if (format) {
    query = query.eq("format", format);
  }
  if (search) {
    query = query.textSearch("fts", search);
  }

  const { data, error, count } = await query;

  if (error) return { data: [], error: error.message, count: 0 };
  return { data: data ?? [], error: null, count };
}

// ─── Get Single Series by Slug ──────────────────────────────────
export async function getSeriesBySlug(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("series")
    .select("*, profiles!series_author_id_fkey(display_name, handle, avatar_url)")
    .eq("slug", slug)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ─── Create New Series ──────────────────────────────────────────
export async function createSeries(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const format = formData.get("format") as string;
  const genresRaw = formData.get("genres") as string;
  const genres = genresRaw ? genresRaw.split(",").map((g) => g.trim()) : [];
  const thumbnailUrl = formData.get("thumbnail_url") as string;

  // Create a URL-friendly slug from the title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data, error } = await supabase
    .from("series")
    .insert({
      title,
      slug,
      description,
      format,
      genres,
      thumbnail_url: thumbnailUrl || null,
      author_id: user.id,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  revalidatePath("/browse");
  revalidatePath("/profile");
  return { data, error: null };
}

// ─── Update Series ──────────────────────────────────────────────
export async function updateSeries(seriesId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const format = formData.get("format") as string;
  const genresRaw = formData.get("genres") as string;
  const genres = genresRaw ? genresRaw.split(",").map((g) => g.trim()) : [];
  const thumbnailUrl = formData.get("thumbnail_url") as string;

  const { error } = await supabase
    .from("series")
    .update({
      title,
      description,
      format,
      genres,
      thumbnail_url: thumbnailUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", seriesId)
    .eq("author_id", user.id); // RLS backup: only author can update

  if (error) return { error: error.message };

  revalidatePath(`/series/${formData.get("slug") || ""}`);
  revalidatePath("/browse");
  return { error: null };
}

// ─── Delete Series ──────────────────────────────────────────────
export async function deleteSeries(seriesId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const { error } = await supabase
    .from("series")
    .delete()
    .eq("id", seriesId)
    .eq("author_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/browse");
  revalidatePath("/profile");
  return { error: null };
}

// ─── Get Series by Author ───────────────────────────────────────
export async function getSeriesByAuthor(authorId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("series")
    .select("*")
    .eq("author_id", authorId)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}
