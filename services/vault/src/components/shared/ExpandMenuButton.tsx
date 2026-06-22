interface ExpandMenuButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  "aria-label"?: string;
  /**
   * Visual style of the toggle.
   * - "default": compact white chevron with a hover background — dashboard section toggles.
   * - "muted": larger, secondary-colored chevron with no hover — Activity detail cards.
   */
  variant?: "default" | "muted";
}

const VARIANT_CLASSES: Record<
  NonNullable<ExpandMenuButtonProps["variant"]>,
  { button: string; iconSize: number; iconColor: string }
> = {
  default: {
    button:
      "rounded p-1 transition-colors hover:bg-secondary-highlight dark:hover:bg-primary-main",
    iconSize: 20,
    iconColor: "text-accent-primary",
  },
  muted: {
    button: "rounded-lg p-2",
    iconSize: 24,
    iconColor: "text-accent-secondary",
  },
};

export function ExpandMenuButton({
  isExpanded,
  onToggle,
  "aria-label": ariaLabel = "Toggle details",
  variant = "default",
}: ExpandMenuButtonProps) {
  const { button, iconSize, iconColor } = VARIANT_CLASSES[variant];
  return (
    <button
      type="button"
      onClick={onToggle}
      className={button}
      aria-label={ariaLabel}
      aria-expanded={isExpanded}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconColor} transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
