"use client";

import ErrorState from "@/components/brand/ErrorState";

export default function OperatorError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState {...props} homeHref="/operator" />;
}
