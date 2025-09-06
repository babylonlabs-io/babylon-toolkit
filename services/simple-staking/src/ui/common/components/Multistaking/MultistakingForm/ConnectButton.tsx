import { Button } from "@babylonlabs-io/core-ui";

import { useBTCWallet } from "@/ui/common/context/wallet/BTCWalletProvider";
import { useStakingState } from "@/ui/common/state/StakingState";

export function ConnectButton() {
  const { open } = useBTCWallet();
  const { blocked: isGeoBlocked } = useStakingState();

  return (
    <Button onClick={open} className={"mt-2 w-full"} disabled={isGeoBlocked}>
      Connect Wallet
    </Button>
  );
}
