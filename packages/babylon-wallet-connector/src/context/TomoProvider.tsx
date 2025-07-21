import { TomoContextProvider } from "@tomo-inc/wallet-connect-sdk";
import "@tomo-inc/wallet-connect-sdk/style.css";
import { useMemo, type PropsWithChildren } from "react";

import { BBNConfig, BTCConfig } from "@/core/types";

import { ChainConfigArr } from "./Chain.context";

interface TomoProviderProps {
  config: Readonly<ChainConfigArr>;
  theme?: string;
}

const CONFIG_ADAPTERS = {
  BTC: (config: BTCConfig) => ({
    id: 1,
    name: config.networkName,
    type: "bitcoin",
    network: config.network,
    backendUrls: {
      mempoolUrl: config.mempoolApiUrl + "/api/",
    },
  }),
  BBN: (config: BBNConfig) => ({
    id: 2,
    name: config.chainData.chainName,
    type: "cosmos",
    network: config.chainId,
    modularData: config.chainData,
    backendUrls: {
      rpcUrl: config.rpc,
    },
    logo: config.chainData.chainSymbolImageUrl,
  }),
};

export const TomoConnectionProvider = ({ children, theme, config }: PropsWithChildren<TomoProviderProps>) => {
  const tomoConfig = useMemo(
    () =>
      config.reduce(
        (acc, item) => ({ ...acc, [item.chain]: CONFIG_ADAPTERS[item.chain]?.(item.config as any) }),
        {} as Record<string, any>,
      ),
    [config],
  );

  return (
    <TomoContextProvider
      autoReconnect={false}
      bitcoinChains={[tomoConfig.BTC]}
      chainTypes={["bitcoin", "cosmos"]}
      cosmosChains={[tomoConfig.BBN]}
      style={{
        rounded: "medium",
        theme: theme as "dark" | "light",
        primaryColor: "#FF7C2A",
      }}
    >
      {children}
    </TomoContextProvider>
  );
};
