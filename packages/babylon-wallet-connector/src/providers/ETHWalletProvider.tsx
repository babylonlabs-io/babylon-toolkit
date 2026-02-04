/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { useChainConnector } from "@/hooks/useChainConnector";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import type { IETHProvider } from "@/core/types";

export interface ETHWalletLifecycleCallbacks {
  onConnect?: (address: string) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onAddressChange?: (newAddress: string) => void | Promise<void>;
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
  const [provider, setProvider] = useState<IETHProvider | null>(null);

  const { open } = useWalletConnect();
  const ethConnector = useChainConnector("ETH");

  const disconnect = useCallback(async () => {
    setAddress(undefined);
    setProvider(null);
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
          const walletProvider = ethConnector.connectedWallet.provider;
          const addr = await walletProvider.getAddress();
          if (addr) {
            setProvider(walletProvider);
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
            setProvider(wallet.provider);
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

  // Track previous address to detect changes
  const prevAddressRef = useRef<string | undefined>(undefined);

  // Keep the ref in sync with React state
  useEffect(() => {
    prevAddressRef.current = address;
  }, [address]);

  // Listen for ETH account changes on the provider
  // Using provider state ensures React properly tracks when provider becomes available
  useEffect(() => {
    if (!provider) return;

    const onAccountsChanged = async (accounts: string[]) => {
      const newAddress = accounts[0];
      const previousAddress = prevAddressRef.current;

      if (newAddress && newAddress !== previousAddress) {
        // Account changed
        prevAddressRef.current = newAddress;
        setAddress(newAddress);
        try {
          await callbacks?.onAddressChange?.(newAddress);
        } catch (error: any) {
          callbacks?.onError?.(error, { address: newAddress });
        }
      } else if (!newAddress && previousAddress) {
        // Account disconnected
        disconnect();
      }
    };

    // Subscribe to account changes on the provider
    if (typeof provider.on === "function") {
      provider.on("accountsChanged", onAccountsChanged);
    }

    return () => {
      if (typeof provider.off === "function") {
        provider.off("accountsChanged", onAccountsChanged);
      }
    };
  }, [provider, callbacks, disconnect]);

  // Also listen directly to injected provider (window.ethereum) for account changes
  // This is a fallback for when MetaMask is connected via injected provider
  // and the AppKit provider events don't propagate correctly
  useEffect(() => {
    if (!address) return; // Only listen when connected
    if (typeof window === "undefined") return;

    const ethereum = (window as any).ethereum;
    if (!ethereum || typeof ethereum.on !== "function") return;

    const onInjectedAccountsChanged = async (accounts: string[]) => {
      const newAddress = accounts[0];
      const previousAddress = prevAddressRef.current;

      // Only handle if we're connected and address actually changed
      if (newAddress && newAddress.toLowerCase() !== previousAddress?.toLowerCase()) {
        prevAddressRef.current = newAddress;
        setAddress(newAddress);
        try {
          await callbacks?.onAddressChange?.(newAddress);
        } catch (error: any) {
          callbacks?.onError?.(error, { address: newAddress });
        }
      }
    };

    ethereum.on("accountsChanged", onInjectedAccountsChanged);

    return () => {
      if (typeof ethereum.removeListener === "function") {
        ethereum.removeListener("accountsChanged", onInjectedAccountsChanged);
      }
    };
  }, [address, callbacks]);

  // Check wallet connection when tab becomes visible
  // This handles the case where user disconnects from extension while tab is in background
  useEffect(() => {
    if (!provider || !address) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const checkConnection = async () => {
      try {
        const currentAddress = await provider.getAddress();

        if (!currentAddress) {
          // Wallet is disconnected
          disconnect();
        } else if (currentAddress.toLowerCase() !== address.toLowerCase()) {
          // Account changed while tab was in background
          prevAddressRef.current = currentAddress;
          setAddress(currentAddress);
          await callbacks?.onAddressChange?.(currentAddress);
        }
      } catch (error) {
        // Connection check failed - wallet likely disconnected
        console.error("ETH wallet connection check failed:", error);
        disconnect();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Small delay to let the wallet extension initialize
        setTimeout(checkConnection, 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [provider, address, callbacks, disconnect]);

  const connected = useMemo(
    () => Boolean(address),
    [address],
  );

  return (
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
  );
};

export const useETHWallet = () => useContext(ETHWalletContext);

