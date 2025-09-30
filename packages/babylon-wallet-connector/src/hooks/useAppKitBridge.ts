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
  const { isConnected, address } = useAppKitAccount();
  const ethConnector = useChainConnector("ETH");

  useEffect(() => {
    if (isConnected && address && ethConnector) {
      const connectToBabylonConnector = async () => {
        try {
          // Find the appkit wallet in the ETH connector
          const appkitWallet = ethConnector.wallets.find(
            (wallet: any) => wallet.id === "appkit-eth-connector",
          );

          if (appkitWallet) {
            // Connect using the actual appkit wallet from the connector
            await ethConnector.connect(appkitWallet);
          } else {
            console.error("AppKit wallet not found in ETH connector");
            onError?.(new Error("AppKit wallet not found in ETH connector"));
          }
        } catch (error) {
          console.error(
            "Failed to connect to babylon-wallet-connector:",
            error,
          );
          onError?.(error as Error);
        }
      };

      connectToBabylonConnector();
    }
  }, [isConnected, address, ethConnector, onError]);

  return {
    isAppKitConnected: isConnected,
    appKitAddress: address,
  };
};
