import { TomoContextProvider } from "@tomo-inc/wallet-connect-sdk";
import "@tomo-inc/wallet-connect-sdk/style.css";
import { useMemo, type PropsWithChildren } from "react";

import { BBNConfig, BTCConfig, ETHConfig } from "@/core/types";

import { ChainConfigArr } from "./Chain.context";

interface TomoProviderProps {
  config: Readonly<ChainConfigArr>;
  theme?: string;
}

type TomoChainConfig = ReturnType<typeof adaptBtcConfig> | ReturnType<typeof adaptBbnConfig> | ReturnType<typeof adaptEthConfig>;

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

function adaptEthConfig(config: ETHConfig) {
  return {
    id: 3,
    name: config.chainName,
    type: "ethereum" as const,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    explorerUrl: config.explorerUrl,
    nativeCurrency: config.nativeCurrency,
  };
}

function adaptChainConfig(item: ChainConfigArr[number]): TomoChainConfig | undefined {
  switch (item.chain) {
    case "BTC": return adaptBtcConfig(item.config);
    case "BBN": return adaptBbnConfig(item.config);
    case "ETH": return adaptEthConfig(item.config);
    default: return undefined;
  }
}

export const TomoConnectionProvider = ({ children, theme, config }: PropsWithChildren<TomoProviderProps>) => {
  const tomoConfig = useMemo(
    () =>
      config.reduce(
        (acc, item) => {
          const adapted = adaptChainConfig(item);
          return adapted ? { ...acc, [item.chain]: adapted } : acc;
        },
        {} as Record<string, TomoChainConfig>,
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
