interface ExpandMenuButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  "aria-label"?: string;
}

export function ExpandMenuButton({
  isExpanded,
  onToggle,
  "aria-label": ariaLabel = "Toggle details",
}: ExpandMenuButtonProps) {
  return (
    <button
      onClick={onToggle}
      className="rounded p-1 transition-colors hover:bg-secondary-highlight dark:hover:bg-primary-main"
      aria-label={ariaLabel}
      aria-expanded={isExpanded}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`text-accent-primary transition-transform ${isExpanded ? "rotate-180" : ""}`}
      >
        <path
          d="M5 8l5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
