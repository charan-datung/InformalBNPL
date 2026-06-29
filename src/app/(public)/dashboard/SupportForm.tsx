"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LifeBuoy, Loader2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Callout from "@/components/ui/Callout";
import { Field, TextInput, Textarea } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/Button";
import {
  submitSupportAction,
  type ActionState,
} from "@/app/(public)/dashboard/profile-actions";

/**
 * "Contact support" card on the buyer/seller profile. Posts to the operator
 * console (support_requests). `context` tags which surface it came from.
 */
export default function SupportForm({
  context,
  defaultContact,
}: {
  context: "buyer" | "seller";
  defaultContact?: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    submitSupportAction,
    {},
  );

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <LifeBuoy className="size-4.5" />
        </span>
        <div>
          <h3 className="font-semibold leading-tight">Contact support</h3>
          <p className="text-xs text-black/50">
            Send us a message — our team will get back to you.
          </p>
        </div>
      </div>

      {state.ok ? (
        <Callout tone="success" title="Message sent">
          Thanks — we received your message and will reach out soon.
        </Callout>
      ) : null}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="context" value={context} />
        {state.error ? <Callout tone="error">{state.error}</Callout> : null}
        <Field label="Subject" optional>
          <TextInput name="subject" placeholder="What's this about?" />
        </Field>
        <Field label="Message">
          <Textarea
            name="message"
            required
            placeholder="Tell us what you need help with…"
          />
        </Field>
        <Field label="Best way to reach you" optional>
          <TextInput
            name="contact"
            defaultValue={defaultContact ?? ""}
            placeholder="Mobile or messenger"
            inputMode="tel"
          />
        </Field>
        <SubmitButton />
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClasses({ className: "min-w-32" })}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Sending…
        </>
      ) : (
        "Send message"
      )}
    </button>
  );
}
