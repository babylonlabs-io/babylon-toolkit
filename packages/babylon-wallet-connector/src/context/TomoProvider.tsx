import { TomoContextProvider } from "@tomo-inc/wallet-connect-sdk";
import "@tomo-inc/wallet-connect-sdk/style.css";
import { useMemo, type PropsWithChildren } from "react";

import { BBNConfig, BTCConfig } from "@/core/types";

import { ChainConfigArr } from "./Chain.context";

interface TomoProviderProps {
  config: Readonly<ChainConfigArr>;
  theme?: string;
}

type TomoBtcChain = ReturnType<typeof adaptBtcConfig>;
type TomoCosmosChain = ReturnType<typeof adaptBbnConfig>;

function adaptBtcConfig(config: BTCConfig) {
  return {
    id: 1,
    name: config.networkName,
    type: "bitcoin" as const,
    network: config.network,
    backendUrls: {
      mempoolUrl: config.mempoolApiUrl + "/api/",
    },
  };
}

function adaptBbnConfig(config: BBNConfig) {
  return {
    id: 2,
    name: config.chainData.chainName,
    type: "cosmos" as const,
    network: config.chainId,
    modularData: config.chainData,
    backendUrls: {
      rpcUrl: config.rpc,
    },
    logo: config.chainData.chainSymbolImageUrl,
  };
}

export const TomoConnectionProvider = ({ children, theme, config }: PropsWithChildren<TomoProviderProps>) => {
  const bitcoinChains = useMemo(
    (): TomoBtcChain[] =>
      config
        .filter((item): item is { chain: "BTC"; config: BTCConfig } => item.chain === "BTC")
        .map((item) => adaptBtcConfig(item.config)),
    [config],
  );

  const cosmosChains = useMemo(
    (): TomoCosmosChain[] =>
      config
        .filter((item): item is { chain: "BBN"; config: BBNConfig } => item.chain === "BBN")
        .map((item) => adaptBbnConfig(item.config)),
    [config],
  );

  return (
    <TomoContextProvider
      autoReconnect={false}
      bitcoinChains={bitcoinChains}
      chainTypes={["bitcoin", "cosmos"]}
      cosmosChains={cosmosChains}
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
