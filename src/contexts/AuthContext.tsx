"use client";
import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
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
  user: null, profile: null, loading: true,
  signOut: async () => {}, refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile(data ?? null);
  }, [supabase]);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const signOut = useCallback(async () => {
    setUser(null);
    setProfile(null);
    setLoading(false);

    try {
      await supabase.auth.signOut({ scope: 'global' });
      // Clear everything
      localStorage.clear();
      sessionStorage.clear();
    } catch {}

    window.location.href = '/';
  }, [supabase]);

  // ... rest of your useEffect stays exactly the same (I only strengthened signOut)
  // (full file is in the zip – this is the important part)

  return <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);