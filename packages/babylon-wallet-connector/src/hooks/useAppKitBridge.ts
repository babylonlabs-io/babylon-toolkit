import { useEffect } from "react";
import { useAppKitAccount } from "@reown/appkit/react";

import { useChainConnector } from "./useChainConnector";

interface UseAppKitBridgeOptions {
  onError?: (error: Error) => void;
}

/**
 * Bridge AppKit connection state with babylon-wallet-connector
 *
 * This hook monitors AppKit's connection state and automatically connects/disconnects
 * the corresponding ETH wallet in the babylon wallet connector system.
 */
export const useAppKitBridge = ({ onError }: UseAppKitBridgeOptions = {}) => {
  const { isConnected, address, caipAddress } = useAppKitAccount();
  const ethConnector = useChainConnector("ETH");

  useEffect(() => {
    if (isConnected && address && ethConnector) {
      const connectToBabylonConnector = async () => {
        try {
          console.log("AppKit connection detected, syncing with babylon-wallet-connector...", {
            address,
            caipAddress,
            connectorId: ethConnector.id,
            availableWallets: ethConnector.wallets.map((w: any) => ({
              id: w.id,
              name: w.name,
            })),
          });

          // Check if already connected to the same wallet
          if (ethConnector.connectedWallet?.id === "appkit") {
            console.log("AppKit wallet already connected to babylon-wallet-connector");
            return;
          }

          // Find the appkit wallet in the ETH connector (wallet ID is "appkit")
          const appkitWallet = ethConnector.wallets.find(
            (wallet: any) => wallet.id === "appkit-eth-connector",
          );

          if (appkitWallet) {
            console.log("Found AppKit wallet, connecting to babylon-wallet-connector...");
            // Connect using the actual appkit wallet from the connector
            await ethConnector.connect(appkitWallet);
            console.log("Successfully connected AppKit to babylon-wallet-connector");
          } else {
            const error = new Error("AppKit wallet not found in ETH connector");
            console.error(error.message, {
              availableWallets: ethConnector.wallets.map((w: any) => ({
                id: w.id,
                name: w.name,
              })),
            });
            onError?.(error);
          }
        } catch (error) {
          console.error(
            "Failed to connect AppKit to babylon-wallet-connector:",
            error,
          );
          onError?.(error as Error);
        }
      };

      connectToBabylonConnector();
    } else if (!isConnected && ethConnector?.connectedWallet) {
      // Disconnect from babylon connector when AppKit disconnects
      console.log("AppKit disconnected, disconnecting from babylon-wallet-connector...");
      ethConnector.disconnect().catch((error) => {
        console.error("Failed to disconnect from babylon-wallet-connector:", error);
      });
    }
  }, [isConnected, address, caipAddress, ethConnector, onError]);

  return {
    isAppKitConnected: isConnected,
    appKitAddress: address,
  };
};
