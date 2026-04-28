/**
 * Shared `deriveContextHash` stub for BTC adapters whose underlying
 * wallet does not implement the `deriveContextHash` API specified in
 * `docs/specs/derive-context-hash.md`.
 *
 * Centralizing the throw keeps the wording, error code, and parameter
 * usage consistent across adapters and lets us unit-test the contract
 * without instantiating each provider class (whose modules transitively
 * import asset files that aren't resolvable by the unit-test runner).
 */

import { ERROR_CODES, WalletError } from "@/error";

/**
 * Build a `deriveContextHash` implementation that throws
 * {@link ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED} for `walletName`.
 *
 * The returned function uses both `appName` and `context` in the error
 * message so callers (and logs) can identify what triggered the
 * unsupported call.
 */
export function unsupportedDeriveContextHash(
  walletName: string,
): (appName: string, context: string) => Promise<string> {
  return async (appName: string, context: string): Promise<string> => {
    throw new WalletError({
      code: ERROR_CODES.WALLET_METHOD_NOT_SUPPORTED,
      message: `${walletName} does not support deriveContextHash (requested by app "${appName}", context length ${context.length}). Use a wallet that implements the deriveContextHash specification.`,
      wallet: walletName,
    });
  };
}
