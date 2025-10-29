/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { WagmiProvider } from "wagmi";

import { useChainConnector } from "@/hooks/useChainConnector";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import {
  getAppKitWagmiConfig,
  hasAppKitModal,
} from "@/core/wallets/eth/appkit/appKitModal";

export interface ETHWalletLifecycleCallbacks {
  onConnect?: (address: string) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onError?: (error: Error, context?: { address?: string }) => void;
}

interface ETHWalletContextType {
  loading: boolean;
  connected: boolean;
  address: string | undefined;
  disconnect: () => void;
  open: () => void;
}

const ETHWalletContext = createContext<ETHWalletContextType>({
  loading: true,
  connected: false,
  address: undefined,
  disconnect: () => {},
  open: () => {},
});

export interface ETHWalletProviderProps extends PropsWithChildren {
  callbacks?: ETHWalletLifecycleCallbacks;
}

export const ETHWalletProvider = ({ children, callbacks }: ETHWalletProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState<string>();
  const [wagmiConfig, setWagmiConfig] = useState<ReturnType<
    typeof getAppKitWagmiConfig
  > | null>(null);
  
  const { open } = useWalletConnect();
  const ethConnector = useChainConnector("ETH");

  // Initialize wagmi config from AppKit
  useEffect(() => {
    // Wait for AppKit to be initialized
    if (hasAppKitModal()) {
      try {
        const config = getAppKitWagmiConfig();
        setWagmiConfig(config);
      } catch (error) {
        console.warn("Failed to get AppKit wagmi config:", error);
      }
    } else {
      // Poll until AppKit is initialized (with timeout)
      let attempts = 0;
      const maxAttempts = 10;
      const interval = setInterval(() => {
        attempts++;
        if (hasAppKitModal()) {
          try {
            const config = getAppKitWagmiConfig();
            setWagmiConfig(config);
            clearInterval(interval);
          } catch (error) {
            console.warn("Failed to get AppKit wagmi config:", error);
          }
        } else if (attempts >= maxAttempts) {
          console.warn(
            "AppKit not initialized after multiple attempts, wallet reconnection may not work",
          );
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setAddress(undefined);
    ethConnector?.disconnect();

    try {
      await callbacks?.onDisconnect?.();
    } catch (error) {
      console.error("Error in onDisconnect callback:", error);
    }
  }, [ethConnector, callbacks]);

  const connectETH = useCallback(
    async (walletAddress: string) => {
      try {
        setAddress(walletAddress);
        setLoading(false);

        await callbacks?.onConnect?.(walletAddress);
      } catch (error: any) {
        setLoading(false);
        callbacks?.onError?.(error, { address: walletAddress });
      }
    },
    [callbacks],
  );

  // Check for existing connection on mount (handles auto-reconnection)
  useEffect(() => {
    setLoading(false);
    if (!ethConnector) return;

    const checkExistingConnection = async () => {
      try {
        // First check if connector already has a connected wallet
        if (ethConnector.connectedWallet?.provider && !address) {
          const addr = await ethConnector.connectedWallet.provider.getAddress();
          if (addr) {
            connectETH(addr);
          }
          return;
        }

        // If not, try to auto-reconnect using the first available wallet
        // The AppKitProvider will detect existing wagmi connection and return immediately
        if (!address && ethConnector.wallets.length > 0) {
          const wallet = ethConnector.wallets[0]; // AppKit wallet
          if (wallet.provider) {
            try {
              // This will check for existing connection and return immediately if found
              const addr = await wallet.provider.getAddress();
              if (addr) {
                // Found existing connection, trigger manual connect to sync state
                await ethConnector.connect(wallet);
              }
            } catch (error) {
              // No existing connection, which is fine
            }
          }
        }
      } catch (error) {
        // No existing connection, which is fine
      }
    };

    checkExistingConnection();

    const unsubscribe = ethConnector.on("connect", async (wallet) => {
      if (wallet.provider) {
        try {
          const addr = await wallet.provider.getAddress();
          if (addr) {
            connectETH(addr);
          }
        } catch (error) {
          console.error("Error getting ETH address:", error);
        }
      }
    });

    return unsubscribe;
  }, [ethConnector, connectETH, address]);

  useEffect(() => {
    if (!ethConnector) return;

    const unsubscribe = ethConnector.on("disconnect", () => {
      disconnect();
    });

    return unsubscribe;
  }, [ethConnector, disconnect]);

  const connected = useMemo(
    () => Boolean(address),
    [address],
  );

  // Render without WagmiProvider until wagmiConfig is available
  if (!wagmiConfig) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <ETHWalletContext.Provider
        value={{
          loading,
          connected,
          address,
          disconnect,
          open,
        }}
      >
        {children}
      </ETHWalletContext.Provider>
    </WagmiProvider>
  );
};

export const useETHWallet = () => useContext(ETHWalletContext);

