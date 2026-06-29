"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication, browserSupportsWebAuthn } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * "Sign in with biometrics" — usernameless passkey login. The platform surfaces
 * any passkeys registered for this site; on success we land on the dashboard
 * (or `next`). Rendered under the password form as an additional option.
 */
export default function PasskeySignIn({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Capability check must run client-side; starting at null keeps SSR/CSR markup
    // identical (no hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(browserSupportsWebAuthn());
  }, []);

  if (supported === false) return null;

  async function signIn() {
    setError(null);
    setWorking(true);
    try {
      const optionsJSON = await fetch("/api/webauthn/authenticate/options", {
        method: "POST",
      }).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not start sign-in."))));

      const asseResp = await startAuthentication({ optionsJSON });

      const res = await fetch("/api/webauthn/authenticate/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(asseResp),
      }).then((r) => r.json());

      if (!res.ok) throw new Error(res.error ?? "Sign-in failed.");
      router.replace(next);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof Error && /abort|cancel|not allowed/i.test(e.message)
          ? "Sign-in cancelled."
          : e instanceof Error
            ? e.message
            : "Could not sign in with a passkey.";
      setError(msg);
      setWorking(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={signIn}
        disabled={working || supported === null}
        className={buttonClasses({ variant: "secondary", size: "md", className: "w-full" })}
      >
        <Fingerprint className="size-4" />
        {working ? "Waiting for biometrics…" : "Sign in with biometrics"}
      </button>
      {error ? (
        <p className="text-center text-xs font-medium text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
