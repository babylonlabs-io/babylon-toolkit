import { useCallback, useMemo } from "react";

import type { IChain } from "@/core/types";
// Connector ids come from the shared constants module, not from each chain's
// wallet metadata — importing the metadata here would put every Bitcoin wallet
// adapter into the `./eth` graph, since this screen is part of the dialog.
import { useChainProviders } from "@/context/Chain.context";
import { APPKIT_BTC_CONNECTOR_ID, APPKIT_ETH_CONNECTOR_ID, APPKIT_OPEN_EVENT } from "@/core/wallets/appkit/constants";
import { ethDisconnectWouldDropBitcoin } from "@/core/wallets/eth/appkit/sharedConfig";
import { isSharedSessionRefusal } from "@/error";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Chains } from "./index";

// AppKit's connectWallet() no-ops when the chain is already connected, so an
// already-connected AppKit row would do nothing on click. Reopening the modal
// directly lets the user switch accounts or disconnect to pick another wallet.
// (Switching/disconnecting triggers the vault's reset-both-wallets policy.)
function openAppKitModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APPKIT_OPEN_EVENT));
  }
}

interface ContainerProps {
  className?: string;
  onConfirm?: () => void;
}

export function ChainsContainer(props: ContainerProps) {
  const { chains, requiredChainIds, selectedWallets, displayWallets } = useWidgetState();
  const { selected, disconnect } = useWalletConnect();
  const connectors = useChainProviders();

  const chainArr = useMemo(() => Object.values(chains), [chains]);

  const handleSelectChain = useCallback(
    async (chain: IChain) => {
      if (chain.id === "ETH" || chain.id === "BTC") {
        const connector = connectors[chain.id];
        const appkitId = chain.id === "ETH" ? APPKIT_ETH_CONNECTOR_ID : APPKIT_BTC_CONNECTOR_ID;
        const wallet = connector?.wallets.find((candidate) => candidate.id === appkitId);
        if (wallet && connector?.wallets.length === 1) {
          const connected = Boolean(connector.connectedWallet);
          try {
            if (!connected) {
              await connector.connect(wallet.id);
            } else if (chain.id === "ETH" && !ethDisconnectWouldDropBitcoin()) {
              openAppKitModal();
            } else {
              await disconnect(chain.id);
            }
          } catch (error) {
            if (!isSharedSessionRefusal(error)) {
              console.error(
                `Failed to ${connected ? "disconnect" : "connect"} AppKit ${chain.id}:`,
                error instanceof Error ? error.message : "Unknown error",
              );
            }
          }
          return;
        }
      }

      // Normal flow for other chains or if chain has multiple wallets
      displayWallets?.(chain.id);
    },
    [displayWallets, connectors, disconnect],
  );

  return (
    <Chains
      disabled={!selected}
      chains={chainArr}
      requiredChainIds={requiredChainIds}
      selectedWallets={selectedWallets}
      onSelectChain={handleSelectChain}
      {...props}
    />
  );
}
