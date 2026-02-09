import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { networks } from "bitcoinjs-lib";

import { ACCOUNT_CHANGE_EVENTS, DISCONNECT_EVENT } from "@/constants/walletEvents";
import { useChainConnector } from "@/hooks/useChainConnector";
import { useVisibilityCheck } from "@/hooks/useVisibilityCheck";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import type { IBTCProvider, InscriptionIdentifier, Network, SignPsbtOptions } from "@/core/types";

export interface BTCWalletLifecycleCallbacks {
  onConnect?: (address: string, publicKeyNoCoord: string) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onAddressChange?: (newAddress: string, newPublicKeyNoCoord: string) => void | Promise<void>;
  onError?: (error: Error, context?: { address?: string; publicKeyNoCoord?: string }) => void;
}

interface BTCWalletContextProps {
  loading: boolean;
  network?: networks.Network;
  publicKeyNoCoord: string;
  address: string;
  connected: boolean;
  disconnect: () => void;
  open: () => void;
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  signPsbt: (psbtHex: string, options?: SignPsbtOptions) => Promise<string>;
  signPsbts: (
    psbtsHexes: string[],
    options?: SignPsbtOptions[],
  ) => Promise<string[]>;
  getNetwork: () => Promise<Network>;
  signMessage: (
    message: string,
    type: "ecdsa" | "bip322-simple",
  ) => Promise<string>;
  getInscriptions: () => Promise<InscriptionIdentifier[]>;
}

const BTCWalletContext = createContext<BTCWalletContextProps>({
  loading: true,
  network: undefined,
  connected: false,
  publicKeyNoCoord: "",
  address: "",
  disconnect: () => {},
  open: () => {},
  getAddress: async () => "",
  getPublicKeyHex: async () => "",
  signPsbt: async () => "",
  signPsbts: async () => [],
  getNetwork: async () => ({}) as Network,
  signMessage: async () => "",
  getInscriptions: async () => [],
});

export interface BTCWalletProviderProps extends PropsWithChildren {
  callbacks?: BTCWalletLifecycleCallbacks;
}

