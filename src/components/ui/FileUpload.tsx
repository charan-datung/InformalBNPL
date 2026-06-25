"use client";

import { useId, useRef, useState } from "react";
import { Camera, ImageUp, Check, X, Loader2 } from "lucide-react";
import { compressInputFiles } from "@/lib/images/compress";
import { cn } from "@/lib/cn";

/**
 * Tap-friendly photo capture/upload. Replaces the bare native file input that
 * read "No file chosen" — the single biggest UX complaint. Shows a clear call to
 * action, a live thumbnail once a photo is chosen, the file name/size, and a
 * remove control. On phones it opens the camera (capture="environment"); on
 * desktop it's a click-or-drag dropzone. Compression runs on selection via the
 * existing compressInputFiles helper.
 *
 * The real <input type="file"> is kept in the DOM (visually hidden) under the
 * given `name`, so this is a drop-in for any multipart form — the server action
 * contract is unchanged.
 */
export default function FileUpload({
  name,
  label,
  hint,
  error,
  onFilledChange,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string | null;
  /** Notifies the parent whether a photo is currently selected, so a wizard can
   *  enforce required-ness in JS (a visually-hidden required file input can't be
   *  focused for native validation). */
  onFilledChange?: (filled: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [state, setState] = useState<"empty" | "busy" | "ready">("empty");
  const [preview, setPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ name: string; size: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles() {
    const input = inputRef.current;
    if (!input) return;
    const file = input.files?.[0];
    if (!file) {
      reset();
      return;
    }
    setState("busy");
    // Compress in place (mutates input.files) before we read final size/preview.
    await compressInputFiles(input);
    const finalFile = input.files?.[0] ?? file;
    setPreview(URL.createObjectURL(finalFile));
    setMeta({ name: finalFile.name, size: formatBytes(finalFile.size) });
    setState("ready");
    onFilledChange?.(true);
  }

  function reset() {
    if (inputRef.current) inputRef.current.value = "";
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setMeta(null);
    setState("empty");
    onFilledChange?.(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (inputRef.current && e.dataTransfer.files.length) {
      inputRef.current.files = e.dataTransfer.files;
      void handleFiles();
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>

      {state === "ready" && preview ? (
        <div className="flex items-center gap-3 rounded-xl border border-accent-300 bg-accent-50/60 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Selected document preview"
            className="size-16 shrink-0 rounded-lg object-cover ring-1 ring-black/10"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium text-accent-800">
              <Check className="size-4 shrink-0" /> Photo added
            </p>
            <p className="truncate text-xs text-black/50" title={meta?.name}>
              {meta?.name} · {meta?.size}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-black/45 hover:bg-black/[0.04] hover:text-black/70"
            aria-label="Remove photo"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
            dragOver
              ? "border-brand-500 bg-brand-50"
              : error
                ? "border-red-300 bg-red-50/40"
                : "border-black/15 bg-white hover:border-brand-300 hover:bg-brand-50/40",
          )}
        >
          {state === "busy" ? (
            <Loader2 className="size-6 animate-spin text-brand-600" />
          ) : (
            <span className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600">
              <Camera className="size-5" />
            </span>
          )}
          <span className="text-sm font-medium text-brand-800">
            {state === "busy" ? "Processing photo…" : "Take a photo or upload"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-black/45">
            <ImageUp className="size-3.5" /> Tap to open camera · or drag an image
          </span>
        </label>
      )}

      {error ? (
        <p className="text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-black/45">{hint}</p>
      ) : null}

      <input
        ref={inputRef}
        id={id}
        type="file"
        name={name}
        accept="image/*"
        capture="environment"
        onChange={() => void handleFiles()}
        className="sr-only"
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
