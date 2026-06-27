"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Pencil, X } from "lucide-react";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";
import type { ActionState } from "@/app/(public)/dashboard/profile-actions";

/**
 * An inline, editable profile card. Shows a clean read view of the user's
 * details with an "Edit" affordance; editing swaps in a form bound to a server
 * action via useActionState, so saving happens in place (the page revalidates
 * and the new values flow back through props). Underwriting-controlled facts are
 * passed as `readOnly` rows and never become inputs.
 */

export type EditableField = {
  name: string;
  label: string;
  value: string | null;
  placeholder?: string;
  optional?: boolean;
  type?: string;
  inputMode?: "text" | "url" | "tel";
};

export type ReadOnlyRow = {
  label: string;
  value: ReactNode;
};

export default function ProfileEditor({
  title,
  icon,
  description,
  fields,
  readOnly = [],
  action,
}: {
  title: string;
  // A RENDERED icon element (e.g. <User />), not the component — a server parent
  // cannot pass a component function across the client boundary.
  icon: ReactNode;
  description?: string;
  fields: EditableField[];
  readOnly?: ReadOnlyRow[];
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  // On a successful save, close the editor and flash a confirmation. We adjust
  // state during render (React's recommended alternative to an effect) by
  // reacting to a new action result — the fresh values arrive via props after
  // revalidation, so the read view is already up to date.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.ok) {
      setEditing(false);
      setSaved(true);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:size-4.5">
            {icon}
          </span>
          <div>
            <h3 className="font-semibold leading-tight">{title}</h3>
            {description ? (
              <p className="text-xs text-black/50">{description}</p>
            ) : null}
          </div>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setSaved(false);
            }}
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "shrink-0",
            })}
          >
            <Pencil className="size-3.5" /> Edit
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="grid size-9 shrink-0 place-items-center rounded-xl text-black/40 transition-colors hover:bg-black/[0.04] hover:text-black/70"
            aria-label="Cancel editing"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {saved && !editing ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-700">
          <Check className="size-3.5" /> Saved
        </p>
      ) : null}

      {editing ? (
        <form action={formAction} className="space-y-3">
          {state.error ? <Callout tone="error">{state.error}</Callout> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.name} label={f.label} optional={f.optional}>
                <TextInput
                  name={f.name}
                  type={f.type ?? "text"}
                  inputMode={f.inputMode}
                  defaultValue={f.value ?? ""}
                  placeholder={f.placeholder}
                  required={!f.optional}
                />
              </Field>
            ))}
          </div>
          <div className="flex gap-2">
            <SaveButton />
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={buttonClasses({ variant: "ghost", size: "md" })}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="divide-y divide-black/5 text-sm">
          {fields.map((f) => (
            <Row key={f.name} label={f.label}>
              {f.value ? (
                <span className="text-foreground">{f.value}</span>
              ) : (
                <span className="text-black/35">Not set</span>
              )}
            </Row>
          ))}
          {readOnly.map((r) => (
            <Row key={r.label} label={r.label}>
              {r.value}
            </Row>
          ))}
        </dl>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-black/50">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClasses({ className: "min-w-28" })}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Saving…
        </>
      ) : (
        "Save changes"
      )}
    </button>
  );
}
