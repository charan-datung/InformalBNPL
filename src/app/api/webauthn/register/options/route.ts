import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { listCredentialsByUser } from "@/lib/webauthn/store";
import { RP_NAME, REG_CHALLENGE_COOKIE, rpFromRequest } from "@/lib/webauthn/config";

/** Begin enrolling a passkey for the logged-in user: issue registration options
 *  + stash the challenge in a short-lived httpOnly cookie. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { rpID } = await rpFromRequest();
  const existing = await listCredentialsByUser(user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? "Datung user",
    attestationType: "none",
    // Don't let the same authenticator enrol twice.
    excludeCredentials: existing.map((c) => ({ id: c.id })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const jar = await cookies();
  jar.set(REG_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  return NextResponse.json(options);
}
