/**
 * Feature detection for `IBTCProvider.subscribeSigningProgress` — the optional
 * per-ceremony progress affordance only hardware providers implement
 * (currently the Ledger vault provider). Sibling of `cancelSigning.ts`.
 */

import type {
  IBTCProvider,
  SigningProgress,
} from "@babylonlabs-io/wallet-connector";

type SigningProgressListener = (progress: SigningProgress) => void;

/**
 * Subscribes when the provider implements the affordance; otherwise returns a
 * no-op unsubscribe so callers never branch. Takes `unknown` because callers
 * hold the signing provider behind an untyped ref.
 */
export function observeSigningProgress(
  provider: unknown,
  listener: SigningProgressListener,
): () => void {
  const candidate = provider as Pick<
    IBTCProvider,
    "subscribeSigningProgress"
  > | null;
  return typeof candidate?.subscribeSigningProgress === "function"
    ? candidate.subscribeSigningProgress(listener)
    : () => {};
}
