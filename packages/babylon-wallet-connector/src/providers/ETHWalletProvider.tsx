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

import type { IETHProvider } from "@/core/types";
import { useChainConnector } from "@/hooks/useChainConnector";
import { useVisibilityCheck } from "@/hooks/useVisibilityCheck";
import { useWalletConnect } from "@/hooks/useWalletConnect";

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

  const { open, disconnect: disconnectWallet } = useWalletConnect();
  const ethConnector = useChainConnector("ETH");

  const disconnectLocally = useCallback(async () => {
    try {
      await ethConnector?.disconnect("local");
    } catch (error) {
      console.error("Failed to disconnect ETH connector:", error instanceof Error ? error.message : "Unknown error");
    }
  }, [ethConnector]);

  const connectETH = useCallback(
    async (walletAddress: string) => {
      try {
        setAddress(walletAddress);
        setLoading(false);

        await callbacks?.onConnect?.(walletAddress);
      } catch (error: unknown) {
        setLoading(false);
        callbacks?.onError?.(error instanceof Error ? error : new Error("ETH connection failed"), {
          address: walletAddress,
        });
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
          console.error("Error getting ETH address:", error instanceof Error ? error.message : "Unknown error");
        }
      }
    });

    // Restore connector state when wagmi restores the account after mount.
    // The existing wagmi connection keeps this call from opening the modal.
    const bootstrapWallet = ethConnector.wallets[0];
    const bootstrapProvider = bootstrapWallet?.provider;
    // Block duplicate events until React receives the restored address.
    let lateReconnectInFlight = false;
    const onLateReconnect = (accounts?: string[]) => {
      if (!accounts?.[0] || address || lateReconnectInFlight) return;
      lateReconnectInFlight = true;
      void ethConnector
        .connect(bootstrapWallet)
        .then((wallet) => {
          // A failed connection resolves null. Let the next event try again.
          if (!wallet) lateReconnectInFlight = false;
        })
        .catch((error) => {
          // Also allow a retry after an unexpected error.
          lateReconnectInFlight = false;
          console.error("ETH late reconnect failed:", error instanceof Error ? error.message : "Unknown error");
        });
    };
    if (bootstrapProvider && typeof bootstrapProvider.on === "function") {
      bootstrapProvider.on("accountsChanged", onLateReconnect);
    }

    return () => {
      unsubscribe();
      if (bootstrapProvider && typeof bootstrapProvider.off === "function") {
        bootstrapProvider.off("accountsChanged", onLateReconnect);
      }
    };
  }, [ethConnector, connectETH, address]);

  useEffect(() => {
    if (!ethConnector) return;

    return ethConnector.on("disconnect", async () => {
      setAddress(undefined);
      setProvider(null);
      try {
        await callbacks?.onDisconnect?.();
      } catch (error) {
        console.error("Error in onDisconnect callback:", error instanceof Error ? error.message : "Unknown error");
      }
    });
  }, [ethConnector, callbacks]);

  // Track previous address to detect changes
  const prevAddressRef = useRef<string | undefined>(undefined);
  // Guard against duplicate event processing from provider and window.ethereum
  const isProcessingChangeRef = useRef(false);

  // Keep the ref in sync with React state
  useEffect(() => {
    prevAddressRef.current = address;
  }, [address]);

  // Listen for ETH account changes on the provider
  // Using provider state ensures React properly tracks when provider becomes available
  useEffect(() => {
    if (!provider) return;

    const onAccountsChanged = async (accounts: string[]) => {
      // Prevent duplicate processing if both provider and window.ethereum fire events
      if (isProcessingChangeRef.current) return;

      const newAddress = accounts[0];
      const previousAddress = prevAddressRef.current;

      if (newAddress && newAddress.toLowerCase() !== previousAddress?.toLowerCase()) {
        // Account changed - set guard before async operations
        isProcessingChangeRef.current = true;
        prevAddressRef.current = newAddress;
        setAddress(newAddress);
        try {
          await callbacks?.onAddressChange?.(newAddress);
        } catch (error: unknown) {
          callbacks?.onError?.(error instanceof Error ? error : new Error("ETH address change failed"), {
            address: newAddress,
          });
        } finally {
          isProcessingChangeRef.current = false;
        }
      } else if (!newAddress && previousAddress) {
        disconnectLocally();
      }
    };

    if (typeof provider.on === "function") {
      provider.on("accountsChanged", onAccountsChanged);
    }

    return () => {
      if (typeof provider.off === "function") {
        provider.off("accountsChanged", onAccountsChanged);
      }
    };
  }, [provider, callbacks, disconnectLocally]);

  // Use only the active provider. window.ethereum can report unrelated accounts.

  // Check for wallet changes when the user returns to the tab.
  const checkETHConnection = useCallback(async () => {
    if (!provider) return;

    try {
      const currentAddress = await provider.getAddress();

      if (!currentAddress) {
        disconnectLocally();
      } else if (currentAddress.toLowerCase() !== address?.toLowerCase()) {
        // Account changed while tab was in background
        prevAddressRef.current = currentAddress;
        setAddress(currentAddress);
        await callbacks?.onAddressChange?.(currentAddress);
      }
    } catch (error) {
      console.error("ETH wallet connection check failed:", error instanceof Error ? error.message : "Unknown error");
      disconnectLocally();
    }
  }, [provider, address, callbacks, disconnectLocally]);

  useVisibilityCheck(checkETHConnection, {
    enabled: Boolean(provider && address),
  });

  const connected = useMemo(() => Boolean(address), [address]);

  return (
    <ETHWalletContext.Provider
      value={{
        loading,
        connected,
        address,
        disconnect: () => disconnectWallet("ETH"),
        open,
      }}
    >
      {children}
    </ETHWalletContext.Provider>
  );
};

export const useETHWallet = () => useContext(ETHWalletContext);
