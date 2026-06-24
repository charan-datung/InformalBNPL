"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for an operator OCR action. It lives inside the review <form>
 * (whose main action is approve/reject) and overrides the target via
 * formAction. useFormStatus tells us the form is submitting *and* which action
 * is running, so only the clicked button shows the spinner while the (slow,
 * server-side) OCR runs — the rest disable to prevent double-runs. Without this
 * the click had no feedback and looked broken during the 10–60s run.
 */
export default function OcrButton({
  action,
  children,
  pendingText = "Running OCR…",
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending, action: active } = useFormStatus();
  const isMe = pending && active === action;
  return (
    <button
      type="submit"
      formAction={action}
      disabled={pending}
      aria-busy={isMe}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {isMe ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
