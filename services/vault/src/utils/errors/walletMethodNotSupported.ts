/**
 * Detection of the wallet-connector "method not supported" code.
 *
 * The single definition of "the connected wallet cannot perform a required
 * method", shared by `mapDepositError` and `formatPayoutSignatureError` so the
 * two mappers cannot drift apart. Deliberately dependency-free, mirroring
 * `userCancellation.ts`: the code constant is inlined rather than imported
 * from `@babylonlabs-io/wallet-connector` to keep that bundle out of this
 * module (and its test transform).
 */

import { chainCarriesCode } from "./causeChain";

/**
 * Wallet-connector error code thrown when a wallet does not implement a
 * required method (e.g. `deriveContextHash`). Mirrors
 * `ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED`; if it ever changes upstream,
 * this string must change too (a drift-guard test in formatting.test.ts
 * reads the upstream codes.ts source to enforce that).
 */
const WALLET_METHOD_NOT_SUPPORTED_CODE = "WALLET_METHOD_NOT_SUPPORTED";

/**
 * True when the error — or anything in its `cause` chain — carries the
 * wallet-connector WALLET_METHOD_NOT_SUPPORTED code. Walks `cause` because
 * the deposit flow's broadcast catches re-wrap wallet errors (attaching the
 * original as `cause`) before the mappers see them.
 */
export function isWalletMethodNotSupported(error: unknown): boolean {
  return chainCarriesCode(error, WALLET_METHOD_NOT_SUPPORTED_CODE);
}
