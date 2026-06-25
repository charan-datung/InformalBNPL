"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Multi-select rendered as toggleable chips. Each checked option submits as a
 * repeated `name` value (formData.getAll(name)) — matching the existing buyer
 * form's sell_channels / sourcing handling. Uncontrolled: native checkboxes
 * carry the state, the chip just reflects :checked via peer styling.
 */
export default function CheckboxGroup({
  name,
  options,
  columns = 2,
}: {
  name: string;
  options: readonly string[];
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-2 sm:grid-cols-3",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
      )}
    >
      {options.map((opt) => (
        <label
          key={opt}
          className="group flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm transition-colors has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/70"
        >
          <input type="checkbox" name={name} value={opt} className="sr-only" />
          <span className="grid size-5 shrink-0 place-items-center rounded-md border border-black/20 bg-white text-white transition-colors group-has-[:checked]:border-brand-600 group-has-[:checked]:bg-brand-600">
            <Check
              className="size-3.5 opacity-0 transition-opacity group-has-[:checked]:opacity-100"
              strokeWidth={3}
            />
          </span>
          <span className="min-w-0 truncate text-foreground">{opt}</span>
        </label>
      ))}
    </div>
  );
}
