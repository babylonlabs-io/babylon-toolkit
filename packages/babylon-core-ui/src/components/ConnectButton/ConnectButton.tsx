import { PiWalletBold } from "react-icons/pi";

import { Button } from "../Button";

export interface ConnectButtonProps {
  loading?: boolean;
  connected?: boolean;
  onClick: () => void;
  text?: string;
  loadingText?: string;
  className?: string;
  disabled?: boolean;
}

export const ConnectButton: React.FC<ConnectButtonProps> = ({
  loading = false,
  connected = false,
  onClick,
  text = "Connect",
  loadingText = "Loading...",
  className,
  disabled = false,
}) => {
  if (connected) {
    return null;
  }

  return (
    <Button
      size="large"
      className={className || "h-[2.5rem] min-h-[2.5rem] rounded-full px-6 py-2 text-base text-white md:rounded"}
      onClick={onClick}
      color="secondary"
      disabled={disabled || loading}
      data-testid="connect-wallet-button"
    >
      <PiWalletBold size={20} className="flex md:hidden" />
      <span className="hidden md:flex">
        {loading ? loadingText : text}
      </span>
    </Button>
  );
};

