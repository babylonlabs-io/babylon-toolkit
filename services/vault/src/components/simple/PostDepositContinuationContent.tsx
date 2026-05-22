import type { Address, Hex } from "viem";

import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { useBTCWallet } from "@/context/wallet";
import { useBtcPublicKey } from "@/hooks/useBtcPublicKey";
import { useVaultDeposits } from "@/hooks/useVaultDeposits";

import { PostDepositContinuationView } from "./PostDepositContinuationView";

interface PostDepositContinuationContentProps {
  vaultIds: Hex[];
  depositorEthAddress: Address;
  onClose: () => void;
}

export function PostDepositContinuationContent({
  vaultIds,
  depositorEthAddress,
  onClose,
}: PostDepositContinuationContentProps) {
  const { connected: btcConnected } = useBTCWallet();
  const btcPublicKey = useBtcPublicKey(btcConnected);
  const { activities, pendingPegins } = useVaultDeposits(depositorEthAddress);

  return (
    <PeginPollingProvider
      activities={activities}
      pendingPegins={pendingPegins}
      btcPublicKey={btcPublicKey}
    >
      <PostDepositContinuationView
        vaultIds={vaultIds}
        activities={activities}
        depositorEthAddress={depositorEthAddress}
        btcPublicKey={btcPublicKey}
        onClose={onClose}
      />
    </PeginPollingProvider>
  );
}
