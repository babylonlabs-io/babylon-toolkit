import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { createWalletConnector } from "@/core";
import { WalletConnector } from "@/core/WalletConnector";
import type {
  BBNConfig,
  BTCConfig,
  ChainId,
  ChainMetadata,
  ETHConfig,
  ExternalConnector,
  HashMap,
  IBBNProvider,
  IBTCProvider,
  IETHProvider,
  IProvider,
} from "@/core/types";
import { useWalletRedetection } from "@/hooks/useWalletRedetection";

import { InscriptionProvider } from "./Inscriptions.context";
import { StateProvider } from "./State.context";

export interface ChainConfig<K extends string = string, P extends IProvider = IProvider, C = any> {
  chain: K;
  name?: string;
  icon?: string;
  config: C;
  connectors?: ExternalConnector<P>[];
}

export type ChainConfigArr = (
  | ChainConfig<"BTC", IBTCProvider, BTCConfig>
  | ChainConfig<"BBN", IBBNProvider, BBNConfig>
  | ChainConfig<"ETH", IETHProvider, ETHConfig>
)[];

export type ChainMetadataMap = Partial<Record<ChainId, ChainMetadata<any, any, any>>>;

interface ProviderProps {
  persistent: boolean;
  storage: HashMap;
  context: any;
  config: Readonly<ChainConfigArr>;
  onError?: (e: Error) => void;
  disabledWallets?: string[];
  requiredChains?: readonly ChainId[];
  metadata: ChainMetadataMap;
}

export interface Connectors {
  BTC: WalletConnector<"BTC", IBTCProvider, BTCConfig> | null;
  BBN: WalletConnector<"BBN", IBBNProvider, BBNConfig> | null;
  ETH: WalletConnector<"ETH", IETHProvider, ETHConfig> | null;
}

const defaultState: Connectors = {
  BTC: null,
  BBN: null,
  ETH: null,
};

export const Context = createContext<Connectors>(defaultState);

export function ChainProvider({
  persistent,
  storage,
  children,
  context,
  config,
  onError,
  disabledWallets,
  requiredChains,
  metadata,
}: PropsWithChildren<ProviderProps>) {
  const [connectors, setConnectors] = useState(defaultState);

  const init = useCallback(async () => {
    const filteredConfig = config.filter((c) => metadata[c.chain]);

    const connectorPromises = filteredConfig.map(async ({ chain, config }) => {
      try {
        const chainMetadata = metadata[chain];
        if (!chainMetadata) return null;

        const connector = await createWalletConnector<string, IProvider, any>({
          persistent,
          metadata: chainMetadata,
          context,
          config,
          accountStorage: storage,
          disabledWallets,
        });
        return connector;
      } catch (error) {
        console.error(
          "[ChainProvider] failed to create connector for chain:",
          chain,
          error instanceof Error ? error.message : "Unknown error",
        );
        try {
          onError?.(error instanceof Error ? error : new Error("Unknown connector initialization error"));
        } catch (callbackError) {
          console.error(
            "[ChainProvider] onError callback failed:",
            callbackError instanceof Error ? callbackError.message : "Unknown error",
          );
        }
        return null;
      }
    });

    const connectorArr = await Promise.all(connectorPromises);

    return connectorArr.reduce<Connectors>(
      (acc, connector) => (connector ? { ...acc, [connector.id]: connector } : acc),
      { ...defaultState },
    );
  }, [persistent, config, context, storage, disabledWallets, metadata, onError]);

  useEffect(() => {
    init()
      .then((connectors) => {
        setConnectors(connectors);
      })
      .catch((error) => {
        // Defensive only: individual connector failures are isolated in init().
        console.error(
          "[ChainProvider] init failed with error:",
          error instanceof Error ? error.message : "Unknown error",
        );
        try {
          onError?.(error instanceof Error ? error : new Error("Unknown connector initialization error"));
        } catch (callbackError) {
          console.error(
            "[ChainProvider] onError callback failed:",
            callbackError instanceof Error ? callbackError.message : "Unknown error",
          );
        }
      });
  }, [init, onError]);

  // Re-detect wallets whose extension injected after the one-shot detection
  // in `init()` above (e.g. UniSat's late `window.unisat` injection).
  useWalletRedetection({
    connectors,
    setConnectors,
    config,
    context,
    storage,
    disabledWallets,
    persistent,
    metadata,
  });

  // Auto-reconnect (and any other connect/disconnect) mutates `connectedWallet`
  // on the existing connector instance without changing the `connectors` object
  // identity, so consumers that read `connector.connectedWallet` reactively —
  // e.g. the auto-confirm-on-reload effect in `useWalletConnectors` — would not
  // re-evaluate. Because the BTC reconnect is now fire-and-forget (see
  // `createWalletConnector`), that mutation lands *after* the connectors are in
  // state. Bump a fresh `connectors` object on each connect/disconnect so those
  // consumers re-render and observe the new connection state.
  useEffect(() => {
    const active = Object.values(connectors).filter(Boolean) as WalletConnector<string, IProvider, any>[];
    if (active.length === 0) return;

    const bump = () => setConnectors((prev) => ({ ...prev }));
    const unsubscribe = active.flatMap((connector) => [
      connector.on("connect", bump),
      connector.on("disconnect", bump),
    ]);

    return () => unsubscribe.forEach((fn) => fn());
  }, [connectors]);

  const supportedChains = useMemo(
    () => Object.values(connectors).filter((connector): connector is NonNullable<typeof connector> => Boolean(connector)),
    [connectors],
  );
  const requiredChainIds = useMemo(
    () =>
      requiredChains === undefined
        ? config.filter((entry) => metadata[entry.chain]).map((entry) => entry.chain)
        : [...requiredChains],
    [config, metadata, requiredChains],
  );

  return (
    <InscriptionProvider context={context}>
      <StateProvider
        chains={supportedChains}
        requiredChainIds={requiredChainIds}
        storage={storage}
      >
        <Context.Provider value={connectors}>{children}</Context.Provider>
      </StateProvider>
    </InscriptionProvider>
  );
}

export const useChainProviders = () => {
  return useContext(Context);
};
