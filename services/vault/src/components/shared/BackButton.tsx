/**
 * BackButton Component
 * A reusable back navigation button with chevron icon
 */

import { Button } from "@babylonlabs-io/core-ui";

interface BackButtonProps {
  label: string;
  onClick: () => void;
  "aria-label"?: string;
}

export function BackButton({
  label,
  onClick,
  "aria-label": ariaLabel,
}: BackButtonProps) {
  return (
    <Button
      variant="ghost"
      color="primary"
      size="medium"
      className="flex items-center gap-3 !px-2"
      onClick={onClick}
      aria-label={ariaLabel || `Back to ${label}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12.5 15L7.5 10L12.5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-base">{label}</span>
    </Button>
  );
}
