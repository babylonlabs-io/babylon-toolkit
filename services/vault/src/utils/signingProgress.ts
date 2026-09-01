/**
 * Feature detection for `IBTCProvider.subscribeSigningProgress` — the optional
 * per-ceremony progress affordance only hardware providers implement
 * (currently the Ledger vault provider). Sibling of `cancelSigning.ts`.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type {
  IBTCProvider,
  SigningProgress,
} from "@babylonlabs-io/wallet-connector";

type SigningProgressListener = (progress: SigningProgress) => void;

/**
 * Subscribes when the provider implements the affordance; otherwise returns a
 * no-op unsubscribe so callers never branch. A subscribe that returns no
 * function throws here, before any device I/O. The SDK's `BitcoinWallet` type
 * omits the connector's optional affordance, hence the cast.
 */
export function observeSigningProgress(
  provider: BitcoinWallet,
  listener: SigningProgressListener,
): () => void {
  const candidate = provider as Pick<IBTCProvider, "subscribeSigningProgress">;
  if (typeof candidate.subscribeSigningProgress !== "function") {
    return () => {};
  }
  const stop = candidate.subscribeSigningProgress(listener);
  // Callers invoke the handle from `finally`; a throw there would mask the real signing error.
  if (typeof stop !== "function") {
    throw new Error(
      `provider.subscribeSigningProgress must return an unsubscribe function; got ${typeof stop}`,
    );
  }
  return stop;
}
