/**
 * Government-ID number checks. Deliberately lenient — they catch obvious typos
 * (wrong length / wrong characters) without rejecting valid cards, since an
 * over-strict rule would block real applicants during the pilot. Separators
 * (spaces, dashes) are ignored. Keyed to the buyer ID_TYPES labels; "Other" and
 * anything unmapped just require a few characters. The ID photo + (later) OCR
 * are the real verification.
 */

const digits = (v: string) => v.replace(/\D/g, "");
const alnum = (v: string) => v.replace(/[^A-Za-z0-9]/g, "");
const compact = (v: string) => v.replace(/[\s-]/g, "");

type Rule = { hint: string; ok: (v: string) => boolean };

export const ID_RULES: Record<string, Rule> = {
  "PhilSys (National ID)": { hint: "16 digits", ok: (v) => /^\d{16}$/.test(digits(v)) },
  UMID: { hint: "12-digit CRN", ok: (v) => /^\d{12}$/.test(digits(v)) },
  "SSS/GSIS ID": { hint: "10–11 digits", ok: (v) => /^\d{10,11}$/.test(digits(v)) },
  "PRC ID": { hint: "7 digits", ok: (v) => /^\d{7}$/.test(digits(v)) },
  "Driver's License": {
    hint: "e.g. N01-23-456789 (11 letters/digits)",
    ok: (v) => /^[A-Za-z0-9]{11}$/.test(alnum(v)),
  },
  Passport: {
    hint: "e.g. P1234567A",
    ok: (v) => /^[A-Za-z]{1,2}\d{6,7}[A-Za-z]?$/.test(compact(v)),
  },
  "Voter's ID": { hint: "numeric (10–22 digits)", ok: (v) => /^\d{10,22}$/.test(digits(v)) },
  "Postal ID": { hint: "alphanumeric", ok: (v) => /^[A-Za-z0-9]{8,16}$/.test(alnum(v)) },
};

/** Expected-format hint for an ID type, or "" if unconstrained. */
export function idHint(idType: string): string {
  return ID_RULES[idType]?.hint ?? "";
}

/** Returns an error message if the number is wrong for the type, else null. */
export function validateIdNumber(idType: string, raw: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return "ID number is required.";
  const rule = ID_RULES[idType];
  if (!rule) return v.length >= 4 ? null : "Enter a valid ID number.";
  return rule.ok(v) ? null : `That doesn't look like a valid ${idType} (${rule.hint}).`;
}
