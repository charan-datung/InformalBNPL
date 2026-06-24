"use client";

import ErrorState from "@/components/brand/ErrorState";

export default function PublicError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState {...props} homeHref="/dashboard" />;
}
