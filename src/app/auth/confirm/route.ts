import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation / auth callback. Supabase sends the user back here after
 * they click the link in the confirmation email. Two link styles are supported:
 *
 *  - PKCE (default for @supabase/ssr): a `?code=` exchanged for a session.
 *  - OTP/magic-link: a `token_hash` + `type` verified.
 *
 * On success we forward to `next` (role selection by default); on failure to
 * the login screen with a message. Being a Route Handler, the session cookies
 * set during the exchange are persisted on the redirect response.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(
    new URL(
      "/login?error=" + encodeURIComponent("Could not confirm email link."),
      request.url,
    ),
  );
}
