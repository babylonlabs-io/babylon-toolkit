import { useCallback, useMemo } from "react";

import type { IChain } from "@/core/types";
import { APPKIT_BTC_CONNECTOR_ID } from "@/core/wallets/btc/appkit";
import { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/eth/appkit";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { useWidgetState } from "@/hooks/useWidgetState";
import { useChainProviders } from "@/context/Chain.context";

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
  const connectors = useChainProviders();

  const chainArr = useMemo(() => Object.values(chains), [chains]);

  const handleSelectChain = useCallback(
    async (chain: IChain) => {
      // Special handling for ETH chain with only AppKit wallet
      if (chain.id === "ETH") {
        const ethConnector = connectors.ETH;
        const appkitWallet = ethConnector?.wallets.find(w => w.id === APPKIT_ETH_CONNECTOR_ID);

        if (appkitWallet && ethConnector?.wallets.length === 1) {
          // Only AppKit available, connect it directly
          // This will trigger the AppKitProvider.connectWallet() which dispatches the event
          try {
            await ethConnector.connect(appkitWallet);
          } catch (error) {
            console.error("Failed to connect AppKit:", error);
          }
          return;
        }
      }

      // Special handling for BTC chain with only AppKit wallet
      if (chain.id === "BTC") {
        const btcConnector = connectors.BTC;
        const appkitBtcWallet = btcConnector?.wallets.find(w => w.id === APPKIT_BTC_CONNECTOR_ID);

        if (appkitBtcWallet && btcConnector?.wallets.length === 1) {
          // Only AppKit available, connect it directly
          // This will trigger the AppKitBTCProvider.connectWallet() which dispatches the event
          try {
            await btcConnector.connect(appkitBtcWallet);
          } catch (error) {
            console.error("Failed to connect AppKit BTC:", error);
          }
          return;
        }
      }

      // Normal flow for other chains or if chain has multiple wallets
      displayWallets?.(chain.id);
    },
    [displayWallets, connectors],
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
