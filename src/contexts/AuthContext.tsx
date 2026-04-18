"use client";
import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { createAnonClient } from "@/lib/supabase/anon";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/types";

type AuthState = { user: User | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void>; refreshProfile: () => Promise<void> };
const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, signOut: async () => {}, refreshProfile: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const anonDb = useMemo(() => createAnonClient(), []);
  const initDone = useRef(false);

  const fetchProfile = useCallback(async (uid: string) => {
    try {
      // Use anonDb for profile reads — no JWT locks, no hangs
      const { data } = await anonDb.from("profiles").select("*").eq("id", uid).maybeSingle() as { data: any };
      // If the admin flagged this account as banned, force a sign-out. The
      // ban flag is set via /api/admin-ban and picked up on the very next
      // session read (e.g. page load or onAuthStateChange). A notification
      // has already been inserted by the ban endpoint, so they'll see the
      // reason on their next visit (or via email if notifications are piped).
      if (data?.is_banned) {
        try { await supabase.auth.signOut(); } catch {}
        setUser(null);
        setProfile(null);
        if (typeof window !== "undefined") {
          try { alert("Your account has been suspended. Please check your notifications or contact nanotooncontact@gmail.com to appeal."); } catch {}
          window.location.replace("/");
        }
        return;
      }
      setProfile((data as Profile) ?? null);
    } catch { setProfile(null); }
  }, [anonDb, supabase]);

  const refreshProfile = useCallback(async () => { if (user) await fetchProfile(user.id); }, [user, fetchProfile]);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    // Reduced from 6s to 3s — if auth takes longer, something is wrong
    const hardTimeout = setTimeout(() => setLoading(false), 3000);

    const init = async () => {
      try {
        // Use getSession() — reads cookies locally, NO network call.
        // Token refresh is handled by ensureFreshSession() before writes.
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          setUser(null); setProfile(null);
        } else {
          setUser(session.user);
          await fetchProfile(session.user.id);
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
  }, [supabase, anonDb, fetchProfile]);

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
