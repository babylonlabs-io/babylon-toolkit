import { useCallback, useMemo } from "react";

import { useChainProviders } from "@/context/Chain.context";

import { useWidgetState } from "./useWidgetState";

export function useWalletConnect() {
  const { confirmed, chains: chainMap, selectedWallets, open: openModal, reset } = useWidgetState();
  const connectors = useChainProviders();

  const open = useCallback(() => {
    reset?.();
    openModal?.();
  }, [openModal, reset]);

  const disconnect = useCallback(async () => {
    for (const connector of Object.values(connectors)) {
      if (!connector) continue;

      await connector.disconnect();
    }

    reset?.();
  }, [connectors, reset]);

  const selected = useMemo(() => {
    const chains = Object.values(chainMap).filter(Boolean);
    const result = chains.map((chain) => selectedWallets[chain.id]);

    return result.every(Boolean);
  }, [chainMap, selectedWallets]);

  return {
    selected,
    connected: selected && confirmed,
    open,
    disconnect,
  };
}
