import type { ChainConfig } from "@/context/Chain.context";
import type { ETHConfig, IETHProvider } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

export type ETHChainConfigArr = ChainConfig<"ETH", IETHProvider, ETHConfig>[];

export interface WalletConfigOptions {
  chains?: readonly "ETH"[];
  networkConfigs: {
    ETH?: ETHConfig;
  };
}

/**
 * Builds configuration for the Bitcoin-free `./eth` entry point.
 *
 * @throws WalletError when no Ethereum network config is supplied. An empty
 * config builds zero connectors, which would leave the required set empty and
 * make the dialog report a satisfied requirement with nothing connected.
 */
export function createWalletConfig({ chains = ["ETH"], networkConfigs }: WalletConfigOptions): ETHChainConfigArr {
  if (!chains.includes("ETH") || !networkConfigs.ETH) {
    throw new WalletError({
      code: ERROR_CODES.WALLET_CONFIG_REQUIRED,
      message: 'The "./eth" entry needs an Ethereum network config: pass networkConfigs.ETH and keep "ETH" in chains.',
      chainId: "ETH",
    });
  }

  return [{ chain: "ETH", config: networkConfigs.ETH }];
}
