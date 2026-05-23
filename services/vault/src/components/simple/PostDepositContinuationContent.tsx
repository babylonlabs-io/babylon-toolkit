import { useMemo } from "react";
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

  const scoped = useMemo(() => {
    const ids = new Set<string>(vaultIds);
    return {
      activities: activities.filter((a) => ids.has(a.id)),
      pendingPegins: pendingPegins.filter((p) => ids.has(p.id)),
    };
  }, [vaultIds, activities, pendingPegins]);

  return (
    <PeginPollingProvider
      activities={scoped.activities}
      pendingPegins={scoped.pendingPegins}
      btcPublicKey={btcPublicKey}
    >
      <PostDepositContinuationView
        vaultIds={vaultIds}
        activities={scoped.activities}
        depositorEthAddress={depositorEthAddress}
        btcPublicKey={btcPublicKey}
        onClose={onClose}
      />
    </PeginPollingProvider>
  );
}
