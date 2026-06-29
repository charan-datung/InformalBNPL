import "server-only";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * OCR via tesseract.js (free, self-hosted — no API key). Runs server-side only,
 * triggered by operator actions (never on the buyer's device or in the submit
 * hot path).
 *
 * The language model is shipped LOCALLY (via the @tesseract.js-data/eng
 * dependency) and pointed at with `langPath`, so OCR never does a runtime CDN
 * fetch — that fetch fails with a 403/timeout in serverless / egress-restricted
 * environments and was the cause of "OCR failed: Network error while fetching …
 * eng.traineddata.gz". next.config force-includes the data + core in the bundle.
 *
 * Returns a typed result so the operator sees *why* OCR failed instead of a
 * blank "unavailable" — OCR is always best-effort and never blocks a decision.
 */
export type OcrResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

const require = createRequire(import.meta.url);

/** Local directory holding eng.traineddata.gz (no network needed). */
function engLangPath(): string {
  return path.join(
    path.dirname(require.resolve("@tesseract.js-data/eng/package.json")),
    "4.0.0_best_int",
  );
}

export async function ocrImage(buffer: Buffer): Promise<OcrResult> {
  try {
    // Imported lazily so the (heavy) worker only loads when OCR is actually run.
    const { createWorker } = await import("tesseract.js");
    // cachePath must be writable (serverless app root is read-only — only /tmp);
    // langPath points at the bundled model so there's no CDN download.
    const worker = await createWorker("eng", 1, {
      cachePath: os.tmpdir(),
      langPath: engLangPath(),
      gzip: true,
      logger: () => {},
    });
    try {
      const { data } = await worker.recognize(buffer);
      return { ok: true, text: data.text ?? "" };
    } finally {
      await worker.terminate();
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown OCR error";
    console.error("ocrImage failed:", error);
    return { ok: false, error };
  }
}
