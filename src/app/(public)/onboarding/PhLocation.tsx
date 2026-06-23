"use client";

import { useState } from "react";
import { PROVINCES, CITIES_BY_PROVINCE } from "@/lib/profiles/ph-locations";

/**
 * Cascading province → city/municipality selects (PSGC data, bundled). The city
 * list is driven by the chosen province and resets when the province changes.
 * Field names are configurable so the same control works on the buyer form
 * (province/city) and the seller form (storefront_province/storefront_city).
 */
export default function PhLocation({
  inputClassName,
  required,
  provinceName = "province",
  cityName = "city",
  defaultProvince,
  defaultCity,
}: {
  inputClassName: string;
  required?: boolean;
  provinceName?: string;
  cityName?: string;
  defaultProvince?: string;
  defaultCity?: string;
}) {
  const [province, setProvince] = useState(defaultProvince ?? "");
  const cities = CITIES_BY_PROVINCE[province] ?? [];

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Province</span>
        <select
          name={provinceName}
          required={required}
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className={inputClassName}
        >
          <option value="" disabled>
            Choose…
          </option>
          {PROVINCES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">City/Municipality</span>
        {/* key={province} remounts the select so the old city can't linger. */}
        <select
          key={province}
          name={cityName}
          required={required}
          disabled={!province}
          defaultValue={province === (defaultProvince ?? "") ? defaultCity ?? "" : ""}
          className={inputClassName}
        >
          <option value="" disabled>
            {province ? "Choose…" : "Select province first"}
          </option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
