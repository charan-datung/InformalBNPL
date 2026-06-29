import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { AUTH_CHALLENGE_COOKIE, rpFromRequest } from "@/lib/webauthn/config";

/** Begin a passkey sign-in. Usernameless (discoverable credentials): the
 *  authenticator offers whatever passkeys it holds for this site, and the
 *  returned credential id identifies the user on verify. Stashes the challenge. */
export async function POST() {
  const { rpID } = await rpFromRequest();

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    // empty allowCredentials → let the platform surface discoverable passkeys
  });

  const jar = await cookies();
  jar.set(AUTH_CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  return NextResponse.json(options);
}
