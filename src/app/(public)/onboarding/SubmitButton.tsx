"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects the form's pending state (useFormStatus): while the
 * application is compressing images + uploading + saving, it disables itself and
 * shows a spinner so a slow submit never looks frozen. Must be rendered inside
 * the <form> it belongs to.
 */
export default function SubmitButton({
  children,
  pendingText = "Submitting…",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
