import { type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export interface NotificationAction {
  label: ReactNode;
  /** Required so an action pill always does something when activated. */
  onClick: () => void;
  /**
   * `primary` = filled with the variant accent color; `secondary` = outlined.
   * Defaults to `primary`.
   */
  emphasis?: "primary" | "secondary";
  disabled?: boolean;
}

const ACTION_BASE =
  "rounded-full px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export interface NotificationActionButtonProps {
  action: NotificationAction;
  /** Background applied to a `primary` action (the variant accent). */
  accentBg: string;
  /** Foreground that sits on `accentBg` for a `primary` action. */
  onAccent: string;
}

export function NotificationActionButton({
  action,
  accentBg,
  onAccent,
}: NotificationActionButtonProps) {
  const { label, emphasis = "primary", onClick, disabled } = action;
  const styles =
    emphasis === "primary"
      ? twMerge(ACTION_BASE, accentBg, onAccent, "hover:opacity-90")
      : twMerge(
          ACTION_BASE,
          "border border-secondary-strokeLight text-accent-primary hover:bg-neutral-200",
        );

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={styles}
    >
      {label}
    </button>
  );
}
