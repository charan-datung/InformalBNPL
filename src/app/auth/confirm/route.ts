import { type NextRequest, NextResponse } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation / auth callback. Supabase sends the user back here after
 * they click the link in the confirmation email. Two link styles are supported:
 *
 *  - OTP / token_hash (recommended for SSR): `?token_hash=...&type=...`. Verified
 *    server-side with verifyOtp — works even if the link is opened on a
 *    different device than sign-up (no PKCE code_verifier cookie needed).
 *  - PKCE: a `?code=` exchanged for a session. Requires the code_verifier cookie
 *    set at sign-up, so it only works in the same browser.
 *
 * On success we forward to `next` (role selection by default). On failure we
 * forward to /login with the *actual* reason (logged server-side too), so an
 * expired/already-used link or a mis-set redirect URL is diagnosable instead of
 * showing a generic "could not confirm".
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  // Supabase appends its own error when the link itself is bad (expired,
  // already used, redirect not allow-listed). Surface that verbatim.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  const fail = (reason: string) => {
    console.error("auth/confirm failed:", reason, {
      hasCode: Boolean(code),
      hasTokenHash: Boolean(token_hash),
      type,
    });
    return NextResponse.redirect(
      new URL("/login?error=" + encodeURIComponent(reason), request.url),
    );
  };

  if (providerError) return fail(providerError);

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    return fail(error.message);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    return fail(error.message);
  }

  return fail("Confirmation link is missing its token. Please use the most recent email.");
}
