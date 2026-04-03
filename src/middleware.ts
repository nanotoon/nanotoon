import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Use getSession() — reads JWT from cookie locally, zero network calls.
    // getUser() makes a live network round-trip to Supabase on every page load
    // which was blocking rendering for logged-in users and causing "loading forever".
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    const protectedPaths = ["/profile", "/settings", "/favorites", "/followers", "/following", "/notifications"];
    const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));

    if (!user && isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/signin";
      url.searchParams.set("redirect", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    const authPaths = ["/auth/signin", "/auth/register"];
    if (user && authPaths.some((p) => request.nextUrl.pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/", request.url));
    }

  } catch (error) {
    console.error("Middleware Error:", error);
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
