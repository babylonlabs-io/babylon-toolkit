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

import { useChainConnector } from "@/hooks/useChainConnector";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import type { IBTCProvider, InscriptionIdentifier, Network, SignPsbtOptions } from "@/core/types";

export interface BTCWalletLifecycleCallbacks {
  onConnect?: (address: string, publicKeyNoCoord: string) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onAddressChange?: (newAddress: string) => void | Promise<void>;
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

    const onAccountsChanged = async () => {
      try {
        const newAddress = await btcWalletProvider.getAddress();
        if (newAddress && newAddress !== address) {
          setAddress(newAddress);
          await callbacks?.onAddressChange?.(newAddress);
        }
      } catch (error: any) {
        callbacks?.onError?.(error);
      }
    };

    // Add listener if provider supports it
    if (typeof btcWalletProvider.on === "function") {
      btcWalletProvider.on("accountsChanged", onAccountsChanged);
    }

    return () => {
      if (typeof btcWalletProvider.off === "function") {
        btcWalletProvider.off("accountsChanged", onAccountsChanged);
      }
    };
  }, [btcWalletProvider, address, callbacks]);

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

