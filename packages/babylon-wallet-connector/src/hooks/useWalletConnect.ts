import { useCallback, useMemo } from "react";

import { useChainProviders } from "@/context/Chain.context";
import type { ChainId } from "@/core/types";

import { useWidgetState } from "./useWidgetState";

export function useWalletConnect() {
  const {
    confirmed,
    chains: chainMap,
    requiredChainIds,
    selectedWallets,
    open: openModal,
    displayChains,
    displayWallets,
    reset,
  } = useWidgetState();
  const connectors = useChainProviders();

  const open = useCallback(
    (chain?: ChainId) => {
      if (chain && chainMap[chain]) {
        displayWallets?.(chain);
      } else {
        displayChains?.();
      }
      openModal?.();
    },
    [chainMap, displayChains, displayWallets, openModal],
  );

  const disconnect = useCallback(
    async (chain?: ChainId) => {
      if (chain) {
        await connectors[chain]?.disconnect();
        return;
      }

      for (const connector of Object.values(connectors)) {
        if (!connector) continue;

        await connector.disconnect();
      }

      reset?.();
    },
    [connectors, reset],
  );

  const selected = useMemo(() => {
    return requiredChainIds.every((chainId) => Boolean(selectedWallets[chainId]));
  }, [requiredChainIds, selectedWallets]);

  return {
    selected,
    connected: selected && confirmed,
    open,
    disconnect,
  };
}
