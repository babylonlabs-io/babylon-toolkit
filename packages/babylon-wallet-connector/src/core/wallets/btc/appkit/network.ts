/**
 * AppKit BTC network-id normalization.
 *
 * Pure module — no SVG / browser dependencies — so it can be unit-tested
 * in isolation from the full `AppKitBTCProvider` class.
 */

import { bitcoin, bitcoinSignet } from "@reown/appkit/networks";

import { Network } from "@/core/types";

/**
 * Map an AppKit `caipNetworkId` to our `Network` enum.
 *
 * Returns `null` for any chain we don't support (regtest, testnet3,
 * fractal, etc.) so callers can throw `UNSUPPORTED_NETWORK` rather than
 * silently coercing.
 */
export function caipNetworkIdToNetwork(
  caipNetworkId: string | undefined,
): Network | null {
  if (caipNetworkId === bitcoin.caipNetworkId) return Network.MAINNET;
  if (caipNetworkId === bitcoinSignet.caipNetworkId) return Network.SIGNET;
  return null;
}
