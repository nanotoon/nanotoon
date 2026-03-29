"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Use this hook in client components when you need direct
 * access to the Supabase client (e.g., for realtime subscriptions).
 *
 * For most data operations, prefer the server actions in @/lib/actions instead.
 */
export function useSupabase() {
  const supabase = useMemo(() => createClient(), []);
  return supabase;
}
