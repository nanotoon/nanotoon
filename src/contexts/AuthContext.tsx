"use client";
import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/types";

type AuthState = { user: User | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void>; refreshProfile: () => Promise<void> };
const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, signOut: async () => {}, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfile = useCallback(async (uid: string) => {
    try {
      // Race the profile fetch against a 5s timeout so auth never hangs
      const result = await Promise.race([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
      ]);
      if (result && typeof result === 'object' && 'data' in result) {
        setProfile((result.data as Profile) ?? null);
      }
    } catch {
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => { if (user) await fetchProfile(user.id); }, [user, fetchProfile]);

  useEffect(() => {
    // Hard fallback: never stay loading longer than 4s
    timerRef.current = setTimeout(() => setLoading(false), 4000);
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        setUser(u);
        if (u) await fetchProfile(u.id);
      } catch {
        setUser(null); setProfile(null);
      } finally {
        if (timerRef.current) clearTimeout(timerRef.current);
        setLoading(false);
      }
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e: any, session: any) => {
      const u = session?.user ?? null; setUser(u);
      if (u) await fetchProfile(u.id); else setProfile(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      setLoading(false);
    });
    return () => { if (timerRef.current) clearTimeout(timerRef.current); subscription.unsubscribe(); };
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
    setUser(null); setProfile(null); setLoading(false);
    try { await fetch('/api/auth/signout', { method: 'POST' }); } catch {}
    window.location.replace('/');
  }, []);

  return <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
