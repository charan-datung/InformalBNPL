"use client";

import { useEffect, useRef, useState } from "react";
import { Contact, Check } from "lucide-react";

/**
 * Optional "import from contacts" helper for the two character-reference fields.
 *
 * IMPORTANT — what the web platform actually permits: there is NO API for a web
 * app to read a phone's contact list in bulk or in the background. The only
 * access is the Contact Picker API (`navigator.contacts.select`), where the OS
 * shows its own picker and the USER hand-selects which entries to share, one by
 * one. That's the consented, voluntary model — and it's Chromium-on-Android
 * only. So this button renders ONLY where the picker exists, and silently does
 * nothing everywhere else; the reference fields stay typeable by hand.
 *
 * When the user picks contacts we fill the existing ref1/ref2 inputs and flip a
 * hidden contacts_consent flag so the server can record the voluntary import.
 */

type PickedContact = { name?: string[]; tel?: string[] };
type ContactsManager = {
  select: (
    props: string[],
    opts?: { multiple?: boolean },
  ) => Promise<PickedContact[]>;
};

export default function ImportContacts() {
  const [supported, setSupported] = useState(false);
  const [used, setUsed] = useState(false);
  const [status, setStatus] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Feature-detect after mount: the Contact Picker only exists in the browser
    // (Chromium/Android), never during SSR. A one-shot setState here is the
    // standard capability-probe pattern, not reactive state syncing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(
      typeof navigator !== "undefined" &&
        "contacts" in navigator &&
        "ContactsManager" in window,
    );
  }, []);

  function setField(form: HTMLFormElement, name: string, value: string) {
    const el = form.elements.namedItem(name) as HTMLInputElement | null;
    if (!el) return;
    el.value = value;
    // Nudge React (in case the input is ever made controlled) + mark touched.
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function pick() {
    const mgr = (navigator as Navigator & { contacts?: ContactsManager })
      .contacts;
    if (!mgr) return;
    try {
      const picked = await mgr.select(["name", "tel"], { multiple: true });
      const form = anchorRef.current?.closest("form");
      if (!form || picked.length === 0) return;

      picked.slice(0, 2).forEach((c, i) => {
        const slot = i + 1; // ref1_*, ref2_*
        setField(form, `ref${slot}_name`, c.name?.[0] ?? "");
        setField(form, `ref${slot}_contact`, c.tel?.[0] ?? "");
      });

      setUsed(true);
      setStatus(
        picked.length > 1
          ? "Imported 2 references from your contacts ✓"
          : "Imported 1 reference from your contacts ✓",
      );
    } catch {
      /* user dismissed the picker — nothing to do */
    }
  }

  if (!supported) return <div ref={anchorRef} className="hidden" />;

  return (
    <div ref={anchorRef} className="space-y-1.5">
      <input
        type="hidden"
        name="contacts_consent"
        value={used ? "yes" : ""}
        readOnly
      />
      <button
        type="button"
        onClick={pick}
        className="flex items-center gap-1.5 rounded-md border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-800 hover:bg-brand-50 dark:border-white/15 dark:text-white"
      >
        {used ? (
          <Check className="size-3.5 text-green-600" />
        ) : (
          <Contact className="size-3.5" />
        )}
        Pick references from your contacts
      </button>
      {status ? (
        <span className="block text-xs text-black/55 dark:text-white/55">
          {status}
        </span>
      ) : null}
      <span className="block text-[11px] text-black/45 dark:text-white/45">
        You choose exactly who to share — we never read your whole contact list.
      </span>
    </div>
  );
}
