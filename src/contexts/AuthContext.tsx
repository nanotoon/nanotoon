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
  // Safety valve: ensure loading never stays true forever
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadingTimer = () => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  };

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data }: any = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    // Safety net: if loading is still true after 6 seconds, force it false.
    // This prevents the forever-loading spinner caused by slow/failed Supabase calls.
    loadingTimerRef.current = setTimeout(() => {
      setLoading(false);
    }, 6000);

    const getSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        setUser(u);
        if (u) await fetchProfile(u.id);
      } catch {
        // getSession failed — just treat as logged out
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
        await fetchProfile(u.id);
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

  const signOut = async () => {
    // Optimistically clear state first so UI updates immediately
    setUser(null);
    setProfile(null);
    // Then call Supabase signOut with a timeout so it never hangs forever
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
    } catch {
      // Even if signOut times out, the UI state is already cleared — user is effectively logged out
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
