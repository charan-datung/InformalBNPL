import Link from "next/link";

/**
 * Datung logo mark — inline SVG so it stays crisp at any size and can be tinted
 * for dark headers. `onDark` swaps to a white "d" with brighter accents for use
 * on the brand-teal surfaces.
 */
export function LogoMark({
  className = "h-7 w-auto",
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const body = onDark ? "#ffffff" : "#0e4d45";
  const accent = onDark ? "#34d17e" : "#22c55e";
  const slash = onDark ? "#34d17e" : "#2ed477";
  const gap = onDark ? "#0e4d45" : "#ffffff";
  return (
    <svg
      viewBox="0 0 120 132"
      className={className}
      role="img"
      aria-label="Datung"
    >
      <path
        d="M8 96 A 38 34 0 0 0 74 108"
        fill="none"
        stroke={accent}
        strokeWidth="13"
        strokeLinecap="round"
      />
      <circle cx="30" cy="118" r="3.6" fill={onDark ? "#0e4d45" : "#ffffff"} />
      <path
        d="M90 68 L101 14 q1 -4 4 -3 q3 1 2 5 L96 70 q-1 4 -4 3 q-3 -1 -2 -5 Z"
        fill={slash}
      />
      <path
        d="M106 64 L112 32 q1 -4 4 -3 q3 1 2 5 L108 65 q-1 4 -3 3 q-3 -1 -1 -4 Z"
        fill={slash}
      />
      <path
        d="M66 104 L66 33 C66 15 76 5 88 12 C84 33 83 54 83 70 L83 104 Z"
        fill={body}
      />
      <path
        fillRule="evenodd"
        d="M40 52 a34 34 0 1 0 0 68 a34 34 0 1 0 0 -68 Z M40 71 a15 15 0 1 0 0 30 a15 15 0 1 0 0 -30 Z"
        fill={body}
      />
      <path
        d="M12 74 L40 86"
        fill="none"
        stroke={gap}
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mark + "Datung" wordmark, optionally linked. */
export function Wordmark({
  href,
  onDark = false,
  className = "",
  markClassName = "h-7 w-auto",
}: {
  href?: string;
  onDark?: boolean;
  className?: string;
  markClassName?: string;
}) {
  const inner = (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={markClassName} onDark={onDark} />
      <span
        className={`text-lg font-semibold tracking-tight ${
          onDark ? "text-white" : "text-brand-700 dark:text-brand-200"
        }`}
      >
        Datung
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="inline-flex items-center">
      {inner}
    </Link>
  ) : (
    inner
  );
}
