import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Pass-through — no Supabase client, no JWT parsing, no CPU cost.
  // Token refresh is handled client-side by ensureFreshSession() in write.ts.
  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
