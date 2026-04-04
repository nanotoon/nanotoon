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

  const refreshProfile = useCallback(async () => { if (user) await fetchProfile(user.id); }, [user, fetchProfile]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // Safety ceiling: loading never stays true forever
    const hardTimeout = setTimeout(() => {
      console.warn("Auth hard timeout — forcing loading=false");
      setLoading(false);
    }, 8000);

    const init = async () => {
      try {
        // Get the current session from cookies
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn("getSession error:", sessionError.message);
          setUser(null);
          setProfile(null);
          return;
        }

        if (!session) {
          setUser(null);
          setProfile(null);
          return;
        }

        // Check if token is expired or about to expire
        const exp = session.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);

        if (now >= exp - 60) {
          // Token expired or expiring within 60 seconds — refresh it
          console.log("Session token expired, refreshing...");
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError || !refreshData.session) {
            console.warn("Session refresh failed:", refreshError?.message);
            // Clear broken session so queries go through as anon
            await supabase.auth.signOut();
            setUser(null);
            setProfile(null);
            return;
          }

          setUser(refreshData.session.user);
          await fetchProfile(refreshData.session.user.id);
        } else {
          // Token is valid
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
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
        try { await fetchProfile(u.id); } catch {}
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => { clearTimeout(hardTimeout); subscription.unsubscribe(); };
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
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
    try {
      document.cookie.split(';').forEach(c => {
        const n = c.split('=')[0].trim();
        if (n.startsWith('sb-')) {
          document.cookie = n + '=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;';
          document.cookie = n + '=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;domain=' + window.location.hostname + ';';
          document.cookie = n + '=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;domain=.' + window.location.hostname + ';';
        }
      });
    } catch {}
    window.location.replace('/');
  }, [supabase]);

  return <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
