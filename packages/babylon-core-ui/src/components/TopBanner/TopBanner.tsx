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
   * Callback when banner is clicked
   */
  onClick: () => void;
  /**
   * Callback when banner is dismissed
   */
  onDismiss: () => void;
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
    onDismiss();
  };

  return (
    <div
      className={twJoin("bbn-top-banner", className)}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="bbn-top-banner-content">
        {icon}
        <Text variant="body2" className="bbn-top-banner-message">
          {message}
        </Text>
      </div>
      <button
        onClick={handleDismiss}
        className="bbn-top-banner-dismiss-btn"
        aria-label="Dismiss banner"
        type="button"
      >
        <CloseIcon size={16} className="bbn-top-banner-dismiss-icon" />
      </button>
    </div>
  );
};
