import { headers } from "next/headers";

/**
 * Absolute origin (scheme + host) for the current request, from the proxy
 * headers Vercel sets. Used to build shareable absolute URLs (pay links, buyer
 * invite links) in server components. Falls back to localhost in dev.
 */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
