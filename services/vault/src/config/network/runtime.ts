/**
 * Vault network configuration runtime.
 *
 * Reads no environment variables on its own. The host (vault `main.tsx` /
 * `config/env.ts`) calls {@link configureBabylonConfig} once at startup
 * with values it has already validated, then any `getX()` reader can be
 * used elsewhere in the app.
 *
 * Lives inside the vault service rather than in a workspace package
 * because vault is the only consumer. If a second consumer ever appears
 * the same shape can be promoted to a package without rewriting it.
 */

import type { BtcNetworkName } from "./btc";
import {
  BTC_MAINNET,
  BTC_SIGNET,
  ETH_MAINNET_CHAIN_ID,
  ETH_SEPOLIA_CHAIN_ID,
} from "./constants";

export type EthChainId =
  | typeof ETH_MAINNET_CHAIN_ID
  | typeof ETH_SEPOLIA_CHAIN_ID;

export type { BtcNetworkName };

export interface BabylonConfigOptions {
  /** Ethereum chain ID. Must be 1 (mainnet) or 11155111 (sepolia). */
  ethChainId: EthChainId;

  /**
   * Ethereum RPC endpoint. Required — must point at an RPC that can see
   * the deployed contracts. Public RPCs (drpc.org, publicnode.com) do
   * not see contracts on private/devnet deployments.
   */
  ethRpcUrl: string;

  /** Bitcoin network. Must be "mainnet" or "signet". */
  btcNetwork: BtcNetworkName;

  /**
   * Optional mempool API base URL, WITHOUT a trailing `/api` (the reader
   * appends `/api`). For `mempool.space` the network path is derived from
   * `btcNetwork`; a custom / self-hosted host is used verbatim. When omitted,
   * defaults to the network-correct mempool.space URL.
   * See {@link resolveMempoolApiUrl}.
   */
  mempoolApiUrl?: string;
}

export interface BabylonConfigState {
  ethChainId: EthChainId;
  ethRpcUrl: string;
  btcNetwork: BtcNetworkName;
  mempoolApiUrl: string;
}

// Public mempool.space origin used as the default and as the one host whose
// network path we derive from `btcNetwork` (see resolveMempoolApiUrl).
const MEMPOOL_SPACE_ORIGIN = "https://mempool.space";

/**
 * Resolve the mempool API base URL (WITHOUT a trailing `/api`) for the declared
 * BTC network.
 *
 * mempool.space encodes the network in the URL path (mainnet at the root, signet
 * under `/signet`), so for that known public host we derive the path from
 * `btcNetwork` — a signet app can never accidentally read mainnet data through
 * it. Any other (custom / self-hosted) mempool base is network-specific by
 * deployment (e.g. a dedicated signet host serving `/api` at its root) and is
 * used verbatim.
 */
export function resolveMempoolApiUrl(
  base: string | undefined,
  network: BtcNetworkName,
): string {
  const trimmed = (base ?? MEMPOOL_SPACE_ORIGIN).replace(/\/+$/, "");
  let host: string;
  try {
    host = new URL(trimmed).host;
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_MEMPOOL_API URL: "${base}"`);
  }
  if (host === "mempool.space") {
    return network === BTC_SIGNET
      ? `${MEMPOOL_SPACE_ORIGIN}/signet`
      : MEMPOOL_SPACE_ORIGIN;
  }
  return trimmed;
}

let state: BabylonConfigState | null = null;

const VALID_PAIRINGS: Array<{
  btc: BtcNetworkName;
  eth: EthChainId;
}> = [
  { btc: BTC_MAINNET, eth: ETH_MAINNET_CHAIN_ID },
  { btc: BTC_SIGNET, eth: ETH_SEPOLIA_CHAIN_ID },
];

/**
 * Initialize the runtime. Call once at startup before any reader runs.
 *
 * Calling more than once throws — silent re-init would let cached
 * singletons (e.g. `ethClient`) drift from the new state.
 *
 * @throws if `configureBabylonConfig` has already been called.
 * @throws if any field is invalid or if the BTC/ETH pairing is not a known
 *   safe combination (mainnet+1, signet+11155111).
 */
export function configureBabylonConfig(opts: BabylonConfigOptions): void {
  if (state !== null) {
    throw new Error(
      "configureBabylonConfig() has already been called; it can only be configured once.",
    );
  }
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
    mempoolApiUrl: resolveMempoolApiUrl(opts.mempoolApiUrl, opts.btcNetwork),
  };
}

/**
 * Read the runtime config. Throws if `configureBabylonConfig` has not run.
 *
 * @internal
 */
export function getBabylonConfigState(): BabylonConfigState {
  if (!state) {
    throw new Error(
      "vault network config: configureBabylonConfig() has not been called. " +
        "Call it once at application startup before reading any config value.",
    );
  }
  return state;
}
