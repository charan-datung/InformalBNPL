import "server-only";
import { cookies } from "next/headers";

/**
 * Which side of the app a user is currently viewing. Single-role users are
 * locked to their role; dual-role (buyer + seller) users toggle via a cookie.
 */
export type DashMode = "buyer" | "seller";

type Caps = { buyer: string; seller: string };

export function rolesOf(caps: Caps): {
  buyer: boolean;
  seller: boolean;
  both: boolean;
} {
  const buyer = caps.buyer === "verified";
  const seller = caps.seller === "verified";
  return { buyer, seller, both: buyer && seller };
}

export async function resolveMode(caps: Caps): Promise<DashMode> {
  const { buyer, seller, both } = rolesOf(caps);
  if (both) {
    const c = (await cookies()).get("dash_mode")?.value;
    return c === "seller" ? "seller" : "buyer";
  }
  return seller && !buyer ? "seller" : "buyer";
}
