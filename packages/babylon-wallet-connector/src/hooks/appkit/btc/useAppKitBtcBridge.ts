import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";
import { useAppKitAccount } from "@reown/appkit/react";
import { useCallback, useEffect, useRef } from "react";

import { APPKIT_BTC_CONNECTOR_ID } from "@/core/wallets/btc/appkit";
import { APPKIT_BTC_CONNECTED_EVENT } from "@/core/wallets/btc/appkit/constants";
import { getSharedBtcAppKitConfig } from "@/core/wallets/btc/appkit/sharedConfig";
import { APPKIT_OPEN_EVENT } from "@/core/wallets/appkit/constants";
import { useChainConnector } from "@/hooks/useChainConnector";

interface UseAppKitBtcBridgeOptions {
  onError?: (error: Error) => void;
}

/**
 * Bridge AppKit Bitcoin connection state with babylon-wallet-connector
 *
 * This hook monitors AppKit's Bitcoin connection state and dispatches
 * connection events on the shared private `EventTarget` that
 * `AppKitBTCProvider.connectWallet()` is waiting on. It does NOT call
 * `btcConnector.connect()` to avoid circular dependency issues.
 *
 * The connection-events bus is intentionally NOT `window` — see
 * {@link SharedBtcAppKitConfig.connectionEvents}. A same-origin attacker
 * (XSS or malicious extension) cannot dispatch on the private bus, so
 * the cached connected address/pubkey on `AppKitBTCProvider` cannot be
 * spoofed via `window.dispatchEvent`.
 *
 * To prevent race conditions, it listens for "babylon:open-appkit" events
 * (a UI trigger, not a state source) to coordinate event dispatch timing
 * with the provider's event-listener registration.
 */
export const useAppKitBtcBridge = ({ onError }: UseAppKitBtcBridgeOptions = {}) => {
  const { isConnected, address, allAccounts } = useAppKitAccount({ namespace: "bip122" });
  const btcConnector = useChainConnector("BTC");
  const lastDispatchedAddress = useRef<string | null>(null);

  // Helper function to dispatch connection event with all necessary data
  const dispatchConnectionEvent = useCallback(
    async (currentAddress: string) => {
      try {
        // Resolve the shared config once — we need both the adapter (for
        // network switching) and the private connection-events bus.
        const { adapter, network, connectionEvents } = getSharedBtcAppKitConfig();

        // Switch to the configured network
        try {
          // Map the network config to AppKit's network types
          const networkMap = {
            mainnet: bitcoin,
            signet: bitcoinSignet,
          } as const;
          const caipNetwork = networkMap[network];
          await adapter.switchNetwork({ caipNetwork });
        } catch (networkError) {
          console.warn("[AppKit BTC Bridge] Failed to switch network:", networkError instanceof Error ? networkError.message : "Unknown error");
          // Don't fail the connection if network switch fails
          // Some wallets may already be on the correct network
        }

        // Fetch publicKey from allAccounts (this is where AppKit stores it)
        let publicKey: string | undefined;
        try {
          const currentAccount = allAccounts?.find((account) => account.address === currentAddress);

          if (currentAccount?.publicKey) {
            publicKey = currentAccount.publicKey;
          } else {
            console.warn("[AppKit BTC Bridge] Public key not available in current account");
          }
        } catch (pkError) {
          console.error("[AppKit BTC Bridge] Error fetching public key:", pkError instanceof Error ? pkError.message : "Unknown error");
        }

        // Dispatch on the private EventTarget so AppKitBTCProvider can pick
        // up the change. We do NOT dispatch on `window` — that channel is
        // reachable by any same-origin script and was the spoof vector.
        const eventDetail = { address: currentAddress, publicKey };
        connectionEvents.dispatchEvent(
          new CustomEvent(APPKIT_BTC_CONNECTED_EVENT, {
            detail: eventDetail,
          }),
        );

        // Mark this address as dispatched to prevent duplicate events
        lastDispatchedAddress.current = currentAddress;
      } catch (error) {
        console.error("[AppKit BTC Bridge] Failed to process connection:", error instanceof Error ? error.message : "Unknown error");
        onError?.(error as Error);
      }
    },
    [allAccounts, onError],
  );

  // Listen for modal open events to coordinate event dispatch timing
  useEffect(() => {
    const handleModalOpen = () => {
      // Reset deduplication to allow event dispatch for this connection attempt
      lastDispatchedAddress.current = null;

      // If AppKit is already connected when modal opens, dispatch the event immediately
      // This handles the case where AppKit restored connection from localStorage
      if (isConnected && address) {
        dispatchConnectionEvent(address);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener(APPKIT_OPEN_EVENT, handleModalOpen);
      return () => window.removeEventListener(APPKIT_OPEN_EVENT, handleModalOpen);
    }
  }, [isConnected, address, allAccounts, dispatchConnectionEvent]);

  // Monitor AppKit connection state changes
  useEffect(() => {
    if (isConnected && address) {
      // Avoid dispatching the same connection event multiple times
      if (lastDispatchedAddress.current === address) {
        return;
      }

      // Dispatch connection event when AppKit connects
      dispatchConnectionEvent(address);
    } else if (!isConnected && btcConnector?.connectedWallet?.id === APPKIT_BTC_CONNECTOR_ID) {
      // Reset the last dispatched address when disconnecting
      lastDispatchedAddress.current = null;

      btcConnector.disconnect().catch((error) => {
        console.error("Failed to disconnect from babylon-wallet-connector:", error instanceof Error ? error.message : "Unknown error");
      });
    }
  }, [isConnected, address, btcConnector, onError, dispatchConnectionEvent]);

  return {
    isAppKitBtcConnected: isConnected,
    appKitBtcAddress: address,
  };
};