export const BTCWalletProvider = ({ children, callbacks }: BTCWalletProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [btcWalletProvider, setBTCWalletProvider] = useState<IBTCProvider>();
  const [network, setNetwork] = useState<networks.Network>();
  const [publicKeyNoCoord, setPublicKeyNoCoord] = useState("");
  const [address, setAddress] = useState("");

  const btcConnector = useChainConnector("BTC");
  const { open = () => {} } = useWalletConnect();

  const disconnect = useCallback(async () => {
    setBTCWalletProvider(undefined);
    setNetwork(undefined);
    setPublicKeyNoCoord("");
    setAddress("");

    try {
      await callbacks?.onDisconnect?.();
    } catch (error) {
      console.error("Error in onDisconnect callback:", error);
    }
  }, [callbacks]);

  const connectBTC = useCallback(
    async (walletProvider: IBTCProvider | null) => {
      if (!walletProvider) return;
      setLoading(true);

      try {
        const address = await walletProvider.getAddress();
        if (!address) {
          throw new Error("BTC wallet provider returned an empty address");
        }

        const publicKeyHex = await walletProvider.getPublicKeyHex();
        if (!publicKeyHex) {
          throw new Error("BTC wallet provider returned an empty public key");
        }

        // Get public key without coordinates (remove first byte which indicates compression)
        const publicKeyNoCoordHex = publicKeyHex.length === 66 
          ? publicKeyHex.slice(2) 
          : publicKeyHex;

        if (!publicKeyNoCoordHex) {
          throw new Error("Processed BTC public key (no coordinates) is empty");
        }

        setBTCWalletProvider(walletProvider);
        setAddress(address);
        setPublicKeyNoCoord(publicKeyNoCoordHex);
        setLoading(false);

        await callbacks?.onConnect?.(address, publicKeyNoCoordHex);
      } catch (error: any) {
        setLoading(false);
        callbacks?.onError?.(error, { address, publicKeyNoCoord });
        throw error;
      }
    },
    [callbacks, address, publicKeyNoCoord],
  );

  useEffect(() => {
    // Ensure loading is cleared even when BTC connector is not configured
    setLoading(false);
    if (!btcConnector) return;
    if (btcConnector.connectedWallet) {
      connectBTC(btcConnector?.connectedWallet.provider);
    }

    const unsubscribe = btcConnector?.on("connect", (wallet) => {
      if (wallet.provider) {
        connectBTC(wallet.provider);
      }
    });

    return unsubscribe;
  }, [btcConnector, connectBTC]);

  useEffect(() => {
    if (!btcConnector) return;

    const unsubscribe = btcConnector.on("disconnect", () => {
      disconnect();
    });

    return unsubscribe;
  }, [btcConnector, disconnect]);

  // Listen for BTC account changes
  useEffect(() => {
    if (!btcWalletProvider) return;

    const onAccountsChanged = async (accounts?: string[]) => {
      try {
        // If accounts array is provided and empty, treat as disconnect
        if (Array.isArray(accounts) && accounts.length === 0) {
          disconnect();
          return;
        }

        // Re-connect to refresh the provider's internal cache
        // This is necessary because providers cache walletInfo on connect
        await btcWalletProvider.connectWallet();

        const newAddress = await btcWalletProvider.getAddress();

        // If no address returned, treat as disconnect
        if (!newAddress) {
          disconnect();
          return;
        }

        if (newAddress !== address) {
          // Also fetch the new public key (different accounts have different keys)
          const newPublicKeyHex = await btcWalletProvider.getPublicKeyHex();
          if (!newPublicKeyHex) {
            throw new Error("BTC wallet provider returned an empty public key after account change");
          }

          // Get public key without coordinates (remove first byte which indicates compression)
          const newPublicKeyNoCoord = newPublicKeyHex.length === 66
            ? newPublicKeyHex.slice(2)
            : newPublicKeyHex;

          setAddress(newAddress);
          setPublicKeyNoCoord(newPublicKeyNoCoord);
          await callbacks?.onAddressChange?.(newAddress, newPublicKeyNoCoord);
        }
      } catch (error: any) {
        // Connection failure during account change likely means wallet disconnected
        console.error("Error handling BTC account change:", error);
        callbacks?.onError?.(error);
      }
    };

    const onDisconnect = () => {
      disconnect();
    };

    // Add listeners if provider supports events
    // Different wallets use different event names
    if (typeof btcWalletProvider.on === "function") {
      ACCOUNT_CHANGE_EVENTS.forEach((event) => {
        btcWalletProvider.on(event, onAccountsChanged);
      });
      btcWalletProvider.on(DISCONNECT_EVENT, onDisconnect);
    }

    return () => {
      if (typeof btcWalletProvider.off === "function") {
        ACCOUNT_CHANGE_EVENTS.forEach((event) => {
          btcWalletProvider.off(event, onAccountsChanged);
        });
        btcWalletProvider.off(DISCONNECT_EVENT, onDisconnect);
      }
    };
  }, [btcWalletProvider, address, callbacks, disconnect]);

  // Check wallet connection when tab becomes visible
  // This handles the case where user disconnects from extension while tab is in background
  const checkBTCConnection = useCallback(async () => {
    if (!btcWalletProvider) return;

    try {
      // Try to get the current accounts from the wallet
      // If disconnected, this will fail or return empty
      await btcWalletProvider.connectWallet();
      const currentAddress = await btcWalletProvider.getAddress();

      if (!currentAddress) {
        // Wallet is disconnected
        disconnect();
      } else if (currentAddress !== address) {
        // Account changed while tab was in background
        const pubKeyHex = await btcWalletProvider.getPublicKeyHex();
        if (pubKeyHex) {
          const pubKeyNoCoord = pubKeyHex.length === 66 ? pubKeyHex.slice(2) : pubKeyHex;
          setAddress(currentAddress);
          setPublicKeyNoCoord(pubKeyNoCoord);
          await callbacks?.onAddressChange?.(currentAddress, pubKeyNoCoord);
        }
      }
    } catch (error) {
      // Connection check failed - wallet likely disconnected
      console.error("BTC wallet connection check failed:", error);
      disconnect();
    }
  }, [btcWalletProvider, address, callbacks, disconnect]);

  useVisibilityCheck(checkBTCConnection, {
    enabled: Boolean(btcWalletProvider && address),
  });

  const connected = useMemo(
    () => Boolean(btcWalletProvider && address && publicKeyNoCoord),
    [btcWalletProvider, address, publicKeyNoCoord],
  );

  const getAddress = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getAddress();
  }, [btcWalletProvider]);

  const getPublicKeyHex = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getPublicKeyHex();
  }, [btcWalletProvider]);

  const signPsbt = useCallback(
    async (psbtHex: string, options?: SignPsbtOptions) => {
      if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
      return btcWalletProvider.signPsbt(psbtHex, options);
    },
    [btcWalletProvider],
  );

  const signPsbts = useCallback(
    async (psbtsHexes: string[], options?: SignPsbtOptions[]) => {
      if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
      return btcWalletProvider.signPsbts(psbtsHexes, options);
    },
    [btcWalletProvider],
  );

  const getNetwork = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getNetwork();
  }, [btcWalletProvider]);

  const signMessage = useCallback(
    async (message: string, type: "ecdsa" | "bip322-simple") => {
      if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
      return btcWalletProvider.signMessage(message, type);
    },
    [btcWalletProvider],
  );

  const getInscriptions = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getInscriptions();
  }, [btcWalletProvider]);

  return (
    <BTCWalletContext.Provider
      value={{
        loading,
        network,
        connected,
        publicKeyNoCoord,
        address,
        disconnect,
        open,
        getAddress,
        getPublicKeyHex,
        signPsbt,
        signPsbts,
        getNetwork,
        signMessage,
        getInscriptions,
      }}
    >
      {children}
    </BTCWalletContext.Provider>
  );
};

export const useBTCWallet = () => useContext(BTCWalletContext);

