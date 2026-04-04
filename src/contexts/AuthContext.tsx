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
      const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
      setProfile((data as Profile) ?? null);
    } catch (err) {
      console.warn("Profile fetch failed:", err);
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const doSignOut = useCallback(async () => {
    setUser(null);
    setProfile(null);
    setLoading(false);
    try { await supabase.auth.signOut(); } catch {}
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('supabase'))) localStorage.removeItem(k);
      }
    } catch {}
    window.location.replace('/');
  }, [supabase]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (err) {
        console.warn("Auth init failed:", err);
        setUser(null);
        setProfile(null);
      } finally {
        // Only init() controls the initial loading gate — no race with the listener
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION is already handled by init() — skip it to avoid the race condition
      // where both paths call setLoading(false) at different times
      if (event === 'INITIAL_SESSION') return;

      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        try { await fetchProfile(u.id); } catch {}
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut: doSignOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
