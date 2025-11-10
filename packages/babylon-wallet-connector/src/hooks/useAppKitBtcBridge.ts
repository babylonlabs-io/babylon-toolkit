import { bitcoinSignet } from "@reown/appkit/networks";
import { useAppKitAccount } from "@reown/appkit/react";
import { useCallback, useEffect, useRef } from "react";

import { getSharedBtcAppKitConfig } from "../core/wallets/btc/appkit/sharedConfig";

import { useChainConnector } from "./useChainConnector";

interface UseAppKitBtcBridgeOptions {
  onError?: (error: Error) => void;
}

/**
 * Bridge AppKit Bitcoin connection state with babylon-wallet-connector
 *
 * This hook monitors AppKit's Bitcoin connection state and dispatches connection events
 * that AppKitBTCProvider.connectWallet() is waiting for. It does NOT call btcConnector.connect()
 * to avoid circular dependency issues.
 *
 * To prevent race conditions, it listens for "babylon:open-appkit-btc" events to coordinate
 * event dispatch timing with the provider's event listener registration.
 */
export const useAppKitBtcBridge = ({ onError }: UseAppKitBtcBridgeOptions = {}) => {
  const { isConnected, address, caipAddress, allAccounts } = useAppKitAccount({ namespace: "bip122" });
  const btcConnector = useChainConnector("BTC");
  const lastDispatchedAddress = useRef<string | null>(null);

  // Helper function to dispatch connection event with all necessary data
  const dispatchConnectionEvent = useCallback(
    async (currentAddress: string) => {
      try {
        // Force network switch to signet
        try {
          const { adapter } = getSharedBtcAppKitConfig();
          await adapter.switchNetwork({ caipNetwork: bitcoinSignet });
        } catch (networkError) {
          console.warn("[AppKit BTC Bridge] Failed to switch network:", networkError);
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
          console.error("[AppKit BTC Bridge] Error fetching public key:", pkError);
        }

        // Dispatch event to notify AppKitBTCProvider.connectWallet() that connection is ready
        if (typeof window !== "undefined") {
          const eventDetail = { address: currentAddress, publicKey };
          window.dispatchEvent(
            new CustomEvent("babylon:appkit-btc-connected", {
              detail: eventDetail,
            }),
          );

          // Mark this address as dispatched to prevent duplicate events
          lastDispatchedAddress.current = currentAddress;
        }
      } catch (error) {
        console.error("[AppKit BTC Bridge] Failed to process connection:", error);
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
      if (isConnected && address && caipAddress?.startsWith("bip122:")) {
        dispatchConnectionEvent(address);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("babylon:open-appkit-btc", handleModalOpen);
      return () => window.removeEventListener("babylon:open-appkit-btc", handleModalOpen);
    }
  }, [isConnected, address, caipAddress, allAccounts, dispatchConnectionEvent]);

  // Monitor AppKit connection state changes
  useEffect(() => {
    // Only handle Bitcoin connections (caipAddress starts with "bip122:")
    const isBitcoinAccount = caipAddress?.startsWith("bip122:");

    if (isConnected && address && isBitcoinAccount) {
      // Avoid dispatching the same connection event multiple times
      if (lastDispatchedAddress.current === address) {
        return;
      }

      // Dispatch connection event when AppKit connects
      dispatchConnectionEvent(address);
    } else if (!isConnected && btcConnector?.connectedWallet?.id === "appkit-btc-connector") {
      // Reset the last dispatched address when disconnecting
      lastDispatchedAddress.current = null;

      btcConnector.disconnect().catch((error) => {
        console.error("Failed to disconnect from babylon-wallet-connector:", error);
      });
    }
  }, [isConnected, address, caipAddress, btcConnector, onError, dispatchConnectionEvent]);

  return {
    isAppKitBtcConnected: isConnected,
    appKitBtcAddress: address,
  };
};
