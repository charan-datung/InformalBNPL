import "server-only";
import { headers } from "next/headers";

/**
 * WebAuthn relying-party configuration. The RP ID must be the site's registrable
 * domain (host without scheme/port); the origin must exactly match what the
 * browser reports. Both are derived per-request so this works on localhost,
 * Vercel preview URLs and production alike, falling back to NEXT_PUBLIC_APP_URL.
 */

export const RP_NAME = "Datung";

/** Cookie that carries the one-shot challenge between the options + verify call. */
export const REG_CHALLENGE_COOKIE = "wa_reg_chal";
export const AUTH_CHALLENGE_COOKIE = "wa_auth_chal";

export async function rpFromRequest(): Promise<{ rpID: string; origin: string }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto =
      h.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const u = new URL(appUrl);
  return { rpID: u.hostname, origin: u.origin };
}
