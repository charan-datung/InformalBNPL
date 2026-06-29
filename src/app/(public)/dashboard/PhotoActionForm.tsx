"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import FileUpload from "@/components/ui/FileUpload";
import { Field, Textarea } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";

/**
 * A small form whose action requires a photo (mark-as-shipped proof, report-a-
 * problem evidence). The required photo is enforced in JS by keeping the submit
 * disabled until a file is added — a visually-hidden required file input can't be
 * focused for native validation. An optional reason textarea uses native
 * required. Submits to the given server action with the hidden loanId.
 */
export default function PhotoActionForm({
  action,
  loanId,
  fileName,
  fileLabel,
  fileHint,
  withReason,
  reasonPlaceholder,
  submitLabel,
  pendingLabel,
  variant = "primary",
  redirectTo,
}: {
  action: (formData: FormData) => void | Promise<void>;
  loanId: string;
  fileName: string;
  fileLabel: string;
  fileHint?: string;
  withReason?: boolean;
  reasonPlaceholder?: string;
  submitLabel: string;
  pendingLabel: string;
  variant?: "primary" | "danger";
  /** Optional internal path to return to (with ?ok/?error); defaults server-side. */
  redirectTo?: string;
}) {
  const [filled, setFilled] = useState(false);
  return (
    <form action={action} encType="multipart/form-data" className="space-y-3">
      <input type="hidden" name="loanId" value={loanId} />
      {redirectTo ? (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      ) : null}
      {withReason ? (
        <Field label="What went wrong?">
          <Textarea name="reason" required rows={2} placeholder={reasonPlaceholder} />
        </Field>
      ) : null}
      <FileUpload
        name={fileName}
        label={fileLabel}
        hint={fileHint}
        onFilledChange={setFilled}
      />
      <Submit
        disabled={!filled}
        label={submitLabel}
        pendingLabel={pendingLabel}
        variant={variant}
      />
    </form>
  );
}

function Submit({
  disabled,
  label,
  pendingLabel,
  variant,
}: {
  disabled: boolean;
  label: string;
  pendingLabel: string;
  variant: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={buttonClasses({ variant, className: "w-full sm:w-auto" })}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> {pendingLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}
