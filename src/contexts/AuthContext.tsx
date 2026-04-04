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
  const initDone = useRef(false);

  const fetchProfile = useCallback(async (uid: string) => {
    try {
      // Add a 5-second timeout so profile fetch never hangs
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle().abortSignal(controller.signal);
      clearTimeout(timeout);
      setProfile((data as Profile) ?? null);
    } catch (err) {
      console.warn("Profile fetch failed:", err);
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => { if (user) await fetchProfile(user.id); }, [user, fetchProfile]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // Hard timeout — NEVER let loading stay true longer than 4 seconds
    const hardTimeout = setTimeout(() => {
      console.warn("Auth hard timeout hit — forcing loading=false");
      setLoading(false);
    }, 4000);

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        setUser(u);
        if (u) await fetchProfile(u.id);
      } catch (err) {
        console.warn("Auth init failed:", err);
        setUser(null);
        setProfile(null);
      } finally {
        clearTimeout(hardTimeout);
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e: any, session: any) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        // Don't let auth state change hang — timeout after 3 seconds
        const timeout = setTimeout(() => setLoading(false), 3000);
        await fetchProfile(u.id);
        clearTimeout(timeout);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => { clearTimeout(hardTimeout); subscription.unsubscribe(); };
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
    // Immediately clear state
    setUser(null);
    setProfile(null);
    setLoading(false);

    // Sign out from Supabase
    try { await supabase.auth.signOut(); } catch {}

    // Clear all Supabase localStorage entries
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('supabase'))) localStorage.removeItem(k);
      }
    } catch {}

    // Clear all Supabase cookies
    try {
      document.cookie.split(';').forEach(c => {
        const n = c.split('=')[0].trim();
        if (n.startsWith('sb-')) {
          // Clear with multiple path/domain combos to be thorough
          document.cookie = n + '=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;';
          document.cookie = n + '=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;domain=' + window.location.hostname + ';';
          document.cookie = n + '=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;domain=.' + window.location.hostname + ';';
        }
      });
    } catch {}

    // Hard reload to fully clear everything
    window.location.replace('/');
  }, [supabase]);

  return <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
