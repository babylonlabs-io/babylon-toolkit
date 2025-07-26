import {
  CosmosProvider,
  useClickWallet,
  useTomoProviders,
  useTomoWalletConnect,
  useTomoWalletState,
  useWalletList,
} from "@tomo-inc/wallet-connect-sdk";
import { memo, useCallback, useEffect, useMemo } from "react";

import { createExternalWallet } from "@/core";
import { HashMap, IBBNProvider } from "@/core/types";
import { useChainConnector } from "@/hooks/useChainConnector";

const createProvider = (provider: CosmosProvider): IBBNProvider => {
  return {
    connectWallet: async () => void (await provider.connectWallet()),
    getAddress: () => provider.getAddress(),
    getPublicKeyHex: () => provider.getPublicKeyHex(),
    getWalletProviderName: () => provider.getWalletProviderName(),
    getWalletProviderIcon: () => provider.getWalletProviderIcon(),
    getOfflineSigner: () => provider.getOfflineSigner(),
    on: () => {},
    off: () => {},
  };
};

export const TomoBBNConnector = memo(({ persistent, storage }: { persistent: boolean; storage: HashMap }) => {
  const tomoWalletState = useTomoWalletState();
  const walletList = useWalletList("cosmos");
  const { cosmosProvider: connectedProvider } = useTomoProviders();
  const tomoWalletConnect = useTomoWalletConnect();
  const connectWallet = useClickWallet();

  const connector = useChainConnector("BBN");

  const connectedWallet = useMemo(() => {
    const { connected, walletId } = tomoWalletState.cosmos ?? {};

    return connected && walletId ? (walletList.find((wallet: any) => wallet.id === walletId) ?? null) : null;
  }, [tomoWalletState.cosmos, walletList]);

  const connect = useCallback(
    async (bbnWallet: any, bbnProvider: CosmosProvider) => {
      if (!connector) return;

      const wallet = createExternalWallet({
        id: `tomo.${bbnWallet.id}`,
        name: bbnWallet.name,
        icon: bbnWallet.img,
        provider: createProvider(bbnProvider),
      });

      await connector.connect(wallet);
    },
    [connector],
  );

  useEffect(() => {
    if (!persistent) return;

    const walletId = storage.get("BBN");
    if (!walletId || !walletId.startsWith("tomo.")) return;

    const tomoWalletId = walletId.replace("tomo.", "");
    const wallet = walletList.find((wallet: any) => wallet.id === tomoWalletId);

    if (wallet) {
      connectWallet(wallet);
    }
  }, [walletList, persistent, storage]);

  useEffect(() => {
    if (connectedWallet && connectedProvider) {
      connect(connectedWallet, connectedProvider);
    }
  }, [connectedWallet, connectedProvider, connect]);

  useEffect(() => {
    if (!connector) return;

    const unsubscribe = connector.on("disconnect", (wallet) => {
      if (wallet.id.startsWith("tomo.")) {
        tomoWalletConnect.disconnect();
      }
    });

    return unsubscribe;
  }, [connector, tomoWalletConnect]);

  return null;
});

TomoBBNConnector.displayName = "TomoBBNConnector";
