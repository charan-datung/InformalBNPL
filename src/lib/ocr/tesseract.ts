import "server-only";
import os from "node:os";

/**
 * OCR via tesseract.js (free, self-hosted — no API key). Runs server-side only,
 * triggered by operator actions (never on the buyer's device or in the submit
 * hot path). The English model is fetched on first use and cached.
 *
 * Returns a typed result so the operator sees *why* OCR failed (timeout, model
 * download, read-only cache, etc.) instead of a blank "unavailable" — OCR is
 * always best-effort and never blocks a decision.
 */
export type OcrResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function ocrImage(buffer: Buffer): Promise<OcrResult> {
  try {
    // Imported lazily so the (heavy) worker only loads when OCR is actually run.
    const { createWorker } = await import("tesseract.js");
    // On serverless (Vercel) the app root is read-only — only the OS temp dir is
    // writable. tesseract.js caches its language model to `cachePath`, so it must
    // point at a writable location or the model write throws EROFS.
    const worker = await createWorker("eng", 1, {
      cachePath: os.tmpdir(),
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
