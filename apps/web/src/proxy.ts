import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/register", "/accept-invite", "/verify"];

// Cheap gate: send people without a session cookie to the login page.
// Real authorization happens in the API on every request.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const has = req.cookies.has("hr_session");
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  if (!has && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  if (has && (pathname.startsWith("/login") || pathname.startsWith("/register")))
    return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"] };
