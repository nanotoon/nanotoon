import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user has a profile, create one if not
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .single();

        if (!profile) {
          // Create a default profile for new OAuth users
          const displayName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            "User";

          const handle =
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

          // FIX: Send welcome EMAIL to new OAuth users. Previously this only fired
          // from the email/password register form, so Google/Discord sign-ups never
          // got the welcome email. Fire-and-forget so callback redirect isn't blocked.
          if (user.email) {
            const forwardedHostForEmail = request.headers.get("x-forwarded-host");
            const proto = request.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "development" ? "http" : "https");
            const baseUrl = forwardedHostForEmail ? `${proto}://${forwardedHostForEmail}` : origin;
            fetch(`${baseUrl}/api/send-welcome`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: user.email, displayName }),
            }).catch(() => { /* silently ignore — don't block signup */ });
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
