/** Format integer centavos as PHP currency. Money is stored in centavos. */
export function formatPeso(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(centavos / 100);
}

/** Format an ISO timestamp for the dense operator tables. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
