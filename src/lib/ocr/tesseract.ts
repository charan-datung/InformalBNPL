import "server-only";

/**
 * OCR via tesseract.js (free, self-hosted — no API key). Runs server-side only,
 * triggered by operator actions (never on the buyer's device or in the submit
 * hot path). The English model is fetched/cached on first use. Always
 * best-effort: any failure returns null so the operator simply falls back to
 * eyeballing the document — OCR never blocks a decision.
 */
export async function ocrImage(buffer: Buffer): Promise<string | null> {
  try {
    // Imported lazily so the (heavy) worker only loads when OCR is actually run.
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      const { data } = await worker.recognize(buffer);
      return data.text ?? "";
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}
