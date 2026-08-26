import { forwardRef } from "react";
import { Button, type ButtonProps } from "./Button";
import { twJoin } from "tailwind-merge";

export interface WalletDisconnectButtonProps extends Omit<ButtonProps, "color" | "variant"> {
  className?: string;
}

export const WalletDisconnectButton = forwardRef<HTMLButtonElement, WalletDisconnectButtonProps>(
  ({ className, ...props }, ref) => {
    return (
      <Button
        {...props}
        ref={ref}
        variant="contained"
        className={twJoin(
          "!bg-error-main text-white font-medium !text-sm hover:!bg-error-main/90 transition-colors",
          className
        )}
      />
    );
  }
);

WalletDisconnectButton.displayName = "WalletDisconnectButton"; 