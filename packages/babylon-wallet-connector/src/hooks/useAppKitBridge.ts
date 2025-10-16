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
          if (ethConnector.connectedWallet?.id === "appkit-eth-connector") {
            return;
          }

          const appkitWallet = ethConnector.wallets.find(
            (wallet: any) => wallet.id === "appkit-eth-connector",
          );

          if (appkitWallet) {
            await ethConnector.connect(appkitWallet);
          } else {
            const error = new Error("AppKit wallet not found in ETH connector");
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
