import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  // FIX: Support BOTH auth paths in one callback:
  //   1) OAuth sign-in (Google/Discord) → uses ?code=...
  //   2) Email confirmation link → uses ?token_hash=...&type=email
  // Both end up exchanging their param for a session, then we run the same
  // "new user" setup (profile, welcome notification, welcome email) below.
  if (code || (tokenHash && type)) {
    const supabase = await createClient();

    let exchangeError: any = null;
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      exchangeError = error;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      exchangeError = error;
    }

    if (!exchangeError) {
      // Check if user has a profile, create one if not
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, is_banned, deletion_status, deletion_scheduled_at")
          .eq("id", user.id)
          .maybeSingle();

        // BANNED CHECK — applies to ALL login paths that come through this
        // callback (Google OAuth, Discord OAuth, email-confirmation links).
        // If the profile is flagged banned, sign them out on the server
        // before we hand them back a session cookie and bounce them to the
        // sign-in page. The sign-in page shows the suspension message when
        // it sees ?banned=1 in the query string.
        if ((profile as any)?.is_banned) {
          try { await supabase.auth.signOut(); } catch {}
          const forwardedHost = request.headers.get("x-forwarded-host");
          const isLocalEnv = process.env.NODE_ENV === "development";
          const bannedTarget = "/auth/signin?banned=1";
          if (isLocalEnv) {
            return NextResponse.redirect(`${origin}${bannedTarget}`);
          } else if (forwardedHost) {
            return NextResponse.redirect(`https://${forwardedHost}${bannedTarget}`);
          } else {
            return NextResponse.redirect(`${origin}${bannedTarget}`);
          }
        }

        // PENDING-DELETION CHECK — if the profile is in the 30-day grace
        // window, DON'T hand them a normal session. We keep the session
        // active (so they can call /api/account-delete from the recovery
        // panel) but redirect them to the sign-in page with ?pending=1
        // + uid + days so it renders the Recover / Delete-Now panel.
        const pProfile = profile as any;
        if (pProfile?.deletion_status === 'pending') {
          const startMs = pProfile.deletion_scheduled_at ? new Date(pProfile.deletion_scheduled_at).getTime() : Date.now();
          const elapsedDays = Math.floor((Date.now() - startMs) / (24 * 60 * 60 * 1000));
          const daysLeft = Math.max(0, 30 - elapsedDays);
          const forwardedHost = request.headers.get("x-forwarded-host");
          const isLocalEnv = process.env.NODE_ENV === "development";
          const pendingTarget = `/auth/signin?pending=1&uid=${encodeURIComponent(user.id)}&days=${daysLeft}`;
          if (isLocalEnv) {
            return NextResponse.redirect(`${origin}${pendingTarget}`);
          } else if (forwardedHost) {
            return NextResponse.redirect(`https://${forwardedHost}${pendingTarget}`);
          } else {
            return NextResponse.redirect(`${origin}${pendingTarget}`);
          }
        }

        if (!profile) {
          // Create a default profile for new users (OAuth or email-confirmed)
          const displayName =
            user.user_metadata?.display_name ||
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "User";

          const handle =
            user.user_metadata?.handle ||
            user.user_metadata?.preferred_username ||
            user.email?.split("@")[0]?.replace(/[^a-zA-Z0-9_]/g, "") ||
            `user_${user.id.slice(0, 8)}`;

          await supabase.from("profiles").insert({
            id: user.id,
            display_name: displayName,
            handle: handle,
            avatar_url: user.user_metadata?.avatar_url || null,
          });

          // Send welcome notification to new user
          await supabase.from("notifications").insert({
            user_id: user.id,
            actor_id: null,
            type: "welcome",
            message: `Welcome to NANOTOON! 🎉 This is a platform built specifically for AI comic, manga, and webtoon creators. Get your series live by uploading your first chapter, or start supporting your favorite creators today!`,
          });

          // Send welcome EMAIL to new user (OAuth or email-confirmed).
          // FIX: Call Resend directly instead of fetching our own /api/send-welcome
          // route. On Cloudflare Workers, Workers fetching their own domain can
          // silently fail due to the runtime's internal routing. Calling Resend's
          // public API directly removes that failure point entirely.
          if (user.email) {
            const resendKey = process.env.RESEND_API_KEY;
            if (resendKey) {
              const from = process.env.RESEND_FROM_EMAIL || "NANOTOON <noreply@nanotoon.io>";
              const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:520px;margin:40px auto;background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;"><div style="background:linear-gradient(135deg,#7c3aed,#c026d3);padding:32px;text-align:center;"><div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;"><span style="color:white;font-size:28px;font-weight:900;">N</span></div><h1 style="color:white;font-size:24px;font-weight:700;margin:0;">Welcome to NANOTOON!</h1></div><div style="padding:32px;"><p style="color:#e4e4e7;font-size:16px;margin:0 0 16px;">Hi <strong>${displayName}</strong>,</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 16px;">Welcome to the community! This is a platform built specifically for AI comic, manga, and webtoon creators.</p><p style="color:#a1a1aa;font-size:15px;line-height:1.6;margin:0 0 28px;">Get your series live and into the hands of readers by uploading your first chapter, or start supporting your favorite AI comic, manga, and webtoon creators today.</p><div style="text-align:center;margin-bottom:28px;"><a href="https://nanotoon.io" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#c026d3);color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:600;font-size:15px;">Start Exploring →</a></div><hr style="border:none;border-top:1px solid #27272a;margin:0 0 20px;"><p style="color:#52525b;font-size:12px;margin:0;text-align:center;">You're receiving this because you signed up at nanotoon.io<br>© 2025 NANOTOON. All rights reserved.</p></div></div></body></html>`;
              // FIX: AWAIT the Resend call before returning the redirect.
              // Previously this was fire-and-forget, but on Cloudflare Workers
              // any in-flight fetch that isn't awaited (and isn't registered
              // with ctx.waitUntil) is terminated the moment the Worker
              // responds — so the request to Resend never actually completed
              // and no welcome email was ever sent. Awaiting adds a few
              // hundred ms to the sign-in redirect but is the only reliable
              // way to guarantee the email goes out on the Workers runtime.
              try {
                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${resendKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    from,
                    to: user.email,
                    subject: "Welcome to NANOTOON! 🎉",
                    html,
                  }),
                });
              } catch { /* don't block signup on a Resend outage */ }
            }
          }
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // If something went wrong, redirect to error or signin
  return NextResponse.redirect(`${origin}/auth/signin?error=callback_failed`);
}
