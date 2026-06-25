"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type WizardStep = {
  id: string;
  /** Short title shown in the progress header. */
  title: string;
  /** The fields for this step. Always mounted (hidden when inactive) so every
   *  field is included in the single form submit. */
  render: React.ReactNode;
  /** Optional extra validation beyond native constraints (e.g. a required photo
   *  enforced in JS). Return false to block advancing. */
  validate?: () => boolean;
};

/**
 * Multi-step form shell. Lives inside ONE <form>; steps are divs toggled with
 * `hidden`, so the underlying server action still receives a single FormData
 * with every field. Advancing runs native constraint validation on the visible
 * step's controls (file inputs excepted — see WizardStep.validate) plus any
 * custom validator, so users can't skip past missing required fields.
 */
export default function Wizard({
  steps,
  submitLabel,
  pendingLabel = "Submitting…",
}: {
  steps: WizardStep[];
  submitLabel: string;
  pendingLabel?: string;
}) {
  const [index, setIndex] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const topRef = useRef<HTMLDivElement>(null);
  const last = index === steps.length - 1;
  const step = steps[index];

  function validateCurrent(): boolean {
    const el = stepRefs.current[index];
    if (el) {
      const controls = el.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea");
      for (const c of controls) {
        if (c.type === "file") continue; // enforced via step.validate
        if (!c.checkValidity()) {
          c.reportValidity();
          return false;
        }
      }
    }
    return step.validate ? step.validate() : true;
  }

  function next() {
    if (!validateCurrent()) return;
    setIndex((i) => Math.min(i + 1, steps.length - 1));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function back() {
    setIndex((i) => Math.max(i - 1, 0));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <div ref={topRef} className="scroll-mt-4" />

      {/* Progress header */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-medium text-black/50">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <span className="text-brand-700">{step.title}</span>
        </div>
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < index
                  ? "bg-brand-500"
                  : i === index
                    ? "bg-brand-600"
                    : "bg-black/10",
              )}
            />
          ))}
        </div>
      </div>

      {/* Steps — all mounted, only the active one shown */}
      {steps.map((s, i) => (
        <div
          key={s.id}
          ref={(node) => {
            stepRefs.current[i] = node;
          }}
          hidden={i !== index}
          className="space-y-5"
        >
          {s.render}
        </div>
      ))}

      {/* Navigation */}
      <div className="flex items-center gap-3 pt-1">
        {index > 0 ? (
          <button
            type="button"
            onClick={back}
            className={buttonClasses({ variant: "secondary", size: "lg" })}
          >
            <ArrowLeft className="size-4" /> Back
          </button>
        ) : null}

        {last ? (
          <WizardSubmit pendingLabel={pendingLabel}>{submitLabel}</WizardSubmit>
        ) : (
          <button
            type="button"
            onClick={next}
            className={buttonClasses({ size: "lg", className: "flex-1" })}
          >
            Continue <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function WizardSubmit({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClasses({ size: "lg", className: "flex-1" })}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> {pendingLabel}
        </>
      ) : (
        <>
          <Check className="size-4" /> {children}
        </>
      )}
    </button>
  );
}
