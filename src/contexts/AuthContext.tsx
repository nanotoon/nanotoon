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
      // session read (e.g. page load or onAuthStateChange). We redirect to
      // /auth/signin?banned=1 so the sign-in page shows the suspension
      // message — this replaces the old notification-based approach, and
      // also catches users who were already signed in when the admin
      // banned them.
      if (data?.is_banned) {
        try { await supabase.auth.signOut(); } catch {}
        setUser(null);
        setProfile(null);
        if (typeof window !== "undefined") {
          // Avoid a redirect loop: if we're already on /auth/signin, just
          // reload with the ?banned=1 flag so the message appears. Otherwise
          // send them to sign-in from wherever they were.
          const target = "/auth/signin?banned=1";
          if (window.location.pathname + window.location.search !== target) {
            window.location.replace(target);
          }
        }
        return;
      }
      // PENDING-DELETION CHECK — if the profile is in the 30-day grace
      // window, redirect the user to the sign-in page with the recovery
      // params but DO NOT sign them out. The recovery panel there calls
      // /api/account-delete with the user's own JWT, so the session must
      // stay alive. Skip the redirect when the user is already on the
      // sign-in page (prevents loops).
      if (data?.deletion_status === 'pending') {
        if (typeof window !== "undefined") {
          const startMs = data.deletion_scheduled_at ? new Date(data.deletion_scheduled_at).getTime() : Date.now();
          const elapsedDays = Math.floor((Date.now() - startMs) / (24 * 60 * 60 * 1000));
          const daysLeft = Math.max(0, 30 - elapsedDays);
          const onSignIn = window.location.pathname === '/auth/signin';
          const isPendingParam = new URLSearchParams(window.location.search).get('pending') === '1';
          if (!onSignIn || !isPendingParam) {
            window.location.replace(`/auth/signin?pending=1&uid=${encodeURIComponent(uid)}&days=${daysLeft}`);
          }
        }
        // Also clear the profile so nothing in the UI assumes a normal user.
        setProfile(null);
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
          // Seed an optimistic profile from user_metadata so OAuth avatars
          // (Google/Discord) render INSTANTLY instead of flashing the default
          // initials for 1–2s while the DB profile fetch is in flight. The
          // real DB profile replaces this as soon as fetchProfile resolves —
          // the avatar URL is the same in both, so there's no visible snap.
          const meta = session.user.user_metadata || {};
          setProfile({
            id: session.user.id,
            display_name: meta.display_name || meta.full_name || meta.name || session.user.email?.split("@")[0] || "User",
            handle: meta.handle || meta.preferred_username || "user",
            avatar_url: meta.avatar_url || null,
            bio: null,
            links: null,
            links_json: null,
            created_at: null,
          } as Profile);
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
      if (u) {
        // Same optimistic seed on auth-state-change (covers fresh sign-ins).
        const meta = u.user_metadata || {};
        setProfile((prev: Profile | null) => prev ?? ({
          id: u.id,
          display_name: meta.display_name || meta.full_name || meta.name || u.email?.split("@")[0] || "User",
          handle: meta.handle || meta.preferred_username || "user",
          avatar_url: meta.avatar_url || null,
          bio: null,
          links: null,
          links_json: null,
          created_at: null,
        } as Profile));
        await fetchProfile(u.id);
      } else {
        setProfile(null);
      }
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
