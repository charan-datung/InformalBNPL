"use client";

import { useState } from "react";
import { MapPin, Loader2, Check } from "lucide-react";

/**
 * Consented, one-shot location capture. The user must tick the consent box;
 * only then do we ask the browser for a single position fix (foreground only —
 * the web platform has no silent background tracking). The captured point and a
 * `location_consent=yes` flag ride along as hidden inputs in the surrounding
 * <form>, so the server action records them at submit. Purely opt-in: if the
 * box is unticked or the fix fails, the hidden coords stay empty and nothing is
 * captured.
 */
export default function LocationConsent({
  purpose = "to help verify your account and protect against fraud",
  title = "Share my current location",
}: {
  purpose?: string;
  title?: string;
}) {
  const [consented, setConsented] = useState(false);
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    acc: number | null;
  } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  function capture() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      setMessage("Location isn't available on this device.");
      return;
    }
    setStatus("loading");
    setMessage("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
        setStatus("done");
        setMessage("Location shared ✓");
      },
      () => {
        setStatus("error");
        setMessage("Couldn't get your location — you can continue without it.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function onToggle(checked: boolean) {
    setConsented(checked);
    if (checked) {
      capture();
    } else {
      setCoords(null);
      setStatus("idle");
      setMessage("");
    }
  }

  const shared = consented && coords != null;

  return (
    <div className="space-y-2 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-transparent">
      {/* Only emitted when the user has consented AND we have a real fix. */}
      <input
        type="hidden"
        name="location_consent"
        value={shared ? "yes" : ""}
        readOnly
      />
      <input type="hidden" name="geo_lat" value={shared ? coords!.lat : ""} readOnly />
      <input type="hidden" name="geo_lng" value={shared ? coords!.lng : ""} readOnly />
      <input
        type="hidden"
        name="geo_accuracy"
        value={shared && coords!.acc != null ? coords!.acc : ""}
        readOnly
      />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 size-5 accent-brand-600"
        />
        <span className="text-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <MapPin className="size-4 text-brand-600" /> {title}
          </span>
          <span className="mt-0.5 block text-xs text-black/55 dark:text-white/55">
            I consent to share my device location {purpose}. Optional, and only
            captured when you tick this box.
          </span>
        </span>
      </label>

      {consented && status !== "idle" ? (
        <p
          className={`flex items-center gap-1.5 pl-8 text-xs ${
            status === "error"
              ? "text-red-600 dark:text-red-400"
              : "text-black/55 dark:text-white/55"
          }`}
        >
          {status === "loading" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : status === "done" ? (
            <Check className="size-3.5 text-green-600" />
          ) : null}
          {message}
          {status === "error" ? (
            <button
              type="button"
              onClick={capture}
              className="ml-1 font-medium text-brand-700 underline underline-offset-2"
            >
              Try again
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
