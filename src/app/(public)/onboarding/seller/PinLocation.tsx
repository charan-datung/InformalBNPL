"use client";

import { useState } from "react";

/**
 * Optional "pin my location" helper for the storefront/stall. Fills hidden
 * lat/lng inputs from the browser's geolocation so the operator can see roughly
 * where an informal outlet operates. Purely additive — the typed address is the
 * required field.
 */
export default function PinLocation() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<string>("");

  return (
    <div className="space-y-1">
      <input type="hidden" name="storefront_lat" value={coords?.lat ?? ""} readOnly />
      <input type="hidden" name="storefront_lng" value={coords?.lng ?? ""} readOnly />
      <button
        type="button"
        onClick={() => {
          if (!navigator.geolocation) {
            setStatus("Location isn't available on this device.");
            return;
          }
          setStatus("Getting location…");
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              setStatus("Location pinned ✓");
            },
            () => setStatus("Couldn't get location (you can skip this)."),
          );
        }}
        className="rounded-md border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-50 dark:border-white/15 dark:text-white"
      >
        📍 Pin my stall location (optional)
      </button>
      {status ? (
        <span className="block text-xs text-black/45 dark:text-white/45">{status}</span>
      ) : null}
    </div>
  );
}
