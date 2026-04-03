"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type SeriesRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  format: string;
  genres: string[] | null;
  thumbnail_url: string | null;
  author_id: string;
  total_views: number | null;
  total_likes: number | null;
  total_favorites: number | null;
  created_at: string | null;
  updated_at: string | null;
  profiles: { display_name: string; handle: string; avatar_url: string | null };
  latest_chapter?: number;
};

export function useSeries({
  genre,
  format,
  search,
  orderBy = "created_at",
  limit = 50,
}: {
  genre?: string;
  format?: string;
  search?: string;
  orderBy?: "created_at" | "total_views" | "total_likes";
  limit?: number;
} = {}) {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetch = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("series")
      .select("*, profiles!series_author_id_fkey(display_name, handle, avatar_url)")
      .order(orderBy, { ascending: false })
      .limit(limit);

    if (genre) query = query.contains("genres", [genre]);
    if (format && format !== "All") query = query.eq("format", format);
    if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

    const { data } = await query;
    setSeries((data as SeriesRow[]) ?? []);
    setLoading(false);
  }, [genre, format, search, orderBy, limit, supabase]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { series, loading, refetch: fetch };
}
