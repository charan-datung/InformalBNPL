import "server-only";
import os from "node:os";
import fs from "node:fs";
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

/**
 * Local directory holding eng.traineddata.gz, verified to exist, so OCR never
 * does a runtime CDN fetch (which 403s in egress-restricted serverless). Tries
 * a few anchors because `require.resolve` of the package's package.json can fail
 * in a bundled/traced serverless build even when the data folder is shipped.
 * Returns null if no local model is found — the caller then lets tesseract.js
 * fall back to its default path rather than crashing with a confusing error.
 */
function engLangPath(): string | null {
  const candidates: string[] = [];
  try {
    candidates.push(
      path.join(
        path.dirname(require.resolve("@tesseract.js-data/eng/package.json")),
        "4.0.0_best_int",
      ),
    );
  } catch {
    /* package.json not resolvable in this bundle — try cwd-anchored paths */
  }
  candidates.push(
    path.join(
      process.cwd(),
      "node_modules/@tesseract.js-data/eng/4.0.0_best_int",
    ),
  );

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "eng.traineddata.gz"))) return dir;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

export async function ocrImage(buffer: Buffer): Promise<OcrResult> {
  try {
    // Imported lazily so the (heavy) worker only loads when OCR is actually run.
    const { createWorker } = await import("tesseract.js");
    // cachePath must be writable (serverless app root is read-only — only /tmp).
    // langPath points at the bundled model so there's no CDN download; if it
    // can't be located we omit it and let tesseract.js use its own default.
    const langPath = engLangPath();
    const worker = await createWorker("eng", 1, {
      cachePath: os.tmpdir(),
      ...(langPath ? { langPath } : {}),
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
