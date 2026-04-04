import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // ULTRA-LIGHTWEIGHT middleware — no Supabase, no JWT parsing, no HTTP calls
  // Just check if auth cookies exist (costs ~0.1ms CPU)
  // Actual auth validation happens client-side in AuthContext
  
  const hasAuthCookie = request.cookies.getAll().some(c => c.name.startsWith('sb-'));

  const protectedPaths = ["/profile", "/settings", "/favorites", "/followers", "/following", "/notifications"];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!hasAuthCookie && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  const authPaths = ["/auth/signin", "/auth/register"];
  if (hasAuthCookie && authPaths.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
