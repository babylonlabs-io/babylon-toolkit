import type { ChainConfig } from "@/context/Chain.context";
import type { ETHConfig, IETHProvider } from "@/core/types";

export type ETHChainConfigArr = ChainConfig<"ETH", IETHProvider, ETHConfig>[];

export interface ETHWalletConfigOptions {
  chains?: readonly "ETH"[];
  networkConfigs: {
    ETH?: ETHConfig;
  };
}

/** Build configuration for the BTC-free `./eth` provider entry. */
export function createETHWalletConfig({ chains = ["ETH"], networkConfigs }: ETHWalletConfigOptions): ETHChainConfigArr {
  if (!chains.includes("ETH") || !networkConfigs.ETH) return [];
  return [{ chain: "ETH", config: networkConfigs.ETH }];
}
