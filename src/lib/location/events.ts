import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Consented device-location capture. Every record is an append-only
 * location_events row tagged with WHY it was captured (signup, seller
 * onboarding, or a specific checkout). Capture only ever happens after the user
 * has explicitly opted in on the client; these helpers are the server-side sink
 * and the operator-side readers. Service-role only (location_events has no RLS
 * policies), so callers must already have an admin client.
 */

export type LocationSource =
  | "signup"
  | "seller_onboarding"
  | "checkout"
  | "manual";

export type LocationEvent = {
  id: string;
  user_id: string;
  loan_id: string | null;
  source: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  captured_at: string;
};

/** A latitude/longitude parsed from a form, or null if absent/out of range. */
export function parseCoords(
  latRaw: unknown,
  lngRaw: unknown,
): { lat: number; lng: number } | null {
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Reject the null island (0,0) — almost always a missing/garbage fix.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/**
 * Append a consented location capture. Best-effort: validates the coordinates,
 * logs and swallows any write error so a capture never blocks the surrounding
 * flow (onboarding, checkout). Returns true if a row was written.
 */
export async function recordLocationEvent(
  admin: SupabaseClient,
  input: {
    userId: string;
    source: LocationSource;
    lat: number;
    lng: number;
    accuracyM?: number | null;
    loanId?: string | null;
  },
): Promise<boolean> {
  const coords = parseCoords(input.lat, input.lng);
  if (!coords) return false;
  try {
    const { error } = await admin.from("location_events").insert({
      user_id: input.userId,
      loan_id: input.loanId ?? null,
      source: input.source,
      lat: coords.lat,
      lng: coords.lng,
      accuracy_m:
        input.accuracyM != null && Number.isFinite(input.accuracyM)
          ? input.accuracyM
          : null,
    });
    if (error) {
      console.error("recordLocationEvent failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("recordLocationEvent threw:", e);
    return false;
  }
}

/** The most recent capture per user, for the operator directory. */
export async function latestLocations(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, LocationEvent>> {
  const out = new Map<string, LocationEvent>();
  if (userIds.length === 0) return out;
  const { data } = await admin
    .from("location_events")
    .select("id, user_id, loan_id, source, lat, lng, accuracy_m, captured_at")
    .in("user_id", userIds)
    .order("captured_at", { ascending: false });
  for (const row of (data ?? []) as LocationEvent[]) {
    // Rows arrive newest-first, so the first seen per user is the latest.
    if (!out.has(row.user_id)) out.set(row.user_id, row);
  }
  return out;
}

/** Full capture history for one user (operator detail / audit). */
export async function locationHistory(
  admin: SupabaseClient,
  userId: string,
  limit = 50,
): Promise<LocationEvent[]> {
  const { data } = await admin
    .from("location_events")
    .select("id, user_id, loan_id, source, lat, lng, accuracy_m, captured_at")
    .eq("user_id", userId)
    .order("captured_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as LocationEvent[];
}

/** Build a Google Maps link for a captured point. */
export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
