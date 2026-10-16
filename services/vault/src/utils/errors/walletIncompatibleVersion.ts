/**
 * Detection of the wallet-connector "incompatible wallet version" code.
 *
 * Deliberately dependency-free, mirroring `walletMethodNotSupported.ts`: the
 * code constant is inlined rather than imported from
 * `@babylonlabs-io/wallet-connector` to keep that bundle out of this module
 * (and its test transform).
 */

import { chainCarriesCode } from "./causeChain";

/**
 * Wallet-connector error code thrown when the connected wallet or its app is
 * below the supported floor, unparseable, or at/above the unsupported ceiling.
 * Mirrors `ERROR_CODES.INCOMPATIBLE_WALLET_VERSION`; this string must track the
 * wallet-connector code.
 */
const WALLET_INCOMPATIBLE_VERSION_CODE = "INCOMPATIBLE_WALLET_VERSION";

/**
 * True when the error — or anything in its `cause` chain — carries the
 * wallet-connector INCOMPATIBLE_WALLET_VERSION code.
 */
export function isWalletIncompatibleVersion(error: unknown): boolean {
  return chainCarriesCode(error, WALLET_INCOMPATIBLE_VERSION_CODE);
}
