/**
 * EmptyStateIcon
 * Document-with-magnifier line illustration used by the v3 empty states
 * (Loans / Activity "nothing here yet"). Strokes use `currentColor` so the
 * color follows the surrounding text color in both themes.
 */

interface EmptyStateIconProps {
  className?: string;
}

export function EmptyStateIcon({ className = "" }: EmptyStateIconProps) {
  return (
    <svg
      width="72"
      height="78"
      viewBox="0 0 72 78"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`text-accent-secondary ${className}`}
      aria-hidden="true"
    >
      {/* Document sheet with a folded top-right corner */}
      <path
        d="M12 3H41L59 21V63C59 65.2091 57.2091 67 55 67H12C9.79086 67 8 65.2091 8 63V7C8 4.79086 9.79086 3 12 3Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M41 3V19C41 20.1046 41.8954 21 43 21H59"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Text lines */}
      <path
        d="M18 31H40M18 40H34"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Magnifier at the lower-right */}
      <circle
        cx="47"
        cy="52"
        r="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M57.5 62.5L66 71"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
