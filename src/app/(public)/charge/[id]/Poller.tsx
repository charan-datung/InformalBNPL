"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a charge is pending, refresh the server component so the seller sees
 *  "Approved" the instant the buyer authorizes — no manual reload. */
export default function Poller({ active, ms = 3500 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
