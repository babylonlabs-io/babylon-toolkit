/**
 * Runtime configuration for `@babylonlabs-io/config`.
 *
 * The library no longer reads `process.env` directly. The host application
 * (e.g. the vault service) must call {@link configureBabylonConfig} once at
 * startup, before any other consumer reads from this package.
 *
 * Calling any `getX()` from `network/eth` or `network/btc` before
 * `configureBabylonConfig` throws an explicit error. This makes
 * misconfiguration loud at the boundary instead of silently routing to
 * a viem default RPC or a hard-coded public mempool.
 */

import { ETH_MAINNET_CHAIN_ID, ETH_SEPOLIA_CHAIN_ID } from "./network/constants";
import { BTC_MAINNET, BTC_SIGNET } from "./network/constants";

export type EthChainId =
  | typeof ETH_MAINNET_CHAIN_ID
  | typeof ETH_SEPOLIA_CHAIN_ID;

export type BtcNetworkName = typeof BTC_MAINNET | typeof BTC_SIGNET;

export interface BabylonConfigOptions {
  /** Ethereum chain ID. Must be 1 (mainnet) or 11155111 (sepolia). */
  ethChainId: EthChainId;

  /**
   * Ethereum RPC endpoint. Required — must point at an RPC that can see the
   * deployed contracts. Public RPCs (drpc.org, publicnode.com) do not see
   * contracts on private/devnet deployments.
   */
  ethRpcUrl: string;

  /** Bitcoin network. Must be "mainnet" or "signet". */
  btcNetwork: BtcNetworkName;

  /**
   * Optional mempool API base URL. Defaults to `https://mempool.space`.
   */
  mempoolApiUrl?: string;
}

export interface BabylonConfigState {
  ethChainId: EthChainId;
  ethRpcUrl: string;
  btcNetwork: BtcNetworkName;
  mempoolApiUrl: string;
}

const DEFAULT_MEMPOOL_API_URL = "https://mempool.space";

let state: BabylonConfigState | null = null;

const VALID_PAIRINGS: Array<{
  btc: BtcNetworkName;
  eth: EthChainId;
}> = [
  { btc: BTC_MAINNET, eth: ETH_MAINNET_CHAIN_ID },
  { btc: BTC_SIGNET, eth: ETH_SEPOLIA_CHAIN_ID },
];

/**
 * Initialize the library. Call this once at host application startup,
 * before any other module reads from `@babylonlabs-io/config`.
 *
 * @throws if any required field is missing or if the BTC/ETH pairing is
 *   not a known safe combination (mainnet+1, signet+11155111).
 */
export function configureBabylonConfig(opts: BabylonConfigOptions): void {
  if (
    opts.ethChainId !== ETH_MAINNET_CHAIN_ID &&
    opts.ethChainId !== ETH_SEPOLIA_CHAIN_ID
  ) {
    throw new Error(
      `Unsupported ethChainId: ${opts.ethChainId}. Must be ${ETH_MAINNET_CHAIN_ID} (mainnet) or ${ETH_SEPOLIA_CHAIN_ID} (sepolia).`,
    );
  }
  if (!opts.ethRpcUrl) {
    throw new Error(
      "ethRpcUrl is required. Set it to an RPC endpoint that can see the deployed contracts.",
    );
  }
  if (opts.btcNetwork !== BTC_MAINNET && opts.btcNetwork !== BTC_SIGNET) {
    throw new Error(
      `Invalid btcNetwork: "${opts.btcNetwork}". Must be 'mainnet' or 'signet'.`,
    );
  }

  const isPaired = VALID_PAIRINGS.some(
    (p) => p.btc === opts.btcNetwork && p.eth === opts.ethChainId,
  );
  if (!isPaired) {
    throw new Error(
      `Invalid network pairing: btcNetwork="${opts.btcNetwork}" with ethChainId=${opts.ethChainId}. ` +
        `Allowed pairings: mainnet+1 (production), signet+11155111 (testnet).`,
    );
  }

  state = {
    ethChainId: opts.ethChainId,
    ethRpcUrl: opts.ethRpcUrl,
    btcNetwork: opts.btcNetwork,
    mempoolApiUrl: opts.mempoolApiUrl ?? DEFAULT_MEMPOOL_API_URL,
  };
}

/**
 * Read the runtime config. Throws if `configureBabylonConfig` has not run.
 * Library internals (network/eth, network/btc) call this; consumers
 * should use the public `getX()` helpers instead.
 *
 * @internal
 */
export function getBabylonConfigState(): BabylonConfigState {
  if (!state) {
    throw new Error(
      "@babylonlabs-io/config: configureBabylonConfig() has not been called. " +
        "Call it once at application startup before reading any config value.",
    );
  }
  return state;
}

/**
 * Reset the runtime state. For tests only.
 *
 * @internal
 */
export function _resetBabylonConfigForTests(): void {
  state = null;
}
