/**
 * Client-side image downscaling. Phone cameras produce 3–12 MB photos; uploading
 * those raw through a server action is slow and can exceed the platform's request
 * body limit. We shrink each image to a sane max dimension and re-encode as JPEG
 * before it ever leaves the browser — typically 10–30× smaller, so uploads feel
 * instant. Best-effort: any failure returns the original file untouched, so a
 * submit is never blocked by compression.
 */

async function compressImage(
  file: File,
  maxDim = 1600,
  quality = 0.8,
): Promise<File> {
  try {
    if (typeof document === "undefined" || !file.type.startsWith("image/")) {
      return file;
    }
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file; // never upsize

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Shrink every image File in a FormData in place, before it's sent. */
export async function compressFormImages(formData: FormData): Promise<void> {
  for (const key of [...formData.keys()]) {
    const value = formData.get(key);
    if (value instanceof File && value.size > 0 && value.type.startsWith("image/")) {
      const compressed = await compressImage(value);
      if (compressed !== value) formData.set(key, compressed, compressed.name);
    }
  }
}
