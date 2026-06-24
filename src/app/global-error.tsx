"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the root layout itself (where the
 * normal error.tsx boundaries can't catch). Must render its own <html>/<body>
 * because it replaces the root layout. Plain inline styles only — the app's CSS
 * may not be available at this level.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          color: "#0e4d45",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          Something went wrong
        </h1>
        <p style={{ maxWidth: "28rem", color: "#555", fontSize: "0.875rem" }}>
          The app hit an unexpected error. Please try again.
          {error.digest ? ` (Reference: ${error.digest})` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#0e4d45",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
