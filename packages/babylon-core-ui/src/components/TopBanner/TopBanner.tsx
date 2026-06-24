import { twJoin } from "tailwind-merge";
import { CloseIcon } from "../Icons";
import { Text } from "../Text";
import "./TopBanner.css";

export interface TopBannerProps {
  /**
   * Whether the banner is visible
   */
  visible: boolean;
  /**
   * Banner message text
   */
  message: string;
  /**
   * Callback when banner is clicked. Omit for a non-interactive banner — the
   * banner then drops its `button` role and pointer affordance.
   */
  onClick?: () => void;
  /**
   * Callback when banner is dismissed. Omit to render a non-dismissible banner
   * (no close button) — e.g. a critical alert the user must not be able to hide.
   */
  onDismiss?: () => void;
  /**
   * Optional custom className
   */
  className?: string;
  /**
   * Optional custom icon
   */
  icon?: React.ReactNode;
}

export const TopBanner = ({
  visible,
  message,
  onClick,
  onDismiss,
  className,
  icon,
}: TopBannerProps) => {
  if (!visible) {
    return null;
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss?.();
  };

  const isClickable = Boolean(onClick);

  return (
    <div
      className={twJoin(
        "bbn-top-banner",
        !isClickable && "!cursor-default",
        className,
      )}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="bbn-top-banner-content">
        {icon}
        <Text variant="body2" className="bbn-top-banner-message">
          {message}
        </Text>
      </div>
      {onDismiss && (
        <button
          onClick={handleDismiss}
          className="bbn-top-banner-dismiss-btn"
          aria-label="Dismiss banner"
          type="button"
        >
          <CloseIcon size={16} className="bbn-top-banner-dismiss-icon" />
        </button>
      )}
    </div>
  );
};
