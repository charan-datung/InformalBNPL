"use client";

import { useEffect, useState } from "react";
import { startRegistration, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint, Check } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * "Set up biometric sign-in" — enrols a passkey (Face ID / Touch ID / Android
 * biometric) for the logged-in user. Additive: email + password still works.
 */
export default function PasskeySetup() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Capability check must run client-side; starting at null keeps SSR/CSR markup
    // identical (no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(browserSupportsWebAuthn());
  }, []);

  if (supported === false) return null;

  async function enroll() {
    setError(null);
    setState("working");
    try {
      const optionsJSON = await fetch("/api/webauthn/register/options", {
        method: "POST",
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not start setup."))));

      const attResp = await startRegistration({ optionsJSON });

      const res = await fetch("/api/webauthn/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attResp),
      }).then((r) => r.json());

      if (!res.ok) throw new Error(res.error ?? "Could not save your passkey.");
      setState("done");
    } catch (e) {
      // The user cancelling the native prompt throws too — keep it gentle.
      const msg =
        e instanceof Error && /abort|cancel|not allowed/i.test(e.message)
          ? "Setup cancelled."
          : e instanceof Error
            ? e.message
            : "Could not set up biometric sign-in.";
      setError(msg);
      setState("idle");
    }
  }

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Fingerprint className="size-4.5 text-brand-600" /> Biometric sign-in
      </div>
      <p className="mt-0.5 text-xs text-black/55">
        Add Face ID, Touch ID or your phone&apos;s fingerprint as a faster way to
        log in. Your password still works.
      </p>

      {state === "done" ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-700">
          <Check className="size-4" /> Biometric sign-in is on for this device.
        </p>
      ) : (
        <button
          type="button"
          onClick={enroll}
          disabled={state === "working" || supported === null}
          className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}
        >
          <Fingerprint className="size-4" />
          {state === "working" ? "Setting up…" : "Set up biometric sign-in"}
        </button>
      )}

      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
