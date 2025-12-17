/**
 * InfoIcon Component
 * Displays an info icon for tooltips and help text
 */

interface InfoIconProps {
  className?: string;
}

export function InfoIcon({ className = "" }: InfoIconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block cursor-help opacity-50 ${className}`}
    >
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1" />
      <path
        d="M7 10V6.5M7 4.5H7.005"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
