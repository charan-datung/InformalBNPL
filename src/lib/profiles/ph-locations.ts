import psgc from "./ph-psgc.json";

/**
 * Philippine geography (PSGC) for cascading province → city/municipality
 * dropdowns. Bundled locally (src/lib/profiles/ph-psgc.json) — 84 provinces and
 * 1,627 cities/municipalities, with the four NCR districts merged into a single
 * "Metro Manila (NCR)". No runtime/network dependency.
 */

export const PROVINCES: string[] = psgc.provinces;

export const CITIES_BY_PROVINCE: Record<string, string[]> =
  psgc.citiesByProvince;

export function citiesOf(province: string): string[] {
  return CITIES_BY_PROVINCE[province] ?? [];
}
