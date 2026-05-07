/** OneKey network-name normalization. Pure module for unit testing. */

import { Network } from "@/core/types";

/**
 * `"testnet"` → `Network.SIGNET` deliberately: OneKey returns
 * `"testnet"` on the signet endpoint and lacks native signet support.
 */
const ONEKEY_NETWORK_TO_INTERNAL: Record<string, Network> = {
  livenet: Network.MAINNET,
  testnet: Network.SIGNET,
  signet: Network.SIGNET,
};

/**
 * Map a OneKey `getNetwork()` string (e.g. `"livenet"`) to our
 * `Network` enum, or `null` for any unrecognised input. `unknown` +
 * `Object.hasOwn` reject non-strings (toString coercion) and
 * prototype keys (`constructor`, `__proto__`, ...).
 */
export function mapOneKeyNetwork(onekeyNetwork: unknown): Network | null {
  if (typeof onekeyNetwork !== "string") {
    return null;
  }
  if (!Object.hasOwn(ONEKEY_NETWORK_TO_INTERNAL, onekeyNetwork)) {
    return null;
  }
  return ONEKEY_NETWORK_TO_INTERNAL[onekeyNetwork];
}
