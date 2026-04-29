/**
 * Internal-only re-exports for the Pre-PegIn / PegIn building blocks.
 * Consumers should depend on `PeginManager`; these helpers exist to
 * keep that file a thin coordinator.
 *
 * @module managers/pegin
 */

export { assertAuthAnchorOpReturn } from "./assertAuthAnchorOpReturn";
export {
  expandPerVaultSecrets,
  type PerVaultExpansionResult,
} from "./expandPerVaultSecrets";
export {
  normalizePopSignature,
  normalizeXOnlyPubkey,
} from "./normalizeWalletInputs";
export { signPsbtsWithFallback } from "./signPsbtsWithFallback";
