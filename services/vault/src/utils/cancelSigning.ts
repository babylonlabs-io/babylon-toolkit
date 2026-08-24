/**
 * Feature detection for `IBTCProvider.cancelSigning` — the optional
 * device-cancel affordance only hardware providers implement (currently the
 * Ledger vault provider). The interface documents that callers MUST
 * feature-detect; this guard is the one place that probe lives.
 */

import type { IBTCProvider } from "@babylonlabs-io/wallet-connector";

/** A provider that implements the optional cancel affordance. */
export type CancellableSigningProvider = {
  cancelSigning: NonNullable<IBTCProvider["cancelSigning"]>;
};

/**
 * True when the provider that started a sign exposes `cancelSigning`.
 * Takes `unknown` because callers hold the signing provider behind an
 * untyped ref (the SDK's BitcoinWallet wraps the connector provider).
 */
export function supportsCancelSigning(
  provider: unknown,
): provider is CancellableSigningProvider {
  return (
    typeof (provider as { cancelSigning?: unknown } | null)?.cancelSigning ===
    "function"
  );
}
