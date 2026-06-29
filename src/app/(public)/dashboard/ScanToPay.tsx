"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { QrCode, X, Link as LinkIcon, Camera } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";

/**
 * "Scan to pay" — the buyer's primary action. Opens an in-app camera scanner that
 * reads a seller's Datung Pay QR and jumps straight to checkout, with a
 * paste-the-link fallback for when the camera isn't available. Both resolve a
 * pay token and navigate to /pay/<token>.
 */

/** Pull the pay token out of a scanned QR / pasted link / bare code. */
export function extractPayToken(text: string): string | null {
  const t = text.trim();
  try {
    const m = new URL(t).pathname.match(/\/pay\/([^/?#]+)/);
    if (m) return m[1];
  } catch {
    /* not a URL — fall through */
  }
  const m = t.match(/\/pay\/([^/?#\s]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{8,64}$/.test(t)) return t; // bare token
  return null;
}

export default function ScanToPay() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"scan" | "paste">("scan");
  const [pasteVal, setPasteVal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  function close() {
    stopCamera();
    setOpen(false);
    setError(null);
    setPasteVal("");
    setMode("scan");
  }
  function go(token: string) {
    stopCamera();
    setOpen(false);
    router.push(`/pay/${token}`);
  }
  function submitPaste() {
    const token = extractPayToken(pasteVal);
    if (!token) {
      setError("That doesn't look like a Datung pay link. Paste the full link.");
      return;
    }
    go(token);
  }

  useEffect(() => {
    if (!open || mode !== "scan") return;
    let cancelled = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        await v.play();
        const tick = () => {
          if (cancelled || !ctx) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height);
            if (code) {
              const token = extractPayToken(code.data);
              if (token) {
                go(token);
                return;
              }
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setError("Couldn't open the camera — paste the seller's link instead.");
          setMode("paste");
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClasses({ size: "lg", className: "w-full" })}
      >
        <QrCode className="size-5" /> Scan to pay
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between p-4 text-white">
            <span className="font-semibold">
              {mode === "scan" ? "Scan seller's QR" : "Paste pay link"}
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid size-9 place-items-center rounded-full bg-white/15"
            >
              <X className="size-5" />
            </button>
          </div>

          {mode === "scan" ? (
            <div className="relative flex-1 overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              {/* Aiming frame */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="size-56 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              </div>
              <p className="absolute inset-x-0 bottom-24 text-center text-sm text-white/90">
                Point your camera at the seller&apos;s Datung Pay QR.
              </p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-center px-6">
              <div className="mx-auto w-full max-w-sm space-y-3">
                {error ? (
                  <p className="rounded-lg bg-white/10 px-3 py-2 text-sm text-amber-200">
                    {error}
                  </p>
                ) : null}
                <label className="block text-sm text-white/80">
                  Paste the link the seller sent you
                </label>
                <input
                  value={pasteVal}
                  onChange={(e) => setPasteVal(e.target.value)}
                  inputMode="url"
                  placeholder="https://…/pay/…"
                  className="h-12 w-full rounded-xl border border-white/20 bg-white/10 px-3.5 text-[16px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
                />
                <button
                  type="button"
                  onClick={submitPaste}
                  className={buttonClasses({ size: "lg", className: "w-full" })}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Mode switch */}
          <div className="p-4">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode((m) => (m === "scan" ? "paste" : "scan"));
              }}
              className="mx-auto flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white"
            >
              {mode === "scan" ? (
                <>
                  <LinkIcon className="size-4" /> Paste a link instead
                </>
              ) : (
                <>
                  <Camera className="size-4" /> Use the camera instead
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
