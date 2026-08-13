import type { ChainConfig } from "@/context/Chain.context";
import type { ETHConfig, IETHProvider } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

export type ETHChainConfigArr = ChainConfig<"ETH", IETHProvider, ETHConfig>[];

export interface ETHWalletConfigOptions {
  chains?: readonly "ETH"[];
  networkConfigs: {
    ETH?: ETHConfig;
  };
}

/**
 * Build configuration for the BTC-free `./eth` provider entry.
 *
 * @throws WalletError if no ETH network config is available. An empty config
 * builds zero connectors, which leaves `requiredChainIds` empty and makes the
 * dialog report a satisfied requirement set with no wallet connected.
 */
export function createETHWalletConfig({ chains = ["ETH"], networkConfigs }: ETHWalletConfigOptions): ETHChainConfigArr {
  if (!chains.includes("ETH") || !networkConfigs.ETH) {
    throw new WalletError({
      code: ERROR_CODES.WALLET_CONFIG_REQUIRED,
      message: 'The "./eth" entry needs an ETH network config: pass networkConfigs.ETH and keep "ETH" in chains.',
      chainId: "ETH",
    });
  }
  return [{ chain: "ETH", config: networkConfigs.ETH }];
}
