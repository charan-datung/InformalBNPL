import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and keeps the auth
 * cookies in sync between the browser and Server Components.
 *
 * No route protection is wired up yet — this only keeps the session alive.
 * Per-surface access control (operator / admin) comes later, once roles exist.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Before Supabase env is configured (e.g. a fresh clone), skip session
  // refresh so pages still render and /health can report the problem.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return supabaseResponse;
  }

  // Anonymous traffic (home, login, signup, marketing) carries no Supabase auth
  // cookie, so there's no session to refresh — skip the auth.getUser() network
  // round-trip entirely. Logged-in requests (which have the cookie) still
  // refresh as before.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!hasAuthCookie) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the user so an expired access token gets refreshed and the new
  // cookies are written onto supabaseResponse.
  await supabase.auth.getUser();

  return supabaseResponse;
}
