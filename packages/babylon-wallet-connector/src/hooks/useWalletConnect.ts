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

  // `open` deliberately does not `reset()`: attaching an optional chain must
  // not tear down a confirmed session. The consequence is that confirming an
  // already-confirmed session short-circuits in `WalletDialog.handleConfirm`,
  // so the terms hook, `onConfirm` and the receipt are all skipped and the
  // stored receipt keeps describing the required set as it stood at the first
  // confirm. That is safe because a change to the required set is handled
  // separately: `State.context` clears the receipt when a new required chain
  // appears, and `useWalletConnectors` blocks the cold-start restore once the
  // requirements expand.
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
   * Disconnects a single chain. With no argument — or with anything that is not
   * a chain id, such as the event object React hands an `onClick={disconnect}`
   * — it disconnects every chain and resets the widget state.
   */
  const disconnect = useCallback(
    async (chain?: ChainId) => {
      // Membership, not truthiness: React's bivariant handler types let
      // `onClick={disconnect}` pass a MouseEvent here, which must not be
      // mistaken for a chain and silently skip the disconnect-all path.
      // `connectors` always carries all three keys, so a configured chain whose
      // connector failed to construct is still matched (and is simply a no-op)
      // rather than falling through to disconnect-all.
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
