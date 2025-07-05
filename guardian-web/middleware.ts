import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Since matcher restricts to protected routes, just check auth
  if (!user) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirectedFrom", req.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return res;
}

export const config = {
  matcher: ["/", "/(main)/:path*"],
}; 