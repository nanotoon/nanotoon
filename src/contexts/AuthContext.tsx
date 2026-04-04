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
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Manual token refresh with strict timeout
  const tryRefreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const result = await Promise.race([
        supabase.auth.refreshSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Token refresh timed out")), 5000)
        ),
      ]);
      if (result.error || !result.data.session) {
        console.warn("Token refresh failed:", result.error?.message);
        return false;
      }
      setUser(result.data.session.user);
      return true;
    } catch (err: any) {
      console.warn("Token refresh error:", err?.message);
      return false;
    }
  }, [supabase]);

  const doSignOut = useCallback(async () => {
    setUser(null);
    setProfile(null);
    setLoading(false);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
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

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // Not logged in — done
          setLoading(false);
          return;
        }

        // Check if token needs refresh
        const exp = session.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);

        if (now >= exp - 60) {
          // Token expired or expiring — try refresh with timeout
          console.log("Token expired, refreshing...");
          const success = await tryRefreshSession();
          if (success) {
            // Refresh worked — fetch profile
            const { data: { session: newSession } } = await supabase.auth.getSession();
            if (newSession) await fetchProfile(newSession.user.id);
          } else {
            // Refresh failed — sign out to clear broken session
            // This lets queries go through as anon (which works)
            console.warn("Refresh failed — clearing session");
            try { await supabase.auth.signOut(); } catch {}
            setUser(null);
            setProfile(null);
          }
        } else {
          // Token is fresh — use it
          setUser(session.user);
          await fetchProfile(session.user.id);

          // Set up periodic refresh (every 45 minutes)
          refreshTimer.current = setInterval(async () => {
            const success = await tryRefreshSession();
            if (!success) {
              console.warn("Periodic refresh failed");
              if (refreshTimer.current) clearInterval(refreshTimer.current);
            }
          }, 45 * 60 * 1000);
        }
      } catch (err) {
        console.warn("Auth init failed:", err);
        setUser(null);
        setProfile(null);
      } finally {
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

    return () => {
      subscription.unsubscribe();
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [supabase, fetchProfile, tryRefreshSession]);

  return <AuthContext.Provider value={{ user, profile, loading, signOut: doSignOut, refreshProfile }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
