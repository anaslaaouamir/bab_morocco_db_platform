import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_TOKEN_COOKIE = "bm_auth_token";

/**
 * Presence-only auth gate. The actual JWT (signature/expiry) is validated
 * server-side by the backend on every API call — this middleware only stops
 * obviously-logged-out users from seeing a page flash before redirect.
 */
export function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_TOKEN_COOKIE)?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - /login (the unauthenticated entry point)
     * - /_next/static, /_next/image (Next.js internals)
     * - favicon.png, logo.webp and other public assets
     * - /api (none currently, reserved for future use)
     */
    "/((?!login|change-password|_next/static|_next/image|favicon.png|favicon.ico|logo.webp|api).*)",
  ],
};
