import { useCallback, useMemo } from "react";

import type { IChain } from "@/core/types";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Chains } from "./index";

interface ContainerProps {
  className?: string;
  onClose?: () => void;
  onConfirm?: () => void;
  onDisconnectWallet?: (chainId: string) => void;
}

export function ChainsContainer(props: ContainerProps) {
  const { chains, selectedWallets, displayWallets } = useWidgetState();
  const { selected } = useWalletConnect();

  const chainArr = useMemo(() => Object.values(chains), [chains]);

  const handleSelectChain = useCallback(
    (chain: IChain) => {
      displayWallets?.(chain.id);
    },
    [displayWallets],
  );

  return (
    <Chains
      disabled={!selected}
      chains={chainArr}
      selectedWallets={selectedWallets}
      onSelectChain={handleSelectChain}
      {...props}
    />
  );
}
