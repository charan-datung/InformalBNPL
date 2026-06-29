import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createClient } from "@/lib/supabase/server";
import { insertCredential } from "@/lib/webauthn/store";
import { REG_CHALLENGE_COOKIE, rpFromRequest } from "@/lib/webauthn/config";

/** Finish enrolling a passkey: verify the attestation against the issued
 *  challenge + this origin, then store the credential for the logged-in user. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const jar = await cookies();
  const expectedChallenge = jar.get(REG_CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired. Try again." }, { status: 400 });
  }

  const body = await req.json();
  const { rpID, origin } = await rpFromRequest();

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Could not verify this device." }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;
    await insertCredential({
      userId: user.id,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: body.response?.transports ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  } finally {
    jar.delete(REG_CHALLENGE_COOKIE);
  }

  return NextResponse.json({ ok: true });
}
