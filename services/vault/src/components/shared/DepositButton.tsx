import { Button, Hint } from "@babylonlabs-io/core-ui";
import type { ComponentProps } from "react";

import { useAddressType } from "@/context/addressType";

interface DepositButtonProps
  extends Omit<ComponentProps<typeof Button>, "disabled"> {
  /** Additional disabled conditions beyond address type check */
  disabled?: boolean;
}

/**
 * Deposit button that handles Taproot address requirement.
 * Shows disabled state with tooltip when wallet is not using a Taproot address.
 */
export function DepositButton({
  disabled = false,
  children,
  ...props
}: DepositButtonProps) {
  const { isSupportedAddress } = useAddressType();

  const isDisabled = disabled || !isSupportedAddress;

  if (!isSupportedAddress) {
    return (
      <Hint
        tooltip="Taproot address required. Please switch your wallet to use a Taproot address."
        attachToChildren
      >
        <span>
          <Button {...props} disabled>
            {children}
          </Button>
        </span>
      </Hint>
    );
  }

  return (
    <Button {...props} disabled={isDisabled}>
      {children}
    </Button>
  );
}
