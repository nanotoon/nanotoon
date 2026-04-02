"use client";

import {
  createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/types";

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null, profile: null, loading: true, signOut: async () => {}, refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadingTimer = () => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  };

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as Profile) ?? null);
    } catch {
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    // Fallback: stop loading after 2s max — never make users wait longer
    loadingTimerRef.current = setTimeout(() => {
      setLoading(false);
    }, 2000);

    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        setUser(u);
        // Fetch profile in background — don't block auth loading on it
        if (u) fetchProfile(u.id).catch(() => {});
      } catch {
        // treat as logged out
      } finally {
        clearLoadingTimer();
        setLoading(false);
      }
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event: any, session: any) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchProfile(u.id).catch(() => {});
      } else {
        setProfile(null);
      }
      clearLoadingTimer();
      setLoading(false);
    });

    return () => {
      clearLoadingTimer();
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
    // Immediately clear all client-side state
    setUser(null);
    setProfile(null);
    setLoading(false);

    try {
      // Call server-side route to clear HttpOnly SSR cookies
      await fetch('/api/signout', { method: 'POST' });
    } catch { /* ignore */ }

    // Also call client-side signout to clear client tokens
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch { /* ignore */ }

    // Clear all Supabase-related localStorage entries
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch { /* ignore */ }

    // Hard redirect — fully reloads page so no stale session state
    window.location.href = '/';
  }, [supabase]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
