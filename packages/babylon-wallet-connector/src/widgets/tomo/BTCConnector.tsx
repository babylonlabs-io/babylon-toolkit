import {
  BTCProvider,
  useClickWallet,
  useTomoProviders,
  useTomoWalletConnect,
  useTomoWalletState,
  useWalletList,
} from "@tomo-inc/wallet-connect-sdk";
import { memo, useCallback, useEffect, useMemo } from "react";

import { createExternalWallet } from "@/core";
import { HashMap, IBTCProvider, SignPsbtOptions } from "@/core/types";
import { useChainConnector } from "@/hooks/useChainConnector";

const createProvider = (provider: BTCProvider): IBTCProvider => {
  return {
    connectWallet: async () => void (await provider.connectWallet()),
    getAddress: () => provider.getAddress(),
    getPublicKeyHex: () => provider.getPublicKeyHex(),
    signPsbt: (psbtHex: string, options?: SignPsbtOptions) => provider.signPsbt(psbtHex, options),
    signPsbts: (psbtsHexes: string[], options?: SignPsbtOptions[]) => provider.signPsbts(psbtsHexes, options),
    getNetwork: () => provider.getNetwork(),
    signMessage: (message: string, type: "ecdsa") => provider.signMessage(message, type),
    on: (eventName: string, callBack: () => void) => provider.on(eventName, callBack),
    off: (eventName: string, callBack: () => void) => provider.off(eventName, callBack),
    getWalletProviderName: () => provider.getWalletProviderName(),
    getWalletProviderIcon: () => provider.getWalletProviderIcon(),
    getInscriptions: () =>
      provider.getInscriptions().then((result) =>
        (result.list || []).map((ordinal) => ({
          txid: ordinal.inscriptionId,
          vout: ordinal.outputValue,
        })),
      ),
  };
};

export const TomoBTCConnector = memo(({ persistent, storage }: { persistent: boolean; storage: HashMap }) => {
  const tomoWalletState = useTomoWalletState();
  const walletList = useWalletList("bitcoin");
  const { bitcoinProvider: connectedProvider } = useTomoProviders();
  const tomoWalletConnect = useTomoWalletConnect();
  const connectWallet = useClickWallet();

  const connector = useChainConnector("BTC");

  const connectedWallet = useMemo(() => {
    const { connected, walletId } = tomoWalletState.bitcoin ?? {};

    return connected && walletId ? (walletList.find((wallet: any) => wallet.id === walletId) ?? null) : null;
  }, [tomoWalletState.bitcoin, walletList]);

  const connect = useCallback(
    async (btcWallet: any, btcProvider: BTCProvider) => {
      if (!connector) return;

      const wallet = createExternalWallet({
        id: `tomo.${btcWallet.id}`,
        name: btcWallet.name,
        icon: btcWallet.img,
        provider: createProvider(btcProvider),
      });

      await connector.connect(wallet);
    },
    [connector],
  );

  useEffect(() => {
    if (!persistent) return;

    const walletId = storage.get("BTC");
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

TomoBTCConnector.displayName = "TomoBTCConnector";
