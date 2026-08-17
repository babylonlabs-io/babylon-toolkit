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

  /**
   * Opens the wallet dialog, on one chain's wallet list when given a chain.
   *
   * Deliberately does not `reset()`: attaching an optional chain to a session
   * that is already confirmed must not tear that session down. Requirement-set
   * changes are handled separately — `State.context` drops the confirmation
   * when a new required chain appears.
   */
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

  /**
   * Disconnects a single chain, or every chain when called without one.
   *
   * Membership is tested rather than truthiness because React's bivariant
   * handler types let `onClick={disconnect}` pass a MouseEvent in here, which
   * must not be mistaken for a chain and silently skip the disconnect-all path.
   */
  const disconnect = useCallback(
    async (chain?: ChainId) => {
      if (chain !== undefined && Object.prototype.hasOwnProperty.call(connectors, chain)) {
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

  const selected = useMemo(
    () => requiredChainIds.every((chainId) => Boolean(selectedWallets[chainId])),
    [requiredChainIds, selectedWallets],
  );

  return {
    selected,
    connected: selected && confirmed,
    open,
    disconnect,
  };
}
