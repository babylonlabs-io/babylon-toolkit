import { Button } from "@babylonlabs-io/core-ui";

import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";

interface ConnectButtonProps {
  disabled?: boolean;
}

export function ConnectButton({ disabled }: ConnectButtonProps) {
  const { open } = useBTCWallet();

  return (
    <Button
      type="button"
      onClick={open}
      className="mt-2 w-full"
      disabled={disabled}
    >
      Connect Wallet
    </Button>
  );
}
