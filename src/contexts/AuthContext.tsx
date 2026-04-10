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
    } catch { setProfile(null); }
  }, [supabase]);

  const refreshProfile = useCallback(async () => { if (user) await fetchProfile(user.id); }, [user, fetchProfile]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    const hardTimeout = setTimeout(() => setLoading(false), 6000);

    const init = async () => {
      try {
        // Step 1: Check if we have a session
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          // Not logged in
          setUser(null); setProfile(null); setLoading(false);
          clearTimeout(hardTimeout);
          return;
        }

        // Step 2: Validate token with getUser() — this runs in the BROWSER
        // (no Cloudflare CPU limit). It forces token refresh if expired.
        // This replaces what middleware.getUser() used to do.
        const { data: { user: validatedUser }, error } = await supabase.auth.getUser();

        if (error || !validatedUser) {
          // Token is dead — clear everything so queries run as anon
          console.warn("Token validation failed, clearing session:", error?.message);
          await supabase.auth.signOut();
          setUser(null); setProfile(null);
        } else {
          // Token is valid (was refreshed if needed)
          setUser(validatedUser);
          await fetchProfile(validatedUser.id);
        }
      } catch (err) {
        console.warn("Auth init error:", err);
        setUser(null); setProfile(null);
      } finally {
        clearTimeout(hardTimeout);
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e: any, session: any) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) await fetchProfile(u.id); else setProfile(null);
      setLoading(false);
    });

    return () => { clearTimeout(hardTimeout); subscription.unsubscribe(); };
  }, [supabase, fetchProfile]);

  const signOut = useCallback(async () => {
    setUser(null); setProfile(null); setLoading(false);
    try { await supabase.auth.signOut(); } catch {}
    try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && (k.startsWith('sb-') || k.includes('supabase'))) localStorage.removeItem(k); } } catch {}
    try { document.cookie.split(';').forEach(c => { const n = c.split('=')[0].trim(); if (n.startsWith('sb-')) document.cookie = n + '=;expires=Thu,01 Jan 1970 00:00:00 UTC;path=/;'; }); } catch {}
    window.location.replace('/');
  }, [supabase]);

  return <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
