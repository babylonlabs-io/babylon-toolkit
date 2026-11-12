import type { ChainConfig } from "@/context/Chain.context";
import type { BTCConfig, ETHConfig, IBTCProvider, IETHProvider } from "@/core/types";
import { ERROR_CODES, WalletError } from "@/error";

export type BTCETHChainConfigArr = (
  | ChainConfig<"BTC", IBTCProvider, BTCConfig>
  | ChainConfig<"ETH", IETHProvider, ETHConfig>
)[];

type BTCETHChainId = "BTC" | "ETH";

export interface WalletConfigOptions {
  chains: readonly BTCETHChainId[];
  networkConfigs: {
    BTC?: BTCConfig;
    ETH?: ETHConfig;
  };
}

/** A listed chain without a network config would be offered to nobody while the dialog reports it satisfied. */
function requireNetworkConfig<T>(chain: BTCETHChainId, networkConfig: T | undefined): T {
  if (networkConfig === undefined) {
    throw new WalletError({
      code: ERROR_CODES.WALLET_CONFIG_REQUIRED,
      message: `The "./btc-eth" entry needs a network config for every chain it offers: pass networkConfigs.${chain} or drop "${chain}" from chains.`,
      chainId: chain,
    });
  }
  return networkConfig;
}

/**
 * Builds configuration for the `./btc-eth` entry point: Bitcoin and Ethereum
 * wallets, no Babylon chain and no Tomo Connect widgets.
 *
 * @throws WalletError when a listed chain has no network config, or when no
 * chain is listed. An empty config builds zero connectors, which would leave
 * the required set empty and make the dialog report a satisfied requirement
 * with nothing connected.
 */
export function createWalletConfig({ chains, networkConfigs }: WalletConfigOptions): BTCETHChainConfigArr {
  const config: BTCETHChainConfigArr = [];

  if (chains.includes("BTC")) {
    config.push({ chain: "BTC", config: requireNetworkConfig("BTC", networkConfigs.BTC) });
  }

  if (chains.includes("ETH")) {
    config.push({ chain: "ETH", config: requireNetworkConfig("ETH", networkConfigs.ETH) });
  }

  if (config.length === 0) {
    throw new WalletError({
      code: ERROR_CODES.WALLET_CONFIG_REQUIRED,
      message: 'The "./btc-eth" entry needs at least one chain: keep "BTC" or "ETH" in chains.',
    });
  }

  return config;
}
