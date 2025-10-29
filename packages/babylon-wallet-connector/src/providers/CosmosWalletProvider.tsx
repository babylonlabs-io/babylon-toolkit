import { OfflineSigner } from "@cosmjs/proto-signing";
import { AminoTypes, SigningStargateClient } from "@cosmjs/stargate";
import { Registry } from "@cosmjs/proto-signing";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

import { useChainConnector } from "@/hooks/useChainConnector";
import { useWalletConnect } from "@/hooks/useWalletConnect";
import type { IBBNProvider } from "@/core/types";

export interface CosmosWalletConfig {
  chainId: string;
  rpc: string;
  registry?: Registry;
  aminoTypes?: AminoTypes;
}

export interface CosmosWalletLifecycleCallbacks {
  onConnect?: (address: string) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onError?: (error: Error, context?: { address?: string; walletName?: string }) => void;
}

interface CosmosWalletContextProps {
  loading: boolean;
  bech32Address: string;
  connected: boolean;
  disconnect: () => void;
  open: () => void;
  signingStargateClient: SigningStargateClient | undefined;
  walletName: string;
}

const CosmosWalletContext = createContext<CosmosWalletContextProps>({
  loading: true,
  bech32Address: "",
  connected: false,
  disconnect: () => {},
  open: () => {},
  signingStargateClient: undefined,
  walletName: "",
});

export interface CosmosWalletProviderProps extends PropsWithChildren {
  config: CosmosWalletConfig;
  callbacks?: CosmosWalletLifecycleCallbacks;
}

export const CosmosWalletProvider = ({ 
  children, 
  config,
  callbacks 
}: CosmosWalletProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [BBNWalletProvider, setBBNWalletProvider] = useState<IBBNProvider | undefined>();
  const [cosmosBech32Address, setCosmosBech32Address] = useState("");
  const [signingStargateClient, setSigningStargateClient] = useState<SigningStargateClient | undefined>();
  const [walletName, setWalletName] = useState("");

  const { open = () => {} } = useWalletConnect();
  const bbnConnector = useChainConnector("BBN");

  const disconnect = useCallback(async () => {
    setBBNWalletProvider(undefined);
    setCosmosBech32Address("");
    setSigningStargateClient(undefined);
    setWalletName("");

    try {
      await callbacks?.onDisconnect?.();
    } catch (error) {
      console.error("Error in onDisconnect callback:", error);
    }
  }, [callbacks]);

  const connectCosmos = useCallback(
    async (provider: IBBNProvider | null) => {
      if (!provider) return;
      setLoading(true);

      try {
        const offlineSigner = provider.getOfflineSignerAuto
          ? await provider.getOfflineSignerAuto()
          : await provider.getOfflineSigner();

        // @ts-expect-error - chainId is missing in keplr types
        if (offlineSigner.chainId && offlineSigner.chainId !== config.chainId) {
          throw new Error(
            `Cosmos wallet chain ID does not match configured chain ID (${config.chainId}).`
          );
        }

        const bech32Address = await provider.getAddress();
        if (!bech32Address) {
          throw new Error("Cosmos wallet provider returned an empty address");
        }

        const walletNameStr = await provider.getWalletProviderName();
        if (!walletNameStr) {
          throw new Error("Cosmos wallet provider returned an empty wallet name");
        }

        const clientOptions: any = {};
        if (config.registry) {
          clientOptions.registry = config.registry;
        }
        if (config.aminoTypes) {
          clientOptions.aminoTypes = config.aminoTypes;
        }

        const client = await SigningStargateClient.connectWithSigner(
          config.rpc,
          offlineSigner as OfflineSigner,
          clientOptions,
        );

        setSigningStargateClient(client);
        setBBNWalletProvider(provider);
        setCosmosBech32Address(bech32Address);
        setWalletName(walletNameStr || "Unknown Wallet");
        setLoading(false);

        await callbacks?.onConnect?.(bech32Address);
      } catch (error: any) {
        setLoading(false);
        callbacks?.onError?.(error, { address: cosmosBech32Address, walletName });
        throw error;
      }
    },
    [config, callbacks, cosmosBech32Address, walletName],
  );

  useEffect(() => {
    setLoading(false);
    if (!bbnConnector) return;
    if (bbnConnector.connectedWallet) {
      connectCosmos(bbnConnector?.connectedWallet.provider);
    }

    const unsubscribe = bbnConnector.on("connect", (wallet) => {
      if (wallet.provider) {
        connectCosmos(wallet.provider);
      }
    });

    return unsubscribe;
  }, [bbnConnector, connectCosmos]);

  useEffect(() => {
    if (!bbnConnector) return;

    const unsubscribe = bbnConnector.on("disconnect", () => {
      disconnect();
    });

    return unsubscribe;
  }, [bbnConnector, disconnect]);

  const connected = Boolean(BBNWalletProvider && cosmosBech32Address && signingStargateClient);

  return (
    <CosmosWalletContext.Provider
      value={{
        loading,
        bech32Address: cosmosBech32Address,
        connected,
        disconnect,
        open,
        signingStargateClient,
        walletName,
      }}
    >
      {children}
    </CosmosWalletContext.Provider>
  );
};

export const useCosmosWallet = () => useContext(CosmosWalletContext);

