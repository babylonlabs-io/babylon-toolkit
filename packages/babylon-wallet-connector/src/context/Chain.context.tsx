import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { createWalletConnector } from "@/core";
import { WalletConnector } from "@/core/WalletConnector";
import type {
  BBNConfig,
  BTCConfig,
  ExternalConnector,
  HashMap,
  IBBNProvider,
  IBTCProvider,
  IProvider,
} from "@/core/types";
import metadata from "@/core/wallets";

import { InscriptionProvider } from "./Inscriptions.context";
import { StateProvider } from "./State.context";

interface ChainConfig<K extends string = string, P extends IProvider = IProvider, C = any> {
  chain: K;
  name?: string;
  icon?: string;
  config: C;
  connectors?: ExternalConnector<P>[];
}

export type ChainConfigArr = (
  | ChainConfig<"BTC", IBTCProvider, BTCConfig>
  | ChainConfig<"BBN", IBBNProvider, BBNConfig>
)[];

interface ProviderProps {
  persistent: boolean;
  storage: HashMap;
  context: any;
  config: Readonly<ChainConfigArr>;
  onError?: (e: Error) => void;
  disabledWallets?: string[];
}

export interface Connectors {
  BTC: WalletConnector<"BTC", IBTCProvider, BTCConfig> | null;
  BBN: WalletConnector<"BBN", IBBNProvider, BBNConfig> | null;
}

const defaultState: Connectors = {
  BTC: null,
  BBN: null,
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
}: PropsWithChildren<ProviderProps>) {
  const [connectors, setConnectors] = useState(defaultState);

  const init = useCallback(async () => {
    const connectorPromises = config
      .filter((c) => metadata[c.chain])
      .map(({ chain, config }) =>
        createWalletConnector<string, IProvider, any>({
          persistent,
          metadata: metadata[chain],
          context,
          config,
          accountStorage: storage,
          disabledWallets,
        }),
      );
    const connectorArr = await Promise.all(connectorPromises);

    return connectorArr.reduce((acc, connector) => ({ ...acc, [connector.id]: connector }), {} as Connectors);
  }, [persistent]);

  useEffect(() => {
    init()
      .then((connectors) => {
        setConnectors(connectors);
      })
      .catch(onError);
  }, [setConnectors, init, onError]);

  const supportedChains = useMemo(() => Object.values(connectors).filter(Boolean), [connectors]);

  return (
    <InscriptionProvider context={context}>
      <StateProvider chains={supportedChains}>
        <Context.Provider value={connectors}>{children}</Context.Provider>
      </StateProvider>
    </InscriptionProvider>
  );
}

export const useChainProviders = () => {
  return useContext(Context);
};
