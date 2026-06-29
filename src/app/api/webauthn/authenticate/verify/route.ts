import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCredentialById, bumpCredential } from "@/lib/webauthn/store";
import { AUTH_CHALLENGE_COOKIE, rpFromRequest } from "@/lib/webauthn/config";

/**
 * Finish a passkey sign-in: verify the assertion, then bridge to a real Supabase
 * session. Since WebAuthn isn't a native Supabase auth method, we mint a session
 * for the credential's owner using an admin-generated magic-link OTP (no email
 * is sent) and verify it on the cookie client, which sets the session cookies.
 */
export async function POST(req: Request) {
  const jar = await cookies();
  const expectedChallenge = jar.get(AUTH_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired. Try again." }, { status: 400 });
  }

  const body = await req.json();
  const { rpID, origin } = await rpFromRequest();

  try {
    const stored = await getCredentialById(body.id);
    if (!stored) {
      return NextResponse.json({ error: "This passkey isn't registered." }, { status: 404 });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: stored.id,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
      },
    });
    if (!verification.verified) {
      return NextResponse.json({ error: "Could not verify this passkey." }, { status: 401 });
    }

    await bumpCredential(stored.id, verification.authenticationInfo.newCounter);

    // Bridge to a Supabase session for the credential's owner.
    const admin = createAdminClient();
    const { data: u } = await admin.auth.admin.getUserById(stored.userId);
    const email = u.user?.email;
    if (!email) {
      return NextResponse.json({ error: "Account email missing." }, { status: 500 });
    }
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      return NextResponse.json({ error: "Could not start a session." }, { status: 500 });
    }
    const supabase = await createClient();
    const { error: otpErr } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });
    if (otpErr) {
      return NextResponse.json({ error: otpErr.message }, { status: 500 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign-in failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  } finally {
    jar.delete(AUTH_CHALLENGE_COOKIE);
  }

  return NextResponse.json({ ok: true });
}
