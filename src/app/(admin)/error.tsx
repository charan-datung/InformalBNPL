"use client";

import ErrorState from "@/components/brand/ErrorState";

export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState {...props} homeHref="/admin" />;
}
