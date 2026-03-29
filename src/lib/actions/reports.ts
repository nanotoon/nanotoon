"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitReport(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not logged in" };

  const reason = formData.get("reason") as string;
  const note = formData.get("note") as string;
  const seriesId = formData.get("series_id") as string | null;
  const chapterId = formData.get("chapter_id") as string | null;
  const commentId = formData.get("comment_id") as string | null;

  if (!reason) return { error: "Reason is required" };

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    reason,
    note: note || null,
    series_id: seriesId || null,
    chapter_id: chapterId || null,
    comment_id: commentId || null,
    status: "pending",
  });

  if (error) return { error: error.message };
  return { error: null, success: true };
}
